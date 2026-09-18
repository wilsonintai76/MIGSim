/**
 * @file validate.ts
 * @description Validator wrappers that return the same `ApiErrorBody` shape as every
 * other route, so clients only ever have to parse one error format (and the RPC type
 * includes the 400 branch instead of an opaque `Response`).
 */

import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { errorBody } from './http';

/**
 * Input map of a handler sitting behind a `jsonValidator`. Extracted handlers declare it
 * in their `Context` type: `in` is what the RPC client has to send, `out` is what
 * `c.req.valid('json')` hands the handler (after defaults/transforms).
 */
export type JsonBody<T extends z.ZodType> = {
  in: { json: z.input<T> };
  out: { json: z.output<T> };
};

/** `queryValidator` counterpart of {@link JsonBody}. */
export type QueryBody<T extends z.ZodType> = {
  in: { query: z.input<T> };
  out: { query: z.output<T> };
};

export function jsonValidator<T extends z.ZodType>(schema: T) {
  return zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json(
        errorBody('bad_request', 'Request body failed validation', z.treeifyError(result.error)),
        400,
      );
    }
  });
}

export function queryValidator<T extends z.ZodType>(schema: T) {
  return zValidator('query', schema, (result, c) => {
    if (!result.success) {
      return c.json(
        errorBody('bad_request', 'Invalid query parameters', z.treeifyError(result.error)),
        400,
      );
    }
  });
}
