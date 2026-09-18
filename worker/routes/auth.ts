/**
 * @file auth.ts
 * @description `/api/auth/*` — registration, sign-in, sign-out, password change.
 */

import type { Context } from 'hono';
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { sign } from 'hono/jwt';
import type { AuthResponse, AuthUser, UserRole } from '../../shared/api';
import type { AppEnv, WorkerEnv } from '../env';
import { errorBody } from '../lib/http';
import { hashPassword, verifyPassword } from '../lib/password';
import { jsonValidator } from '../lib/validate';
import type { JsonBody } from '../lib/validate';
import {
  JWT_ALGORITHM,
  JWT_ISSUER,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  cookieOptions,
  hashIp,
  requireAuth,
  resolveSession,
} from '../middleware/auth';
import { changePasswordSchema, loginSchema, registerSchema } from '../schemas';

/** Failures per email inside the window before sign-in is temporarily blocked. */
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
}

/**
 * Validation failures return 400 responses whose body carries zod's issue list
 * (`worker/lib/validate.ts`); the shapes below describe the route-level errors.
 */
function toAuthUser(row: Pick<UserRow, 'id' | 'email' | 'name' | 'role'>): AuthUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

/** Throws when a deployment forgot `wrangler secret put JWT_SECRET`. */
function assertConfigured(env: WorkerEnv): boolean {
  return typeof env.JWT_SECRET === 'string' && env.JWT_SECRET.length >= 16;
}

async function issueSession(
  c: Context<AppEnv>,
  user: AuthUser,
  userAgent: string | null,
): Promise<void> {
  const sessionId = crypto.randomUUID();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + SESSION_TTL_SECONDS * 1000;

  const token = await sign(
    {
      sub: user.id,
      sid: sessionId,
      iss: JWT_ISSUER,
      iat: Math.floor(issuedAt / 1000),
      exp: Math.floor(expiresAt / 1000),
    },
    c.env.JWT_SECRET,
    JWT_ALGORITHM,
  );

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, revoked_at, user_agent, ip_hash)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
  )
    .bind(
      sessionId,
      user.id,
      issuedAt,
      expiresAt,
      userAgent?.slice(0, 300) ?? null,
      await hashIp(c.req.header('CF-Connecting-IP')),
    )
    .run();

  setCookie(c, SESSION_COOKIE, token, cookieOptions(c));
}

/**
 * Bootstrap-aware registration: while no accounts exist the first caller becomes
 * an instructor without credentials (there is nobody to authorise them yet).
 * After that, only an authenticated instructor may create accounts.
 */
const register = async (c: Context<AppEnv, '/register', JsonBody<typeof registerSchema>>) => {
  if (!assertConfigured(c.env)) {
    return c.json(errorBody('internal_error', 'Server is missing its JWT secret'), 500);
  }

  const body = c.req.valid('json');
  const existing = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM users').first<{
    total: number;
  }>();
  const isBootstrap = (existing?.total ?? 0) === 0;

  let role: UserRole = body.role;
  if (isBootstrap) {
    role = 'instructor';
  } else {
    const caller = await resolveSession(c);
    if (!caller) {
      return c.json(errorBody('unauthorized', 'Sign in to create accounts'), 401);
    }
    if (caller.user.role !== 'instructor') {
      return c.json(errorBody('forbidden', 'Instructor role required'), 403);
    }
  }

  const duplicate = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(body.email)
    .first<{ id: string }>();
  if (duplicate) {
    return c.json(errorBody('conflict', 'An account with that email already exists'), 409);
  }

  const now = Date.now();
  const user: AuthUser = {
    id: crypto.randomUUID(),
    email: body.email,
    name: body.name,
    role,
  };
  const password = await hashPassword(body.password);

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, password_iterations, name, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      user.id,
      user.email,
      password.hash,
      password.salt,
      password.iterations,
      user.name,
      user.role,
      now,
      now,
    )
    .run();

  // Only the bootstrap account gets signed in automatically; an instructor
  // creating accounts must not have their own session replaced.
  if (isBootstrap) {
    await issueSession(c, user, c.req.header('User-Agent') ?? null);
  }

  return c.json<AuthResponse>({ user }, 201);
};

const login = async (c: Context<AppEnv, '/login', JsonBody<typeof loginSchema>>) => {
  if (!assertConfigured(c.env)) {
    return c.json(errorBody('internal_error', 'Server is missing its JWT secret'), 500);
  }

  const { email, password } = c.req.valid('json');
  const windowStart = Date.now() - LOGIN_WINDOW_MS;

  const throttle = await c.env.DB.prepare(
    `SELECT COUNT(*) AS failures, MIN(attempted_at) AS oldest
       FROM login_attempts
      WHERE email = ? AND succeeded = 0 AND attempted_at > ?`,
  )
    .bind(email, windowStart)
    .first<{ failures: number; oldest: number | null }>();

  if ((throttle?.failures ?? 0) >= MAX_LOGIN_FAILURES) {
    const unlockAt = (throttle?.oldest ?? Date.now()) + LOGIN_WINDOW_MS;
    const retryAfterSeconds = Math.max(1, Math.ceil((unlockAt - Date.now()) / 1000));
    return c.json(
      errorBody('rate_limited', 'Too many failed sign-in attempts. Try again shortly.', {
        retryAfterSeconds,
      }),
      429,
    );
  }

  const user = await c.env.DB.prepare(
    `SELECT id, email, name, role, password_hash, password_salt, password_iterations
       FROM users WHERE email = ?`,
  )
    .bind(email)
    .first<UserRow>();

  const passwordOk =
    user !== null &&
    (await verifyPassword(password, {
      hash: user.password_hash,
      salt: user.password_salt,
      iterations: user.password_iterations,
    }));

  const ipHash = await hashIp(c.req.header('CF-Connecting-IP'));
  await c.env.DB.prepare(
    'INSERT INTO login_attempts (email, ip_hash, attempted_at, succeeded) VALUES (?, ?, ?, ?)',
  )
    .bind(email, ipHash, Date.now(), passwordOk ? 1 : 0)
    .run();

  if (!user || !passwordOk) {
    return c.json(errorBody('unauthorized', 'Incorrect email or password'), 401);
  }

  // Successful sign-in clears the failure history for this email.
  await c.env.DB.prepare('DELETE FROM login_attempts WHERE email = ? AND succeeded = 0')
    .bind(email)
    .run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(Date.now()).run();

  const authUser = toAuthUser(user);
  await issueSession(c, authUser, c.req.header('User-Agent') ?? null);
  return c.json<AuthResponse>({ user: authUser }, 200);
};

const logout = async (c: Context<AppEnv, '/logout'>) => {
  const session = await resolveSession(c);
  if (session) {
    await c.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?')
      .bind(Date.now(), session.sessionId)
      .run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.body(null, 204);
};

const getCurrentUser = (c: Context<AppEnv, '/me'>) => {
  return c.json<AuthResponse>({ user: c.get('user') }, 200);
};

const changePassword = async (
  c: Context<AppEnv, '/password', JsonBody<typeof changePasswordSchema>>,
) => {
  const { currentPassword, newPassword } = c.req.valid('json');
  const caller = c.get('user');

  const row = await c.env.DB.prepare(
    'SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?',
  )
    .bind(caller.id)
    .first<Pick<UserRow, 'password_hash' | 'password_salt' | 'password_iterations'>>();

  if (!row) {
    return c.json(errorBody('not_found', 'Account not found'), 404);
  }

  const ok = await verifyPassword(currentPassword, {
    hash: row.password_hash,
    salt: row.password_salt,
    iterations: row.password_iterations,
  });
  if (!ok) {
    return c.json(errorBody('unauthorized', 'Current password is incorrect'), 401);
  }

  const password = await hashPassword(newPassword);
  await c.env.DB.prepare(
    `UPDATE users
        SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ?
      WHERE id = ?`,
  )
    .bind(password.hash, password.salt, password.iterations, Date.now(), caller.id)
    .run();

  // Every other session is invalidated; the caller keeps working from this one.
  await c.env.DB.prepare(
    'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL',
  )
    .bind(Date.now(), caller.id, c.get('sessionId'))
    .run();

  return c.json<AuthResponse>({ user: caller }, 200);
};

const auth = new Hono<AppEnv>()
  .post('/register', jsonValidator(registerSchema), register)
  .post('/login', jsonValidator(loginSchema), login)
  .post('/logout', logout)
  .get('/me', requireAuth, getCurrentUser)
  .post('/password', requireAuth, jsonValidator(changePasswordSchema), changePassword);

export default auth;
