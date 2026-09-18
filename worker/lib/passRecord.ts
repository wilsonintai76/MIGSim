/**
 * @file passRecord.ts
 * @description Mapping between the SPA's `WeldPassRecord` and the D1 `passes` table.
 *
 * Queryable scalars are stored as real columns so instructor dashboards can filter
 * and aggregate in SQL; the full nested documents are kept as JSON for lossless
 * round-tripping back into the app.
 */

import type { WeldPassRecord } from '../../shared/types';
import { parseJson } from './http';

/** Hard ceiling on a single stored JSON blob (D1 rejects values over ~1 MB). */
const MAX_JSON_LENGTH = 900_000;

export interface PassRow {
  id: string;
  user_id: string;
  cohort_id: string | null;
  station_id: string | null;
  student_name: string;
  performed_at: number;
  duration_seconds: number;
  sample_count: number;
  total_length_mm: number;
  overall_score: number;
  parameter_score: number;
  technique_score: number;
  primary_issue: string;
  material: string;
  material_thickness_mm: number;
  current_a: number;
  voltage_v: number;
  wfs_m_min: number;
  stickout_mm: number;
  heat_input: number;
  mean_bead_width_mm: number;
  mean_penetration_mm: number;
  defect_count: number;
  parameters_json: string;
  result_json: string;
  samples_json: string | null;
  instructor_notes: string | null;
  instructor_grade: string | null;
  graded_by: string | null;
  graded_at: number | null;
  synced_at: number | null;
}

export interface PassOwnership {
  ownerId: string;
  cohortId: string | null;
  stationId: string | null;
}

const PASS_COLUMN_LIST: string[] = [
  'id',
  'user_id',
  'cohort_id',
  'station_id',
  'student_name',
  'performed_at',
  'duration_seconds',
  'sample_count',
  'total_length_mm',
  'overall_score',
  'parameter_score',
  'technique_score',
  'primary_issue',
  'material',
  'material_thickness_mm',
  'current_a',
  'voltage_v',
  'wfs_m_min',
  'stickout_mm',
  'heat_input',
  'mean_bead_width_mm',
  'mean_penetration_mm',
  'defect_count',
  'parameters_json',
  'result_json',
  'samples_json',
  'instructor_notes',
  'instructor_grade',
  'graded_by',
  'graded_at',
  'synced_at',
];

/** Column list qualified with a table alias, for `SELECT` statements. */
export function passColumns(alias: string): string {
  return PASS_COLUMN_LIST.map((column) => `${alias}.${column}`).join(', ');
}

/**
 * Instructor-owned columns. They are `NULL` on insert and never touched by the
 * upsert's `DO UPDATE` clause, so a re-sync can never wipe a recorded grade.
 */
const INSTRUCTOR_COLUMNS = ['instructor_notes', 'instructor_grade', 'graded_by', 'graded_at'];

const IDENTITY_COLUMNS = ['id', 'user_id'];

const INSERT_COLUMNS = PASS_COLUMN_LIST.filter((column) => !INSTRUCTOR_COLUMNS.includes(column));

const UPDATE_COLUMNS = INSERT_COLUMNS.filter((column) => !IDENTITY_COLUMNS.includes(column));

export const PASS_INSERT_SQL =
  `INSERT INTO passes (${INSERT_COLUMNS.join(', ')}) ` +
  `VALUES (${INSERT_COLUMNS.map(() => '?').join(', ')})`;

/**
 * Re-syncing a pass refreshes the student's own data while leaving the
 * instructor's grade untouched.
 */
export const PASS_UPSERT_SQL =
  `${PASS_INSERT_SQL} ON CONFLICT(id) DO UPDATE SET ` +
  UPDATE_COLUMNS.map((column) => `${column} = excluded.${column}`).join(', ');

/**
 * Bindings for `PASS_UPSERT_SQL`, in the same order as `passInsertBindings`:
 * the pass scalars, the JSON payloads, then `synced_at`.
 */
export function passInsertBindings(
  pass: WeldPassRecord,
  ownership: PassOwnership,
  syncedAt: number,
): (string | number | null)[] {
  const samplesJson = pass.samples?.length ? JSON.stringify(pass.samples) : null;
  return [
    pass.id,
    ownership.ownerId,
    ownership.cohortId,
    ownership.stationId,
    pass.studentName.slice(0, 120),
    pass.timestamp,
    pass.durationSeconds,
    pass.sampleCount,
    pass.totalLength_mm,
    pass.result.overallScore,
    pass.result.attribution.parameterScore,
    pass.result.attribution.techniqueScore,
    pass.result.attribution.primaryIssue,
    pass.parameters.material,
    pass.parameters.materialThickness_mm,
    pass.parameters.current_A,
    pass.parameters.voltage_V,
    pass.parameters.wireFeedSpeed_m_min,
    pass.parameters.stickout_mm,
    pass.result.heatInput_kJ_per_mm,
    pass.result.meanBeadWidth_mm,
    pass.result.meanPenetration_mm,
    pass.result.defects.length,
    JSON.stringify(pass.parameters),
    JSON.stringify(pass.result),
    samplesJson && samplesJson.length <= MAX_JSON_LENGTH ? samplesJson : null,
    syncedAt,
  ];
}

export function rowToPassRecord(row: PassRow): WeldPassRecord {
  const parameters = parseJson(row.parameters_json, null as WeldPassRecord['parameters'] | null);
  const result = parseJson(row.result_json, null as WeldPassRecord['result'] | null);

  // Rows are only ever written from a full pass record, so these are non-null in
  // practice; the fallbacks keep a corrupt row from crashing the dashboard.
  if (!parameters || !result) {
    throw new Error(`Pass ${row.id} is missing its stored parameters or result payload`);
  }

  const samples = parseJson<WeldPassRecord['samples']>(row.samples_json, undefined);

  return {
    id: row.id,
    timestamp: row.performed_at,
    studentName: row.student_name,
    parameters,
    result,
    durationSeconds: row.duration_seconds,
    totalLength_mm: row.total_length_mm,
    sampleCount: row.sample_count,
    syncedToD1: true,
    d1SyncedAt: row.synced_at ?? undefined,
    samples,
    instructorNotes: row.instructor_notes ?? undefined,
    instructorGrade: (row.instructor_grade as WeldPassRecord['instructorGrade']) ?? undefined,
    gradedBy: row.graded_by ?? undefined,
    gradedAt: row.graded_at ?? undefined,
  };
}
