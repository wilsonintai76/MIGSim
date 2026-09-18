/**
 * @file cohorts.ts
 * @description `/api/cohorts` — training cohorts a class of trainers belongs to.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type {
  AuthUser,
  CohortListResponse,
  CohortMember,
  CohortMemberListResponse,
  CohortSummary,
  UserRole,
} from '../../shared/api';
import type { AppEnv, WorkerEnv } from '../env';
import { errorBody } from '../lib/http';
import { isConstraintViolation } from '../lib/sql';
import { jsonValidator } from '../lib/validate';
import type { JsonBody } from '../lib/validate';
import { requireAuth, requireInstructor } from '../middleware/auth';
import {
  addCohortMemberSchema,
  createCohortSchema,
  updateCohortSchema,
} from '../schemas';

interface CohortRow {
  id: string;
  name: string;
  code: string;
  instructor_id: string;
  created_at: number;
  member_count: number;
  station_count: number;
  pass_count: number;
}

interface CohortMemberRow {
  user_id: string;
  email: string;
  name: string;
  role: UserRole;
  joined_at: number;
}

/** Counts are computed in SQL so the dashboard never fetches every pass. */
const COHORT_SELECT = `
  SELECT c.id, c.name, c.code, c.instructor_id, c.created_at,
         (SELECT COUNT(*) FROM cohort_members m WHERE m.cohort_id = c.id) AS member_count,
         (SELECT COUNT(*) FROM stations s WHERE s.cohort_id = c.id) AS station_count,
         (SELECT COUNT(*) FROM passes p WHERE p.cohort_id = c.id) AS pass_count
    FROM cohorts c`;

function toSummary(row: CohortRow): CohortSummary {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    instructorId: row.instructor_id,
    createdAt: row.created_at,
    memberCount: row.member_count,
    stationCount: row.station_count,
    passCount: row.pass_count,
  };
}

function toMember(row: CohortMemberRow): CohortMember {
  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    joinedAt: row.joined_at,
  };
}

async function findCohort(env: WorkerEnv, id: string): Promise<CohortSummary | null> {
  const row = await env.DB.prepare(`${COHORT_SELECT} WHERE c.id = ?`).bind(id).first<CohortRow>();
  return row ? toSummary(row) : null;
}

/** Instructors oversee every cohort; trainers only the ones they were added to. */
async function isCohortVisible(env: WorkerEnv, user: AuthUser, cohortId: string): Promise<boolean> {
  if (user.role === 'instructor') return true;
  const membership = await env.DB.prepare(
    'SELECT 1 AS ok FROM cohort_members WHERE cohort_id = ? AND user_id = ?',
  )
    .bind(cohortId, user.id)
    .first<{ ok: number }>();
  return membership !== null;
}

const listCohorts = async (c: Context<AppEnv, '/'>) => {
  const user = c.get('user');
  const rows =
    user.role === 'instructor'
      ? await c.env.DB.prepare(`${COHORT_SELECT} ORDER BY c.created_at DESC`).all<CohortRow>()
      : await c.env.DB.prepare(
          `${COHORT_SELECT} JOIN cohort_members m ON m.cohort_id = c.id AND m.user_id = ?
            ORDER BY c.created_at DESC`,
        )
          .bind(user.id)
          .all<CohortRow>();

  return c.json<CohortListResponse>({ cohorts: (rows.results ?? []).map(toSummary) }, 200);
};

const createCohort = async (c: Context<AppEnv, '/', JsonBody<typeof createCohortSchema>>) => {
  const caller = c.get('user');
  const { name, code } = c.req.valid('json');
  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    await c.env.DB.prepare(
      `INSERT INTO cohorts (id, name, code, instructor_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, name, code, caller.id, now, now)
      .run();
  } catch (error) {
    if (isConstraintViolation(error)) {
      return c.json(errorBody('conflict', `Cohort code ${code} is already in use`), 409);
    }
    throw error;
  }

  const summary = await findCohort(c.env, id);
  if (!summary) {
    return c.json(errorBody('internal_error', 'Cohort could not be read back'), 500);
  }
  return c.json<CohortSummary>(summary, 201);
};

const getCohort = async (c: Context<AppEnv, '/:id'>) => {
  const id = c.req.param('id');
  const summary = await findCohort(c.env, id);
  if (!summary) {
    return c.json(errorBody('not_found', 'Cohort not found'), 404);
  }
  if (!(await isCohortVisible(c.env, c.get('user'), id))) {
    return c.json(errorBody('forbidden', 'You are not a member of this cohort'), 403);
  }
  return c.json<CohortSummary>(summary, 200);
};

const updateCohort = async (c: Context<AppEnv, '/:id', JsonBody<typeof updateCohortSchema>>) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const updates: string[] = [];
  const bindings: (string | number)[] = [];
  if (body.name !== undefined) {
    updates.push('name = ?');
    bindings.push(body.name);
  }
  if (body.code !== undefined) {
    updates.push('code = ?');
    bindings.push(body.code);
  }
  if (updates.length === 0) {
    return c.json(errorBody('bad_request', 'Provide a name or a code to update'), 400);
  }
  updates.push('updated_at = ?');
  bindings.push(Date.now());

  let changed: number;
  try {
    const result = await c.env.DB.prepare(`UPDATE cohorts SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...bindings, id)
      .run();
    changed = result.meta.changes ?? 0;
  } catch (error) {
    if (isConstraintViolation(error)) {
      return c.json(errorBody('conflict', 'That cohort code is already in use'), 409);
    }
    throw error;
  }

  if (changed === 0) {
    return c.json(errorBody('not_found', 'Cohort not found'), 404);
  }

  const summary = await findCohort(c.env, id);
  if (!summary) {
    return c.json(errorBody('not_found', 'Cohort not found'), 404);
  }
  return c.json<CohortSummary>(summary, 200);
};

const deleteCohort = async (c: Context<AppEnv, '/:id'>) => {
  const result = await c.env.DB.prepare('DELETE FROM cohorts WHERE id = ?')
    .bind(c.req.param('id'))
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    return c.json(errorBody('not_found', 'Cohort not found'), 404);
  }
  return c.body(null, 204);
};

const listCohortMembers = async (c: Context<AppEnv, '/:id/members'>) => {
  const id = c.req.param('id');
  const summary = await findCohort(c.env, id);
  if (!summary) {
    return c.json(errorBody('not_found', 'Cohort not found'), 404);
  }
  if (!(await isCohortVisible(c.env, c.get('user'), id))) {
    return c.json(errorBody('forbidden', 'You are not a member of this cohort'), 403);
  }

  const rows = await c.env.DB.prepare(
    `SELECT u.id AS user_id, u.email, u.name, u.role, m.joined_at
       FROM cohort_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.cohort_id = ?
      ORDER BY u.name`,
  )
    .bind(id)
    .all<CohortMemberRow>();

  return c.json<CohortMemberListResponse>(
    { members: (rows.results ?? []).map(toMember) },
    200,
  );
};

const addCohortMember = async (
  c: Context<AppEnv, '/:id/members', JsonBody<typeof addCohortMemberSchema>>,
) => {
  const id = c.req.param('id');
  const { email } = c.req.valid('json');

  const summary = await findCohort(c.env, id);
  if (!summary) {
    return c.json(errorBody('not_found', 'Cohort not found'), 404);
  }

  const member = await c.env.DB.prepare(
    'SELECT id AS user_id, email, name, role FROM users WHERE email = ?',
  )
    .bind(email)
    .first<Omit<CohortMemberRow, 'joined_at'>>();

  if (!member) {
    // Accounts are created by an instructor first, then attached to a cohort.
    return c.json(
      errorBody('not_found', `No account exists for ${email}. Create the account first.`),
      404,
    );
  }

  const joinedAt = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO cohort_members (cohort_id, user_id, joined_at)
     VALUES (?, ?, ?)
     ON CONFLICT (cohort_id, user_id) DO NOTHING`,
  )
    .bind(id, member.user_id, joinedAt)
    .run();

  return c.json<CohortMember>(toMember({ ...member, joined_at: joinedAt }), 201);
};

const removeCohortMember = async (c: Context<AppEnv, '/:id/members/:userId'>) => {
  const result = await c.env.DB.prepare(
    'DELETE FROM cohort_members WHERE cohort_id = ? AND user_id = ?',
  )
    .bind(c.req.param('id'), c.req.param('userId'))
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return c.json(errorBody('not_found', 'That account is not a member of this cohort'), 404);
  }
  return c.body(null, 204);
};

const cohorts = new Hono<AppEnv>()
  .get('/', requireAuth, listCohorts)
  .post('/', requireInstructor, jsonValidator(createCohortSchema), createCohort)
  .get('/:id', requireAuth, getCohort)
  .patch('/:id', requireInstructor, jsonValidator(updateCohortSchema), updateCohort)
  .delete('/:id', requireInstructor, deleteCohort)
  .get('/:id/members', requireAuth, listCohortMembers)
  .post('/:id/members', requireInstructor, jsonValidator(addCohortMemberSchema), addCohortMember)
  .delete('/:id/members/:userId', requireInstructor, removeCohortMember);

export default cohorts;
