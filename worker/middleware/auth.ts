/**
 * @file auth.ts
 * @description Session authentication for the Worker API.
 *
 * Sessions are stateless JWTs (HS256) whose `sid` claim is checked against the
 * `sessions` table on every request, so logout and password changes revoke a
 * token immediately instead of waiting out its lifetime.
 */

import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import type { AuthUser, UserRole } from '../../shared/api';
import type { AppEnv } from '../env';
import { errorBody, sha256Hex } from '../lib/http';

export const SESSION_COOKIE = 'migsim_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const JWT_ALGORITHM = 'HS256' as const;
export const JWT_ISSUER = 'migsim-api';

export interface SessionRecord {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: UserRole;
  expires_at: number;
  revoked_at: number | null;
}

export interface ResolvedSession {
  user: AuthUser;
  sessionId: string;
}

/** Reads the bearer/cookie token without validating it. */
function readSessionToken(c: Context<AppEnv>): string | null {
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token) return token;
  }
  return getCookie(c, SESSION_COOKIE) ?? null;
}

/**
 * Resolves the caller, or `null` when the request is anonymous/invalid.
 * Exported for routes that need to branch on identity (e.g. the first-run
 * bootstrap in `POST /api/auth/register`).
 */
export async function resolveSession(c: Context<AppEnv>): Promise<ResolvedSession | null> {
  const token = readSessionToken(c);
  if (!token) return null;

  let claims: Record<string, unknown>;
  try {
    claims = await verify(token, c.env.JWT_SECRET, {
      alg: JWT_ALGORITHM,
      iss: JWT_ISSUER,
    });
  } catch {
    return null;
  }

  const sessionId = claims.sid;
  const userId = claims.sub;
  if (typeof sessionId !== 'string' || typeof userId !== 'string') return null;

  const session = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.expires_at, s.revoked_at, u.email, u.name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.user_id = ?`,
  )
    .bind(sessionId, userId)
    .first<SessionRecord>();

  if (!session || session.revoked_at !== null) return null;
  if (session.expires_at <= Date.now()) return null;

  return {
    sessionId: session.id,
    user: {
      id: session.user_id,
      email: session.email,
      name: session.name,
      role: session.role,
    },
  };
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await resolveSession(c);
  if (!session) {
    return c.json(errorBody('unauthorized', 'Sign in to continue'), 401);
  }
  c.set('user', session.user);
  c.set('sessionId', session.sessionId);
  await next();
});

export const requireInstructor = createMiddleware<AppEnv>(async (c, next) => {
  const session = await resolveSession(c);
  if (!session) {
    return c.json(errorBody('unauthorized', 'Sign in to continue'), 401);
  }
  if (session.user.role !== 'instructor') {
    return c.json(errorBody('forbidden', 'Instructor role required'), 403);
  }
  c.set('user', session.user);
  c.set('sessionId', session.sessionId);
  await next();
});

/**
 * Whether the caller may read or grade the given owner's data.
 * Instructors see the whole shop floor; trainers see only their own passes.
 */
export function canAccessUser(caller: AuthUser, ownerId: string): boolean {
  return caller.role === 'instructor' || caller.id === ownerId;
}

export async function hashIp(ip: string | undefined): Promise<string | null> {
  if (!ip) return null;
  return sha256Hex(ip);
}

/**
 * Cookie flags for the session JWT. `Secure` is scoped to https because browsers
 * silently drop it on plain-HTTP LAN origins — the simulator is driven from a
 * phone during development, where `http://192.168.x.x:3000` is the norm.
 */
export function cookieOptions(c: Context<AppEnv>) {
  const isHttps = new URL(c.req.url).protocol === 'https:';
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: isHttps,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}
