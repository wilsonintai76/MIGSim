-- MigSim D1 schema.
--
-- Apply locally:  npx wrangler d1 execute migsim-db --local --file=worker/db/schema.sql
-- Apply remotely: npx wrangler d1 execute migsim-db --remote --file=worker/db/schema.sql
--
-- Every statement is idempotent so the file can be re-run against an existing
-- database without destroying data.

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,
  password_salt       TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  name                TEXT NOT NULL,
  role                TEXT NOT NULL CHECK (role IN ('trainer', 'instructor')),
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  revoked_at    INTEGER,
  user_agent    TEXT,
  ip_hash       TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Login throttle: 5 failures for an email inside the window locks sign-in.
CREATE TABLE IF NOT EXISTS login_attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL,
  ip_hash      TEXT,
  attempted_at INTEGER NOT NULL,
  succeeded    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts (email, attempted_at);

/* ------------------------------------------------------------------ */
/* Cohorts and stations                                                */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS cohorts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE,
  instructor_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cohorts_instructor ON cohorts (instructor_id);

CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id TEXT NOT NULL REFERENCES cohorts (id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (cohort_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cohort_members_user ON cohort_members (user_id);

CREATE TABLE IF NOT EXISTS wps_procedures (
  id                         TEXT PRIMARY KEY,
  owner_id                   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code                       TEXT NOT NULL,
  title                      TEXT NOT NULL,
  standard                   TEXT NOT NULL,
  joint_type                 TEXT NOT NULL,
  welding_position           TEXT NOT NULL,
  material                   TEXT NOT NULL,
  material_thickness_mm      REAL NOT NULL,
  wire_diameter_mm           REAL NOT NULL,
  shielding_gas              TEXT NOT NULL,
  voltage_v                  REAL NOT NULL,
  voltage_tolerance_v        REAL NOT NULL,
  current_a                  REAL NOT NULL,
  current_tolerance_a        REAL NOT NULL,
  wire_feed_speed_m_min      REAL NOT NULL,
  wire_feed_speed_tolerance  REAL NOT NULL,
  stickout_mm                REAL NOT NULL,
  travel_speed_min_mm_s      REAL NOT NULL,
  travel_speed_max_mm_s      REAL NOT NULL,
  travel_angle_min_deg       REAL NOT NULL,
  travel_angle_max_deg       REAL NOT NULL,
  work_angle_deg             REAL NOT NULL,
  notes                      TEXT NOT NULL DEFAULT '',
  created_at                 INTEGER NOT NULL,
  updated_at                 INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wps_owner ON wps_procedures (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wps_code ON wps_procedures (code);

CREATE TABLE IF NOT EXISTS stations (
  id             TEXT PRIMARY KEY,
  cohort_id      TEXT REFERENCES cohorts (id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  station_number INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'standby'
                 CHECK (status IN ('active_arc', 'ready', 'standby', 'offline')),
  current_wps_id TEXT REFERENCES wps_procedures (id) ON DELETE SET NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- SQLite treats NULLs as distinct, so unassigned stations are allowed to reuse
-- a number; within one cohort the number is unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stations_cohort_number
  ON stations (cohort_id, station_number);

CREATE INDEX IF NOT EXISTS idx_stations_cohort ON stations (cohort_id);

/* ------------------------------------------------------------------ */
/* Weld passes                                                         */
/* ------------------------------------------------------------------ */

-- Scalars used for instructor filtering/aggregation are real columns; the full
-- domain documents are stored as JSON so a pass round-trips losslessly.
CREATE TABLE IF NOT EXISTS passes (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  cohort_id            TEXT REFERENCES cohorts (id) ON DELETE SET NULL,
  station_id           TEXT REFERENCES stations (id) ON DELETE SET NULL,
  student_name         TEXT NOT NULL,
  performed_at         INTEGER NOT NULL,
  duration_seconds     REAL NOT NULL,
  sample_count         INTEGER NOT NULL,
  total_length_mm      REAL NOT NULL,
  overall_score        REAL NOT NULL,
  parameter_score      REAL NOT NULL,
  technique_score      REAL NOT NULL,
  primary_issue        TEXT NOT NULL,
  material             TEXT NOT NULL,
  material_thickness_mm REAL NOT NULL,
  current_a            REAL NOT NULL,
  voltage_v            REAL NOT NULL,
  wfs_m_min            REAL NOT NULL,
  stickout_mm          REAL NOT NULL,
  heat_input           REAL NOT NULL,
  mean_bead_width_mm   REAL NOT NULL,
  mean_penetration_mm  REAL NOT NULL,
  defect_count         INTEGER NOT NULL,
  parameters_json      TEXT NOT NULL,
  result_json          TEXT NOT NULL,
  samples_json         TEXT,
  instructor_notes     TEXT,
  instructor_grade     TEXT CHECK (instructor_grade IN ('PASS', 'RETEST', 'REJECT', 'PENDING')),
  graded_by            TEXT,
  graded_at            INTEGER,
  synced_at            INTEGER
);

CREATE INDEX IF NOT EXISTS idx_passes_user_time ON passes (user_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_passes_cohort_time ON passes (cohort_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_passes_station ON passes (station_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_passes_student ON passes (student_name);
CREATE INDEX IF NOT EXISTS idx_passes_time ON passes (performed_at DESC);

/* ------------------------------------------------------------------ */
/* AI feedback cache                                                   */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS ai_feedback (
  id             TEXT PRIMARY KEY,
  pass_id        TEXT NOT NULL REFERENCES passes (id) ON DELETE CASCADE,
  focus          TEXT NOT NULL,
  model          TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  payload_json   TEXT NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_feedback_key
  ON ai_feedback (pass_id, focus, prompt_version);
