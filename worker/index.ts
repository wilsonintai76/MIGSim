/**
 * @file index.ts
 * @description Worker entry point — mounts the `/api/*` Hono app and falls back to the
 * built SPA for every other path.
 *
 * `export type AppType` is what makes Hono RPC (and `hc<AppType>`) typed on the client.
 * The SPA must import it with `import type` so none of this file reaches the bundle.
 */

import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { HealthResponse } from '../shared/api';
import type { AppEnv, WorkerEnv } from './env';
import { codeForStatus, errorBody } from './lib/http';
import ai from './routes/ai';
import auth from './routes/auth';
import cohorts from './routes/cohorts';
import passes from './routes/passes';
import stations from './routes/stations';
import wps from './routes/wps';

/**
 * A batch of 10 passes with 300 samples each is comfortably under this; the limit
 * exists to reject runaway payloads before they reach zod or D1.
 */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

/** Production is opt-in to every origin: only `CORS_ORIGINS` is honoured there. */
function allowedOrigins(env: WorkerEnv): string[] {
  const configured = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const defaults = env.ENVIRONMENT === 'production' ? [] : DEFAULT_DEV_ORIGINS;
  return [...configured, ...defaults];
}

const app = new Hono<AppEnv>();

/**
 * CORS runs first so that even rejected requests carry the right headers. The
 * origin callback is deliberate: passing a string would make `hono/cors` reflect
 * it unconditionally, and `credentials: true` forbids the `*` wildcard.
 */
const withCors: MiddlewareHandler<AppEnv> = (c, next) => {
  const allowed = allowedOrigins(c.env);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    credentials: true,
    allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  })(c, next);
};

const limitBodySize: MiddlewareHandler<AppEnv> = (c, next) =>
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) =>
      c.json(errorBody('payload_too_large', 'Request body exceeds the 8 MB limit'), 413),
  })(c, next);

const health = (c: Context<AppEnv, '/api/health'>) =>
  c.json<HealthResponse>(
    {
      service: 'migsim-api',
      environment: c.env.ENVIRONMENT ?? 'development',
      time: Date.now(),
      aiEnabled: Boolean(c.env.AI),
    },
    200,
  );

app.use('/api/*', withCors);
app.use('/api/*', limitBodySize);

/** Chained so the router type carries its schema — that is what types `hc<AppType>`. */
const routes = app
  .get('/api/health', health)
  .route('/api/auth', auth)
  .route('/api/passes', passes)
  .route('/api/cohorts', cohorts)
  .route('/api/stations', stations)
  .route('/api/wps', wps)
  .route('/api/ai', ai);

/** Unmatched paths are either a bad API call or a client-side SPA route. */
app.notFound((c) => {
  const { pathname } = new URL(c.req.url);
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return c.json(
      errorBody('not_found', `No API route matches ${c.req.method} ${pathname}`),
      404,
    );
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

/**
 * Route handlers translate expected failures into JSON responses, so anything landing
 * here is a bug — except the `HTTPException`s Hono raises itself (an unparseable JSON
 * body, for instance). Those carry a meaningful 4xx status and must not become a 500.
 */
app.onError((error, c) => {
  if (error instanceof HTTPException && error.status < 500) {
    return c.json(errorBody(codeForStatus(error.status), error.message || 'Request rejected'), error.status);
  }
  console.error('Unhandled API error', error instanceof Error ? error.stack : error);
  return c.json(errorBody('internal_error', 'Unexpected server error'), 500);
});

export type AppType = typeof routes;

export default routes;
