/**
 * @file api.ts
 * @description Request/response contract for the MigSim Worker API (`/api/*`).
 *
 * This file is types only — never add runtime code here, since the SPA imports it
 * with `import type` so that no Worker code reaches the browser bundle.
 */

import type {
  AppRole,
  InstructorGrade,
  StudentStation,
  WPSProcedure,
  WeldPassRecord,
} from './types';
import type { AI_FEEDBACK_FOCUSES } from './constants';

export type {
  AppRole,
  InstructorGrade,
  StudentStation,
  WPSProcedure,
  WeldPassRecord,
};

/** Alias kept for readability at API boundaries. */
export type UserRole = AppRole;

export type StationStatus = StudentStation['status'];

/** The authenticated principal attached to every authorised request. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  name: string;
  role: UserRole;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface HealthResponse {
  service: string;
  environment: string;
  time: number;
  /** Whether the Workers AI binding backing `/api/ai` is available. */
  aiEnabled: boolean;
}

/* -------------------------------------------------------------------------- */
/* Pass sync                                                                   */
/* -------------------------------------------------------------------------- */

export type PassSyncStatus = 'created' | 'updated' | 'rejected';

export interface PassSyncResult {
  id: string;
  status: PassSyncStatus;
  /** Present only when `status` is `rejected`. */
  error?: string;
}

export interface SyncPassesRequest {
  passes: WeldPassRecord[];
}

export interface SyncPassesResponse {
  syncedAt: number;
  results: PassSyncResult[];
}

export interface PassListQuery {
  limit?: number;
  /** `timestamp` of the last pass from the previous page (exclusive). */
  before?: number;
  cohortId?: string;
  studentName?: string;
  grade?: InstructorGrade;
  minScore?: number;
}

export interface PassListResponse {
  passes: WeldPassRecord[];
  /** `timestamp` to pass as `before` for the next page, or null when exhausted. */
  nextBefore: number | null;
}

export interface GradePassRequest {
  grade: InstructorGrade;
  notes?: string;
}

/* -------------------------------------------------------------------------- */
/* Cohorts                                                                     */
/* -------------------------------------------------------------------------- */

export interface CohortSummary {
  id: string;
  name: string;
  code: string;
  instructorId: string;
  createdAt: number;
  memberCount: number;
  stationCount: number;
  passCount: number;
}

export interface CreateCohortRequest {
  name: string;
  code: string;
}

export interface UpdateCohortRequest {
  name?: string;
  code?: string;
}

export interface AddCohortMemberRequest {
  email: string;
}

export interface CohortMember {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  joinedAt: number;
}

export interface CohortListResponse {
  cohorts: CohortSummary[];
}

export interface CohortMemberListResponse {
  members: CohortMember[];
}

/* -------------------------------------------------------------------------- */
/* Stations                                                                    */
/* -------------------------------------------------------------------------- */

export interface StationRecord {
  id: string;
  cohortId: string | null;
  name: string;
  stationNumber: number;
  status: StationStatus;
  currentWpsId: string | null;
  lastPassAt: number | null;
  lastScore: number | null;
  avgScore: number;
  completedPasses: number;
}

export interface CreateStationRequest {
  cohortId?: string | null;
  name: string;
  stationNumber: number;
  currentWpsId?: string | null;
  status?: StationStatus;
}

export interface UpdateStationRequest {
  cohortId?: string | null;
  name?: string;
  stationNumber?: number;
  status?: StationStatus;
  currentWpsId?: string | null;
}

export interface StationListResponse {
  stations: StationRecord[];
}

/* -------------------------------------------------------------------------- */
/* Welding procedure specifications                                            */
/* -------------------------------------------------------------------------- */

export type WpsProcedureInput = Omit<WPSProcedure, 'id'> & { id?: string };

export interface WpsListResponse {
  procedures: WPSProcedure[];
}

/* -------------------------------------------------------------------------- */
/* AI feedback                                                                 */
/* -------------------------------------------------------------------------- */

export type AiFeedbackFocus = (typeof AI_FEEDBACK_FOCUSES)[number];

export interface AiFeedbackRequest {
  passId: string;
  focus?: AiFeedbackFocus;
}

export interface AiFeedback {
  summary: string;
  strengths: string[];
  improvements: string[];
  drills: string[];
  safetyNotes: string[];
}

export interface AiFeedbackResponse {
  feedback: AiFeedback;
  model: string;
  /** True when the response was served from the `ai_feedback` cache. */
  cached: boolean;
  generatedAt: number;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'rate_limited'
  | 'ai_unavailable'
  | 'upstream_error'
  | 'internal_error';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}
