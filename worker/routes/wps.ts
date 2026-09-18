/**
 * @file wps.ts
 * @description `/api/wps` — shop-wide library of welding procedure specifications.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { WpsProcedureInput, WpsListResponse } from '../../shared/api';
import type {
  JointType,
  MaterialType,
  ShieldingGas,
  WeldingPosition,
  WPSProcedure,
} from '../../shared/types';
import type { AppEnv } from '../env';
import { errorBody } from '../lib/http';
import { isConstraintViolation } from '../lib/sql';
import { jsonValidator } from '../lib/validate';
import type { JsonBody } from '../lib/validate';
import { requireAuth, requireInstructor } from '../middleware/auth';
import { createWpsSchema } from '../schemas';

interface WpsRow {
  id: string;
  owner_id: string;
  code: string;
  title: string;
  standard: string;
  joint_type: JointType;
  welding_position: WeldingPosition;
  material: MaterialType;
  material_thickness_mm: number;
  wire_diameter_mm: number;
  shielding_gas: ShieldingGas;
  voltage_v: number;
  voltage_tolerance_v: number;
  current_a: number;
  current_tolerance_a: number;
  wire_feed_speed_m_min: number;
  wire_feed_speed_tolerance: number;
  stickout_mm: number;
  travel_speed_min_mm_s: number;
  travel_speed_max_mm_s: number;
  travel_angle_min_deg: number;
  travel_angle_max_deg: number;
  work_angle_deg: number;
  notes: string;
}

const WPS_COLUMNS = [
  'id',
  'owner_id',
  'code',
  'title',
  'standard',
  'joint_type',
  'welding_position',
  'material',
  'material_thickness_mm',
  'wire_diameter_mm',
  'shielding_gas',
  'voltage_v',
  'voltage_tolerance_v',
  'current_a',
  'current_tolerance_a',
  'wire_feed_speed_m_min',
  'wire_feed_speed_tolerance',
  'stickout_mm',
  'travel_speed_min_mm_s',
  'travel_speed_max_mm_s',
  'travel_angle_min_deg',
  'travel_angle_max_deg',
  'work_angle_deg',
  'notes',
  'created_at',
  'updated_at',
] as const;

type WpsColumn = (typeof WPS_COLUMNS)[number];

/** Never rewritten by the upsert: the id, the creator and the creation time. */
const IMMUTABLE_COLUMNS: WpsColumn[] = ['id', 'owner_id', 'created_at'];
const MUTABLE_COLUMNS = WPS_COLUMNS.filter((column) => !IMMUTABLE_COLUMNS.includes(column));

/**
 * Column values are keyed by column name and `Record<WpsColumn, …>` forces the
 * compiler to reject a missing or extra entry, so bindings can never drift from
 * the column list the way a positional array would.
 */
function wpsColumnValues(
  procedure: WpsProcedureInput,
  id: string,
  ownerId: string,
  now: number,
): Record<WpsColumn, string | number> {
  return {
    id,
    owner_id: ownerId,
    code: procedure.code,
    title: procedure.title,
    standard: procedure.standard,
    joint_type: procedure.jointType,
    welding_position: procedure.weldingPosition,
    material: procedure.material,
    material_thickness_mm: procedure.materialThickness_mm,
    wire_diameter_mm: procedure.wireDiameter_mm,
    shielding_gas: procedure.shieldingGas,
    voltage_v: procedure.voltage_V,
    voltage_tolerance_v: procedure.voltageTolerance_V,
    current_a: procedure.current_A,
    current_tolerance_a: procedure.currentTolerance_A,
    wire_feed_speed_m_min: procedure.wireFeedSpeed_m_min,
    wire_feed_speed_tolerance: procedure.wireFeedSpeedTolerance,
    stickout_mm: procedure.stickout_mm,
    travel_speed_min_mm_s: procedure.targetTravelSpeedMin_mm_s,
    travel_speed_max_mm_s: procedure.targetTravelSpeedMax_mm_s,
    travel_angle_min_deg: procedure.targetTravelAngleMin_deg,
    travel_angle_max_deg: procedure.targetTravelAngleMax_deg,
    work_angle_deg: procedure.targetWorkAngle_deg,
    notes: procedure.notes,
    created_at: now,
    updated_at: now,
  };
}

const WPS_INSERT_SQL =
  `INSERT INTO wps_procedures (${WPS_COLUMNS.join(', ')}) ` +
  `VALUES (${WPS_COLUMNS.map(() => '?').join(', ')})`;

const WPS_UPSERT_SQL =
  `${WPS_INSERT_SQL} ON CONFLICT (id) DO UPDATE SET ` +
  MUTABLE_COLUMNS.map((column) => `${column} = excluded.${column}`).join(', ');

function wpsInsertBindings(values: Record<WpsColumn, string | number>): (string | number)[] {
  return WPS_COLUMNS.map((column) => values[column]);
}

const WPS_SELECT = `SELECT ${WPS_COLUMNS.join(', ')} FROM wps_procedures`;

function rowToWps(row: WpsRow): WPSProcedure {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    standard: row.standard,
    jointType: row.joint_type,
    weldingPosition: row.welding_position,
    material: row.material,
    materialThickness_mm: row.material_thickness_mm,
    wireDiameter_mm: row.wire_diameter_mm,
    shieldingGas: row.shielding_gas,
    voltage_V: row.voltage_v,
    voltageTolerance_V: row.voltage_tolerance_v,
    current_A: row.current_a,
    currentTolerance_A: row.current_tolerance_a,
    wireFeedSpeed_m_min: row.wire_feed_speed_m_min,
    wireFeedSpeedTolerance: row.wire_feed_speed_tolerance,
    stickout_mm: row.stickout_mm,
    targetTravelSpeedMin_mm_s: row.travel_speed_min_mm_s,
    targetTravelSpeedMax_mm_s: row.travel_speed_max_mm_s,
    targetTravelAngleMin_deg: row.travel_angle_min_deg,
    targetTravelAngleMax_deg: row.travel_angle_max_deg,
    targetWorkAngle_deg: row.work_angle_deg,
    notes: row.notes,
  };
}

/** Work instructions are shop-wide, so every signed-in user may read the library. */
const listWpsProcedures = async (c: Context<AppEnv, '/'>) => {
  const rows = await c.env.DB.prepare(`${WPS_SELECT} ORDER BY code`).all<WpsRow>();
  return c.json<WpsListResponse>({ procedures: (rows.results ?? []).map(rowToWps) }, 200);
};

const getWpsProcedure = async (c: Context<AppEnv, '/:id'>) => {
  const row = await c.env.DB.prepare(`${WPS_SELECT} WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<WpsRow>();
  if (!row) {
    return c.json(errorBody('not_found', 'WPS procedure not found'), 404);
  }
  return c.json<WPSProcedure>(rowToWps(row), 200);
};

const createWpsProcedure = async (c: Context<AppEnv, '/', JsonBody<typeof createWpsSchema>>) => {
  const caller = c.get('user');
  const body = c.req.valid('json');
  const id = body.id ?? crypto.randomUUID();
  const now = Date.now();

  try {
    await c.env.DB.prepare(WPS_INSERT_SQL)
      .bind(...wpsInsertBindings(wpsColumnValues(body, id, caller.id, now)))
      .run();
  } catch (error) {
    if (isConstraintViolation(error)) {
      return c.json(
        errorBody('conflict', 'A procedure with that id or code already exists'),
        409,
      );
    }
    throw error;
  }

  const row = await c.env.DB.prepare(`${WPS_SELECT} WHERE id = ?`).bind(id).first<WpsRow>();
  if (!row) {
    return c.json(errorBody('internal_error', 'Procedure could not be read back'), 500);
  }
  return c.json<WPSProcedure>(rowToWps(row), 201);
};

/** Full replace, so the SPA can push an edited procedure (and seed the default library). */
const updateWpsProcedure = async (c: Context<AppEnv, '/:id', JsonBody<typeof createWpsSchema>>) => {
  const caller = c.get('user');
  const id = c.req.param('id');
  const body = c.req.valid('json');

  try {
    await c.env.DB.prepare(WPS_UPSERT_SQL)
      .bind(...wpsInsertBindings(wpsColumnValues(body, id, caller.id, Date.now())))
      .run();
  } catch (error) {
    if (isConstraintViolation(error)) {
      return c.json(errorBody('conflict', 'Another procedure already uses that code'), 409);
    }
    throw error;
  }

  const row = await c.env.DB.prepare(`${WPS_SELECT} WHERE id = ?`).bind(id).first<WpsRow>();
  if (!row) {
    return c.json(errorBody('internal_error', 'Procedure could not be read back'), 500);
  }
  return c.json<WPSProcedure>(rowToWps(row), 200);
};

const deleteWpsProcedure = async (c: Context<AppEnv, '/:id'>) => {
  const result = await c.env.DB.prepare('DELETE FROM wps_procedures WHERE id = ?')
    .bind(c.req.param('id'))
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    return c.json(errorBody('not_found', 'WPS procedure not found'), 404);
  }
  return c.body(null, 204);
};

const wps = new Hono<AppEnv>()
  .get('/', requireAuth, listWpsProcedures)
  .get('/:id', requireAuth, getWpsProcedure)
  .post('/', requireInstructor, jsonValidator(createWpsSchema), createWpsProcedure)
  .put('/:id', requireInstructor, jsonValidator(createWpsSchema), updateWpsProcedure)
  .delete('/:id', requireInstructor, deleteWpsProcedure);

export default wps;
