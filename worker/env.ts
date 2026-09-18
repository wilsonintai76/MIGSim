/**
 * @file env.ts
 * @description Worker bindings and Hono context typing.
 */

import type { AuthUser } from '../shared/api';

export interface WorkerEnv {
  /** D1 database binding — see worker/db/schema.sql. */
  DB: D1Database;
  /** Static asset binding for the built SPA (configured in wrangler.jsonc). */
  ASSETS: Fetcher;
  /** HMAC secret used to sign session JWTs. Set via `wrangler secret put JWT_SECRET`. */
  JWT_SECRET: string;
  /**
   * Workers AI binding (`"ai": { "binding": "AI" }` in wrangler.jsonc). Inference
   * runs inside Cloudflare, so there is no third-party API key to manage and no
   * traffic to another vendor. When the binding is absent, `/api/ai/*` responds
   * 503 rather than failing opaquely.
   */
  AI?: Ai;
  /** Overrides the default Workers AI model used by `/api/ai`. */
  AI_MODEL?: string;
  ENVIRONMENT?: string;
  /** Comma-separated allowlist of origins permitted to send credentialed requests. */
  CORS_ORIGINS?: string;
}

export interface AuthVariables {
  user: AuthUser;
  sessionId: string;
}

export type AppEnv = { Bindings: WorkerEnv; Variables: AuthVariables };
