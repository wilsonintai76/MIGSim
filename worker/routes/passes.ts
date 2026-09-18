/**
 * @file passes.ts
 * @description `/api/passes` — batch pass sync, paged history and instructor grading.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type {
  AuthUser,
  PassListResponse,
  PassSyncResult,
  SyncPassesResponse,
  WeldPassRecord,
} from '../../shared/api';
import type { AppEnv, WorkerEnv } from '../env';
import { errorBody } from '../lib/http';
import {
  PASS_UPSERT_SQL,
  passColumns,
  passInsertBindings,
  rowToPassRecord,
  type PassRow,
} from '../lib/passRecord';
import { placeholders } from '../lib/sql';
import { jsonValidator, queryValidator } from '../lib/validate';
import type { JsonBody, QueryBody } from '../lib/validate';
import { canAccessUser, requireAuth, requireInstructor } from '../middleware/auth';
import { gradePassSchema, passListQuerySchema, syncPassesSchema } from '../schemas';

/** A pass may reference a cohort/station; unresolvable references are stored as NULL. */
interface Placement {
  cohortId: string | null;
  stationId: string | null;
}

/**
 * Resolves the placement of a whole batch with three queries instead of three per
 * pass. A reference the caller cannot prove membership of is dropped rather than
 * failing the batch, so an offline queue recorded against a station that has since
 * been deleted still syncs.
 */
async function resolvePlacements(
  env: WorkerEnv,
  incoming: { cohortId?: string; stationId?: string }[],
  user: AuthUser,
): Promise<Placement[]> {
  const stationIds = [
    ...new Set(incoming.map((pass) => pass.stationId).filter((id): id is string => Boolean(id))),
  ];
  const stationRows = stationIds.length
    ? (
        await env.DB.prepare(
          `SELECT id, cohort_id FROM stations WHERE id IN (${placeholders(stationIds.length)})`,
        )
          .bind(...stationIds)
          .all<{ id: string; cohort_id: string | null }>()
      ).results ?? []
    : [];
  const stationCohortById = new Map(stationRows.map((row) => [row.id, row.cohort_id]));

  const candidateCohortIds = new Set<string>();
  for (const pass of incoming) {
    const stationCohort = pass.stationId ? stationCohortById.get(pass.stationId) : undefined;
    if (stationCohort) candidateCohortIds.add(stationCohort);
    if (pass.cohortId) candidateCohortIds.add(pass.cohortId);
  }

  const candidateIds = [...candidateCohortIds];
  const existingCohorts = new Set(
    candidateIds.length
      ? (
          await env.DB.prepare(
            `SELECT id FROM cohorts WHERE id IN (${placeholders(candidateIds.length)})`,
          )
            .bind(...candidateIds)
            .all<{ id: string }>()
        ).results?.map((row) => row.id) ?? []
      : [],
  );

  let memberOf = new Set<string>();
  if (user.role !== 'instructor') {
    const memberships = await env.DB.prepare(
      'SELECT cohort_id FROM cohort_members WHERE user_id = ?',
    )
      .bind(user.id)
      .all<{ cohort_id: string }>();
    memberOf = new Set((memberships.results ?? []).map((row) => row.cohort_id));
  }

  const allowedCohort = (cohortId: string | null): string | null => {
    if (!cohortId || !existingCohorts.has(cohortId)) return null;
    return user.role === 'instructor' || memberOf.has(cohortId) ? cohortId : null;
  };

  return incoming.map((pass) => {
    const stationId = pass.stationId && stationCohortById.has(pass.stationId) ? pass.stationId : null;
    const stationCohort = stationId ? stationCohortById.get(stationId) ?? null : null;
    return { stationId, cohortId: allowedCohort(stationCohort ?? pass.cohortId ?? null) };
  });
}

/**
 * Batch sync. Replaces the old one-request-per-pass endpoint: a pass carries up to
 * 300 torch samples, so batching keeps a queued session to a handful of requests.
 */
const syncPasses = async (c: Context<AppEnv, '/', JsonBody<typeof syncPassesSchema>>) => {
  const user = c.get('user');
  const { passes: incoming } = c.req.valid('json');
  const syncedAt = Date.now();

  // One ownership pre-query for the batch: a client-generated id that already
  // belongs to another account is rejected instead of being overwritten.
  const incomingIds = incoming.map((pass) => pass.id);
  const owners = await c.env.DB.prepare(
    `SELECT id, user_id FROM passes WHERE id IN (${placeholders(incomingIds.length)})`,
  )
    .bind(...incomingIds)
    .all<{ id: string; user_id: string }>();
  const ownerById = new Map((owners.results ?? []).map((row) => [row.id, row.user_id]));

  const placements = await resolvePlacements(c.env, incoming, user);

  const results: PassSyncResult[] = [];
  const statements: D1PreparedStatement[] = [];

  incoming.forEach((pass, index) => {
    const ownerId = ownerById.get(pass.id);
    if (ownerId && ownerId !== user.id) {
      results.push({ id: pass.id, status: 'rejected', error: 'Pass belongs to another account' });
      return;
    }

    statements.push(
      c.env.DB.prepare(PASS_UPSERT_SQL).bind(
        ...passInsertBindings(
          // The schema validates every column this INSERT reads and passes the rest
          // through untouched (`z.looseObject`), so the record is complete at runtime
          // even though its inferred type only names the columns we index on.
          pass as unknown as WeldPassRecord,
          { ownerId: user.id, ...placements[index] },
          syncedAt,
        ),
      ),
    );
    results.push({ id: pass.id, status: ownerId ? 'updated' : 'created' });
  });

  if (statements.length > 0) {
    try {
      await c.env.DB.batch(statements);
    } catch (error) {
      // A D1 batch is a transaction, so nothing was written: answering 5xx keeps
      // the whole batch in the client's queue for a later retry.
      console.error('Pass sync batch failed', error);
      return c.json(errorBody('internal_error', 'Could not store this sync batch'), 500);
    }
  }

  return c.json<SyncPassesResponse>({ syncedAt, results }, 200);
};

/** Paged history. Instructors see the whole shop floor, trainers only their own passes. */
const listPasses = async (c: Context<AppEnv, '/', QueryBody<typeof passListQuerySchema>>) => {
  const user = c.get('user');
  const query = c.req.valid('query');

  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (user.role !== 'instructor') {
    conditions.push('p.user_id = ?');
    bindings.push(user.id);
  }
  if (query.before !== undefined) {
    conditions.push('p.performed_at < ?');
    bindings.push(query.before);
  }
  if (query.cohortId) {
    conditions.push('p.cohort_id = ?');
    bindings.push(query.cohortId);
  }
  if (query.studentName) {
    conditions.push('p.student_name = ?');
    bindings.push(query.studentName);
  }
  if (query.grade === 'PENDING') {
    // Passes that were never graded have a NULL grade, so "pending" has to match both.
    conditions.push("(p.instructor_grade IS NULL OR p.instructor_grade = 'PENDING')");
  } else if (query.grade) {
    conditions.push('p.instructor_grade = ?');
    bindings.push(query.grade);
  }
  if (query.minScore !== undefined) {
    conditions.push('p.overall_score >= ?');
    bindings.push(query.minScore);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await c.env.DB.prepare(
    `SELECT ${passColumns('p')} FROM passes p ${where} ORDER BY p.performed_at DESC LIMIT ?`,
  )
    .bind(...bindings, query.limit)
    .all<PassRow>();

  const rawRows = rows.results ?? [];
  const records: WeldPassRecord[] = [];
  for (const row of rawRows) {
    try {
      records.push(rowToPassRecord(row));
    } catch (error) {
      // A single unreadable payload must not take the whole history view down.
      console.error('Skipping unreadable pass row', row.id, error);
    }
  }

  const lastRow = rawRows[rawRows.length - 1];
  const nextBefore = rawRows.length === query.limit && lastRow ? lastRow.performed_at : null;

  return c.json<PassListResponse>({ passes: records, nextBefore }, 200);
};

const getPass = async (c: Context<AppEnv, '/:id'>) => {
  const row = await c.env.DB.prepare(
    `SELECT ${passColumns('p')} FROM passes p WHERE p.id = ?`,
  )
    .bind(c.req.param('id'))
    .first<PassRow>();

  if (!row) {
    return c.json(errorBody('not_found', 'Pass not found'), 404);
  }
  if (!canAccessUser(c.get('user'), row.user_id)) {
    return c.json(errorBody('forbidden', 'This pass belongs to another account'), 403);
  }

  return c.json<WeldPassRecord>(rowToPassRecord(row), 200);
};

const gradePass = async (c: Context<AppEnv, '/:id/grade', JsonBody<typeof gradePassSchema>>) => {
  const grader = c.get('user');
  const { grade, notes } = c.req.valid('json');
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare('SELECT id FROM passes WHERE id = ?')
    .bind(id)
    .first<{ id: string }>();
  if (!existing) {
    return c.json(errorBody('not_found', 'Pass not found'), 404);
  }

  // An omitted `notes` keeps whatever the instructor wrote before.
  await c.env.DB.prepare(
    `UPDATE passes
        SET instructor_grade = ?,
            instructor_notes = COALESCE(?, instructor_notes),
            graded_by = ?,
            graded_at = ?
      WHERE id = ?`,
  )
    .bind(grade, notes ?? null, grader.name, Date.now(), id)
    .run();

  const row = await c.env.DB.prepare(
    `SELECT ${passColumns('p')} FROM passes p WHERE p.id = ?`,
  )
    .bind(id)
    .first<PassRow>();

  if (!row) {
    return c.json(errorBody('not_found', 'Pass not found'), 404);
  }

  return c.json<WeldPassRecord>(rowToPassRecord(row), 200);
};

const passes = new Hono<AppEnv>()
  .post('/', requireAuth, jsonValidator(syncPassesSchema), syncPasses)
  .get('/', requireAuth, queryValidator(passListQuerySchema), listPasses)
  .get('/:id', requireAuth, getPass)
  .patch('/:id/grade', requireInstructor, jsonValidator(gradePassSchema), gradePass);

export default passes;
