/**
 * @file stations.ts
 * @description `/api/stations` — welding booths and their live aggregate performance.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type {
  StationListResponse,
  StationRecord,
  StationStatus,
} from '../../shared/api';
import type { AppEnv, WorkerEnv } from '../env';
import { errorBody } from '../lib/http';
import { isConstraintViolation } from '../lib/sql';
import { jsonValidator, queryValidator } from '../lib/validate';
import type { JsonBody, QueryBody } from '../lib/validate';
import { requireAuth, requireInstructor } from '../middleware/auth';
import { createStationSchema, stationListQuerySchema, updateStationSchema } from '../schemas';

interface StationRow {
  id: string;
  cohort_id: string | null;
  name: string;
  station_number: number;
  status: StationStatus;
  current_wps_id: string | null;
  last_pass_at: number | null;
  last_score: number | null;
  avg_score: number;
  completed_passes: number;
}

/** Booth metrics are derived from `passes` in SQL so the client receives ready numbers. */
const STATION_SELECT = `
  SELECT s.id, s.cohort_id, s.name, s.station_number, s.status, s.current_wps_id,
         (SELECT MAX(p.performed_at) FROM passes p WHERE p.station_id = s.id) AS last_pass_at,
         (SELECT p.overall_score FROM passes p WHERE p.station_id = s.id
           ORDER BY p.performed_at DESC LIMIT 1) AS last_score,
         COALESCE((SELECT AVG(p.overall_score) FROM passes p WHERE p.station_id = s.id), 0) AS avg_score,
         (SELECT COUNT(*) FROM passes p
           WHERE p.station_id = s.id AND p.instructor_grade = 'PASS') AS completed_passes
    FROM stations s`;

function toStation(row: StationRow): StationRecord {
  return {
    id: row.id,
    cohortId: row.cohort_id,
    name: row.name,
    stationNumber: row.station_number,
    status: row.status,
    currentWpsId: row.current_wps_id,
    lastPassAt: row.last_pass_at,
    lastScore: row.last_score,
    avgScore: row.avg_score,
    completedPasses: row.completed_passes,
  };
}

async function findStation(env: WorkerEnv, id: string): Promise<StationRecord | null> {
  const row = await env.DB.prepare(`${STATION_SELECT} WHERE s.id = ?`)
    .bind(id)
    .first<StationRow>();
  return row ? toStation(row) : null;
}

/** Returns an error message when a referenced cohort/WPS does not exist. */
async function findMissingReference(
  env: WorkerEnv,
  cohortId: string | null | undefined,
  wpsId: string | null | undefined,
): Promise<string | null> {
  if (cohortId) {
    const cohort = await env.DB.prepare('SELECT 1 AS ok FROM cohorts WHERE id = ?')
      .bind(cohortId)
      .first<{ ok: number }>();
    if (!cohort) return `Unknown cohort ${cohortId}`;
  }
  if (wpsId) {
    const wps = await env.DB.prepare('SELECT 1 AS ok FROM wps_procedures WHERE id = ?')
      .bind(wpsId)
      .first<{ ok: number }>();
    if (!wps) return `Unknown WPS procedure ${wpsId}`;
  }
  return null;
}

const listStations = async (c: Context<AppEnv, '/', QueryBody<typeof stationListQuerySchema>>) => {
  const user = c.get('user');
  const { cohortId } = c.req.valid('query');

  const conditions: string[] = [];
  const bindings: string[] = [];

  if (cohortId) {
    conditions.push('s.cohort_id = ?');
    bindings.push(cohortId);
  }
  if (user.role !== 'instructor') {
    // Trainers see their own cohorts' booths plus booths that are not yet assigned.
    conditions.push(
      '(s.cohort_id IS NULL OR s.cohort_id IN (SELECT cohort_id FROM cohort_members WHERE user_id = ?))',
    );
    bindings.push(user.id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await c.env.DB.prepare(
    `${STATION_SELECT} ${where} ORDER BY s.station_number`,
  )
    .bind(...bindings)
    .all<StationRow>();

  return c.json<StationListResponse>({ stations: (rows.results ?? []).map(toStation) }, 200);
};

const createStation = async (c: Context<AppEnv, '/', JsonBody<typeof createStationSchema>>) => {
  const body = c.req.valid('json');

  const missing = await findMissingReference(c.env, body.cohortId, body.currentWpsId);
  if (missing) {
    return c.json(errorBody('bad_request', missing), 400);
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    await c.env.DB.prepare(
      `INSERT INTO stations
         (id, cohort_id, name, station_number, status, current_wps_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        body.cohortId ?? null,
        body.name,
        body.stationNumber,
        body.status,
        body.currentWpsId ?? null,
        now,
        now,
      )
      .run();
  } catch (error) {
    if (isConstraintViolation(error)) {
      return c.json(
        errorBody('conflict', `Station number ${body.stationNumber} is already taken in that cohort`),
        409,
      );
    }
    throw error;
  }

  const station = await findStation(c.env, id);
  if (!station) {
    return c.json(errorBody('internal_error', 'Station could not be read back'), 500);
  }
  return c.json<StationRecord>(station, 201);
};

const getStation = async (c: Context<AppEnv, '/:id'>) => {
  const station = await findStation(c.env, c.req.param('id'));
  if (!station) {
    return c.json(errorBody('not_found', 'Station not found'), 404);
  }
  return c.json<StationRecord>(station, 200);
};

const updateStation = async (c: Context<AppEnv, '/:id', JsonBody<typeof updateStationSchema>>) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const existing = await c.env.DB.prepare('SELECT id FROM stations WHERE id = ?')
    .bind(id)
    .first<{ id: string }>();
  if (!existing) {
    return c.json(errorBody('not_found', 'Station not found'), 404);
  }

  const missing = await findMissingReference(c.env, body.cohortId, body.currentWpsId);
  if (missing) {
    return c.json(errorBody('bad_request', missing), 400);
  }

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];
  if (body.name !== undefined) {
    updates.push('name = ?');
    bindings.push(body.name);
  }
  if (body.stationNumber !== undefined) {
    updates.push('station_number = ?');
    bindings.push(body.stationNumber);
  }
  if (body.status !== undefined) {
    updates.push('status = ?');
    bindings.push(body.status);
  }
  // `null` unassigns, `undefined` leaves the current value alone.
  if (body.cohortId !== undefined) {
    updates.push('cohort_id = ?');
    bindings.push(body.cohortId);
  }
  if (body.currentWpsId !== undefined) {
    updates.push('current_wps_id = ?');
    bindings.push(body.currentWpsId);
  }
  if (updates.length === 0) {
    return c.json(errorBody('bad_request', 'Provide at least one field to update'), 400);
  }
  updates.push('updated_at = ?');
  bindings.push(Date.now());

  try {
    await c.env.DB.prepare(`UPDATE stations SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...bindings, id)
      .run();
  } catch (error) {
    if (isConstraintViolation(error)) {
      return c.json(errorBody('conflict', 'That station number is already taken in that cohort'), 409);
    }
    throw error;
  }

  const station = await findStation(c.env, id);
  if (!station) {
    return c.json(errorBody('not_found', 'Station not found'), 404);
  }
  return c.json<StationRecord>(station, 200);
};

const deleteStation = async (c: Context<AppEnv, '/:id'>) => {
  const result = await c.env.DB.prepare('DELETE FROM stations WHERE id = ?')
    .bind(c.req.param('id'))
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    return c.json(errorBody('not_found', 'Station not found'), 404);
  }
  return c.body(null, 204);
};

const stations = new Hono<AppEnv>()
  .get('/', requireAuth, queryValidator(stationListQuerySchema), listStations)
  .post('/', requireInstructor, jsonValidator(createStationSchema), createStation)
  .get('/:id', requireAuth, getStation)
  .patch('/:id', requireInstructor, jsonValidator(updateStationSchema), updateStation)
  .delete('/:id', requireInstructor, deleteStation);

export default stations;
