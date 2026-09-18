/**
 * @file http.ts
 * @description Shared response/hashing helpers for the Worker API.
 */

import type { ApiErrorBody, ApiErrorCode } from '../../shared/api';

/**
 * Build an error body for `c.json(errorBody(...), status)`. Returning the body
 * (rather than a pre-built Response) keeps Hono's typed-response inference intact
 * for the RPC client.
 */
export function errorBody(code: ApiErrorCode, message: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, details } };
}

/** Closest {@link ApiErrorCode} for a raw HTTP status, for errors raised outside our routes. */
export function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 413:
      return 'payload_too_large';
    case 429:
      return 'rate_limited';
    default:
      return status >= 500 ? 'internal_error' : 'bad_request';
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** JSON.parse that never throws — returns `fallback` for malformed stored data. */
export function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
