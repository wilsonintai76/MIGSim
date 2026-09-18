/**
 * @file types.ts
 * @description Client-facing entry point for the domain model.
 *
 * The authoritative definitions live in shared/types.ts so the SPA and the
 * Cloudflare Worker compile against one contract. Re-exported here so existing
 * `from '../types'` imports keep working.
 */

export * from '../shared/types';