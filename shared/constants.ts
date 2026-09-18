/**
 * @file constants.ts
 * @description Runtime constant lists for the domain enums.
 *
 * `shared/types.ts` derives its union types from these tuples and the Worker's
 * zod schemas validate against them, so the wire contract cannot drift from the
 * compile-time types.
 */

export const MATERIAL_TYPES = ['mild_steel', 'stainless_304', 'aluminum_4043'] as const;
export const SHIELDING_GASES = [
  '100_CO2',
  '75Ar_25CO2',
  '82Ar_18CO2',
  '98Ar_2O2',
  '100_Ar',
] as const;
export const JOINT_TYPES = ['butt', 't_fillet', 'lap'] as const;
export const WELDING_POSITIONS = ['1F_1G', '2F', '3F_up'] as const;
export const APP_ROLES = ['trainer', 'instructor'] as const;
export const INSTRUCTOR_GRADES = ['PASS', 'RETEST', 'REJECT', 'PENDING'] as const;
export const STATION_STATUSES = ['active_arc', 'ready', 'standby', 'offline'] as const;
export const AI_FEEDBACK_FOCUSES = ['parameters', 'technique', 'both'] as const;
