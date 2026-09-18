# MIGSIM — GMAW/MIG welding simulator

Progressive Web App for GMAW/MIG technique and parameter training with camera-based torch
tracking, BLE sensor telemetry and empirical bead-quality modelling — plus a Cloudflare
Worker backend for accounts, instructor tooling and AI coaching.

## Architecture

| Piece | Technology | Location |
| --- | --- | --- |
| Simulator UI | React 19 + Vite + Tailwind PWA | [src/](/d:/migsim/src) |
| API | Cloudflare Worker, Hono + Hono RPC, Zod validation | [worker/](/d:/migsim/worker) |
| Storage | Cloudflare D1 (SQLite) | [worker/db/schema.sql](/d:/migsim/worker/db/schema.sql) |
| AI coach | Cloudflare Workers AI (`AI` binding) | [worker/routes/ai.ts](/d:/migsim/worker/routes/ai.ts) |
| API contract | Shared domain/API types | [shared/](/d:/migsim/shared) |

The Worker serves the built SPA from the `ASSETS` binding, so a single origin hosts both the
app and `/api/*`. Requests under `/api/*` always run the Worker first.

The client talks to the API through Hono RPC: [src/services/api.ts](/d:/migsim/src/services/api.ts)
imports `AppType` from [worker/index.ts](/d:/migsim/worker/index.ts), so renaming a route or
changing a request body breaks the type-check instead of the running app.

## Prerequisites

- Node.js 20+ and npm (the project installs with npm; the checked-in `bun.lock` is stale)
- A Cloudflare account with Workers AI enabled
- `npx wrangler login`

## Local development

```bash
npm install                                   # .npmrc sets legacy-peer-deps for React 19 peers
npx wrangler d1 create migsim-db              # copy the printed database_id into wrangler.jsonc
npm run db:local                              # apply worker/db/schema.sql to the local D1 database
cp .dev.vars.example .dev.vars                # then set a long random JWT_SECRET
```

Then run the API and the SPA in two terminals:

```bash
npm run dev:api     # Worker on http://127.0.0.1:8787
npm run dev         # Vite on http://localhost:3000, proxying /api to the Worker
```

Open http://localhost:3000. Local D1 data lives in `.wrangler/state/v3/d1`.

### Creating the first account

Registration bootstraps exactly one instructor; every later account must be created by a
signed-in instructor (a trainer cannot create accounts).

```bash
# 1. Bootstrap the first instructor (signed in automatically via the session cookie).
curl -i -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"instructor@example.com","password":"change-me-please","name":"Instructor"}' \
  http://127.0.0.1:8787/api/auth/register

# 2. Create a trainer, then sign them in separately.
curl -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"trainer@example.com","password":"change-me-please","name":"Trainer","role":"trainer"}' \
  http://127.0.0.1:8787/api/auth/register

curl -i -c trainer-cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"trainer@example.com","password":"change-me-please"}' \
  http://127.0.0.1:8787/api/auth/login

curl -b cookies.txt http://127.0.0.1:8787/api/auth/me
```

Sessions are httpOnly cookies (`migsim_session`, 12-hour lifetime); `Authorization: Bearer <token>`
with the same JWT also works for scripts. Sign-in is throttled after 5 failures within 15 minutes.

### API surface

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/health` | public |
| POST | `/api/auth/register` | bootstrap, then instructor |
| POST | `/api/auth/login`, `/api/auth/logout` | public |
| GET | `/api/auth/me` | session |
| POST | `/api/auth/password` | session |
| GET, POST | `/api/cohorts` | session / instructor |
| GET, PATCH, DELETE | `/api/cohorts/:id` | session (members) / instructor |
| GET, POST | `/api/cohorts/:id/members` | session / instructor |
| DELETE | `/api/cohorts/:id/members/:userId` | instructor |
| POST | `/api/passes` | session (batch sync, 1–10 passes) |
| GET | `/api/passes`, `/api/passes/:id` | session |
| PATCH | `/api/passes/:id/grade` | instructor |
| GET, POST | `/api/stations` | session / instructor |
| GET, PATCH, DELETE | `/api/stations/:id` | session / instructor |
| GET | `/api/wps`, `/api/wps/:id` | session |
| POST, PUT, DELETE | `/api/wps`, `/api/wps/:id` | instructor |
| POST | `/api/ai` | session (owner of the pass) |

Offline pass sync posts `{ "passes": [...] }` and receives `{ "syncedAt", "results": [{ "id", "status" }] }`
where `status` is `created`, `updated` or `rejected` (the latter means the id belongs to another
account). Instructor grades are stored in separate columns, so re-syncing a pass never overwrites them.
Unknown keys inside `parameters`/`result` are preserved verbatim, so the simulator can add fields
without a Worker change.

## Deploying

```bash
npx wrangler d1 create migsim-db      # once; paste database_id into wrangler.jsonc
npm run db:remote                     # apply the schema to the remote database
npx wrangler secret put JWT_SECRET    # never commit this
npm run deploy                        # vite build + wrangler deploy
```

`wrangler.jsonc` ships `vars.ENVIRONMENT = "development"`; deploy with
`npx wrangler deploy --var ENVIRONMENT:production` (or change the var) so the CORS allowlist stops
accepting localhost origins. If the SPA is served from a different origin than the Worker, list the
allowed origins in `CORS_ORIGINS`.

Validate the Worker configuration without publishing:

```bash
npm run build && npx wrangler deploy --dry-run
```

### Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | `.dev.vars` / `wrangler secret put` | Signs session JWTs; the API returns 500 without it |
| `ENVIRONMENT` | `wrangler.jsonc` / `--var` | `production` disables the localhost CORS origins |
| `AI_MODEL` | `.dev.vars` / secret | Overrides the default Workers AI model for `/api/ai` |
| `CORS_ORIGINS` | `.dev.vars` / secret | Comma-separated extra origins for credentialed requests |
| `VITE_API_BASE_URL` | `.env.local` | Only needed when the API is not same-origin as the SPA |

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000, proxying `/api` to `127.0.0.1:8787` |
| `npm run dev:api` | `wrangler dev` for the Worker API on port 8787 |
| `npm run build` | Production SPA build into `dist/` (includes the service worker) |
| `npm run preview` | Build, then serve the real Worker + assets locally |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run db:local` / `db:remote` | Apply `worker/db/schema.sql` to the local / remote D1 database |
| `npm run lint` | Type-check the SPA (`tsconfig.json`) and the Worker (`tsconfig.worker.json`) |

## Notes

- The service worker skips `/api/*` (both navigation fallback and runtime caching), so API calls
  always hit the network.
- Leftovers worth removing when convenient: unused `@google/genai`, `dotenv`, `esbuild` and `tsx`
  dependencies, the stale `bun.lock`, and `metadata.json`'s `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`
  capability — the AI coach runs on Workers AI and no Gemini key is needed.
