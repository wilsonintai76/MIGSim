/**
 * @file api.ts
 * @description Typed Hono RPC client for the MigSim Worker API.
 *
 * `import type { AppType }` is load-bearing: because it is a type-only import the
 * bundler erases it, so neither `worker/**` nor Hono's server code reaches the
 * browser — the client still gets the server's exact request/response types.
 */

import { hc } from 'hono/client';
import type { AppType } from '../../worker/index';
import type { ApiErrorBody } from '../../shared/api';

/**
 * Empty by default: the SPA is served by the same Worker in production and Vite
 * proxies `/api` to `wrangler dev` locally, so relative URLs are always correct.
 * Set `VITE_API_BASE_URL` only when the API lives on another origin.
 */
const BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

const rpc = hc<AppType>(BASE_URL, { init: { credentials: 'include' } });

/** Every route is mounted under `/api`, so unwrap that prefix once for call sites. */
export const api = rpc.api;

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  const body = value as ApiErrorBody | null;
  return typeof body?.error?.message === 'string';
}

/** Server-supplied message for a failed response, falling back to the status line. */
export async function readApiError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isApiErrorBody(body)) return body.error.message;
  } catch {
    // Not JSON (proxy error page, offline interceptor, …) — fall through.
  }
  return `${response.status} ${response.statusText || 'request failed'}`;
}
