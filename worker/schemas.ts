/**
 * @file schemas.ts
 * @description zod request validation for every `/api/*` route.
 *
 * The domain objects nest deeply and are produced by the simulator, so the
 * nested payloads are validated with `looseObject`: every field the Worker
 * indexes in SQL is checked, while extra simulator fields (`beadSegments`,
 * `transferMode`, raw corners, …) are preserved instead of stripped.
 */

import { z } from 'zod';
import {
  AI_FEEDBACK_FOCUSES,
  APP_ROLES,
  INSTRUCTOR_GRADES,
  JOINT_TYPES,
  MATERIAL_TYPES,
  SHIELDING_GASES,
  STATION_STATUSES,
  WELDING_POSITIONS,
} from '../shared/constants';
import type { WPSProcedure } from '../shared/types';

/** Client-generated ids (`weld_…`) and server UUIDs both match this. */
const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/, 'Invalid id');

const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(200);

export const emailSchema = z
  .email()
  .max(200)
  // Stored lowercased so `Trainer@x.com` and `trainer@x.com` are one account.
  .transform((value) => value.trim().toLowerCase());

/** Caps used to bound request size — a pass carries up to 300 torch samples. */
export const MAX_BATCH_PASSES = 10;
export const MAX_SAMPLES_PER_PASS = 20_000;

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
  role: z.enum(APP_ROLES).default('trainer'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

/* -------------------------------------------------------------------------- */
/* Passes                                                                      */
/* -------------------------------------------------------------------------- */

const weldingParametersSchema = z.looseObject({
  current_A: z.number().finite().min(0).max(2000),
  voltage_V: z.number().finite().min(0).max(200),
  wireFeedSpeed_m_min: z.number().finite().min(0).max(100),
  stickout_mm: z.number().finite().min(0).max(500),
  wireDiameter_mm: z.number().finite().min(0).max(10),
  material: z.enum(MATERIAL_TYPES),
  materialThickness_mm: z.number().finite().min(0).max(500),
  shieldingGas: z.enum(SHIELDING_GASES),
  jointType: z.enum(JOINT_TYPES),
  weldingPosition: z.enum(WELDING_POSITIONS),
});

const beadQualityResultSchema = z.looseObject({
  overallScore: z.number().finite().min(0).max(100),
  heatInput_kJ_per_mm: z.number().finite().min(0).max(100),
  meanBeadWidth_mm: z.number().finite().min(0).max(1000),
  meanPenetration_mm: z.number().finite().min(0).max(1000),
  meanBeadHeight_mm: z.number().finite().min(0).max(1000).optional(),
  depositionArea_mm2: z.number().finite().min(0).max(10_000).optional(),
  subScores: z
    .looseObject({
      speedConsistency: z.number().finite().min(0).max(100),
      angleTechnique: z.number().finite().min(0).max(100),
      ctwdControl: z.number().finite().min(0).max(100),
      parameterBalance: z.number().finite().min(0).max(100),
    })
    .optional(),
  attribution: z.looseObject({
    parameterScore: z.number().finite().min(0).max(100),
    techniqueScore: z.number().finite().min(0).max(100),
    primaryIssue: z.enum(['parameter', 'technique', 'both', 'none']),
    summary: z.string().max(4000).optional(),
    recommendations: z.array(z.string().max(1000)).max(50).optional(),
  }),
  defects: z
    .array(
      z.looseObject({
        id: z.string().max(128),
        name: z.string().max(200),
        category: z.enum(['parameter', 'technique', 'both']),
        severity: z.enum(['minor', 'moderate', 'critical']),
        description: z.string().max(2000),
        cause: z.string().max(2000),
        correctiveAction: z.string().max(2000),
      }),
    )
    .max(200),
});

const liveTorchSampleSchema = z.looseObject({
  timestamp_ms: z.number().finite(),
  pose: z.looseObject({
    x_mm: z.number().finite(),
    y_mm: z.number().finite(),
    z_mm: z.number().finite(),
    travelAngle_deg: z.number().finite(),
    workAngle_deg: z.number().finite(),
    rollAngle_deg: z.number().finite(),
    timestamp_ms: z.number().finite(),
    isMarkerDetected: z.boolean(),
  }),
  ble: z.looseObject({
    isConnected: z.boolean(),
    isConnecting: z.boolean(),
    isArmed: z.boolean(),
    arcStart: z.boolean(),
    tofDistance_mm: z.number().finite(),
    simulated: z.boolean(),
  }),
  computedSpeed_mm_s: z.number().finite(),
  effectiveCTWD_mm: z.number().finite(),
  isArcActive: z.boolean(),
});

const weldPassRecordSchema = z.looseObject({
  id: idSchema,
  timestamp: z.number().int().positive(),
  studentName: z.string().trim().min(1).max(120),
  parameters: weldingParametersSchema,
  result: beadQualityResultSchema,
  durationSeconds: z.number().finite().min(0).max(86_400),
  totalLength_mm: z.number().finite().min(0).max(1_000_000),
  sampleCount: z.number().int().min(0).max(MAX_SAMPLES_PER_PASS),
  syncedToD1: z.boolean().optional(),
  d1SyncedAt: z.number().optional(),
  samples: z.array(liveTorchSampleSchema).max(MAX_SAMPLES_PER_PASS).optional(),
  instructorNotes: z.string().max(4000).optional(),
  instructorGrade: z.enum(INSTRUCTOR_GRADES).optional(),
  gradedBy: z.string().max(120).optional(),
  gradedAt: z.number().optional(),
  // Set by the client when a pass is captured against a cohort/station. Both are
  // optional so existing offline queues keep syncing unchanged.
  cohortId: idSchema.optional(),
  stationId: idSchema.optional(),
});

export const syncPassesSchema = z.object({
  passes: z.array(weldPassRecordSchema).min(1).max(MAX_BATCH_PASSES),
});

export const passListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().positive().optional(),
  cohortId: idSchema.optional(),
  studentName: z.string().trim().min(1).max(120).optional(),
  grade: z.enum(INSTRUCTOR_GRADES).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
});

export const gradePassSchema = z.object({
  grade: z.enum(INSTRUCTOR_GRADES),
  notes: z.string().max(4000).optional(),
});

/* -------------------------------------------------------------------------- */
/* Cohorts                                                                     */
/* -------------------------------------------------------------------------- */

export const createCohortSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(24)
    .regex(/^[A-Z0-9-]+$/, 'Use letters, digits and dashes only'),
});

export const updateCohortSchema = createCohortSchema.partial();

export const addCohortMemberSchema = z.object({ email: emailSchema });

/* -------------------------------------------------------------------------- */
/* Stations                                                                    */
/* -------------------------------------------------------------------------- */

const stationFieldsSchema = {
  cohortId: idSchema.nullish(),
  name: z.string().trim().min(1).max(120),
  stationNumber: z.number().int().min(1).max(9999),
  currentWpsId: idSchema.nullish(),
  status: z.enum(STATION_STATUSES).default('standby'),
};

export const createStationSchema = z.object(stationFieldsSchema);

export const updateStationSchema = z.object(stationFieldsSchema).partial();

export const stationListQuerySchema = z.object({
  cohortId: idSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/* WPS procedures                                                              */
/* -------------------------------------------------------------------------- */

const wpsProcedureShape = {
  code: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  standard: z.string().trim().min(1).max(120),
  jointType: z.enum(JOINT_TYPES),
  weldingPosition: z.enum(WELDING_POSITIONS),
  material: z.enum(MATERIAL_TYPES),
  materialThickness_mm: z.number().finite().min(0).max(500),
  wireDiameter_mm: z.number().finite().min(0).max(10),
  shieldingGas: z.enum(SHIELDING_GASES),
  voltage_V: z.number().finite().min(0).max(200),
  voltageTolerance_V: z.number().finite().min(0).max(100),
  current_A: z.number().finite().min(0).max(2000),
  currentTolerance_A: z.number().finite().min(0).max(1000),
  wireFeedSpeed_m_min: z.number().finite().min(0).max(100),
  wireFeedSpeedTolerance: z.number().finite().min(0).max(100),
  stickout_mm: z.number().finite().min(0).max(500),
  targetTravelSpeedMin_mm_s: z.number().finite().min(0).max(1000),
  targetTravelSpeedMax_mm_s: z.number().finite().min(0).max(1000),
  targetTravelAngleMin_deg: z.number().finite().min(-180).max(180),
  targetTravelAngleMax_deg: z.number().finite().min(-180).max(180),
  targetWorkAngle_deg: z.number().finite().min(-180).max(180),
  notes: z.string().max(4000),
};

/**
 * Typed as `z.ZodType<Omit<WPSProcedure, 'id'>>` so the compiler rejects the
 * schema if the domain interface gains a field that is not validated here.
 */
export const wpsProcedureSchema: z.ZodType<Omit<WPSProcedure, 'id'>> =
  z.object(wpsProcedureShape);

/** The `id` is optional: the SPA may keep its own seed ids, otherwise the Worker mints one. */
export const createWpsSchema = z.object({ ...wpsProcedureShape, id: idSchema.optional() });

/* -------------------------------------------------------------------------- */
/* AI feedback                                                                 */
/* -------------------------------------------------------------------------- */

export const aiFeedbackSchema = z.object({
  passId: idSchema,
  focus: z.enum(AI_FEEDBACK_FOCUSES).default('both'),
});

/** Shape the model is asked to return; anything else is treated as upstream failure. */
export const aiFeedbackPayloadSchema = z.object({
  summary: z.string().max(4000),
  strengths: z.array(z.string().max(1000)).max(50),
  improvements: z.array(z.string().max(1000)).max(50),
  drills: z.array(z.string().max(1000)).max(50),
  safetyNotes: z.array(z.string().max(1000)).max(50),
});
