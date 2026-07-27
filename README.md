# LECG Dashboard

Internal BIM/VDC operations and workshop dashboard. It answers who has access
to what, who is actually active, and where the coordination risk is — across
Autodesk Construction Cloud (ACC), Forma, and the MTY template, from a fully
extracted local PostgreSQL dataset (~4.5M rows, ~950 projects).

Local-only. No cloud deployment, no telemetry.

## Surfaces

Four core surfaces carry the product:

| Route | Purpose |
|---|---|
| `/users` | User directory, per-person ACC profile, spatial access graph |
| `/access-analysis` | Access, activity, module, and coordination analytics |
| `/template-mty` | Folder-access-by-tier and ACC module coverage for the MTY template |
| `/forma-proposal` | Draft Forma folder permission proposals (never writes to ACC) |

Support routes: `/home`, `/lod-checker`, `/trello`, `/account`, `/settings`.

## Prerequisites

- Node.js >= 22
- PostgreSQL (local instance, managed via `npm run db:*`)
- Python 3.x — dev stack orchestration and the LOD engine

## Setup

```bash
npm install
npm run db:start
npx prisma db push
```

`postinstall` runs `prisma generate`, `patch-package`, and copies the DuckDB
WASM bundle. Configure `.env` before first run — see "Environment" below.

## Running

```bash
npm run dev
```

Boots the full dev stack (Next.js, Yjs, supporting services) via
`scripts/run_dev_stack.py`.

The dev server has been unreliable on this tree: webpack dev has returned 500s
and Turbopack dev has corrupted CSS. When a change needs real verification,
build and serve production instead:

```bash
npx tsc --noEmit && npm run build && npm start
```

Always run `npx tsc --noEmit` before `npm run build` — `next build` typechecks
the whole tree and a type error blocks the live service.

## Live service

The dashboard runs as a scheduled task (`LECG Dashboard Local`) that executes
`scripts/start-local.ps1` at log-on:

- Next.js on `http://localhost:3000`
- Hocuspocus/Yjs on `ws://localhost:4444` (logs in `logs/yjs.log`)

Deploying means: stop the scheduled task, free port 3000, build, restart the
task, then probe the changed route. The full sequence is in
`.claude/skills/lecg-dashboard/references/deploy-sequence.md`.

## Environment

`DATABASE_URL` and `NEXTAUTH_SECRET` are required. Optional integrations:
Google OAuth (`AUTH_GOOGLE_ID`/`SECRET`), Autodesk APS
(`APS_CLIENT_ID`/`SECRET`), Trello, Upstash Redis, OpenAI.

`AUTH_URL` is the canonical public auth origin; `APS_CALLBACK_URL` must share
that origin. `node scripts/patch-env.js` rewrites only
`NEXT_PUBLIC_LOD_CHECKER_URL` and `NEXT_PUBLIC_YJS_WS_URL` — it leaves the auth
host alone. Do not mix `localhost` and the public host in one auth session.

## Verification

```bash
npm test                        # vitest (excludes e2e)
npm run test:e2e                # playwright, :3100
npx tsc --noEmit                # typecheck
node scripts/repo-map/check.cjs # architecture/import boundaries
```

## Structure

- `app/` — Next.js App Router route composition
- `components/` — reusable UI
- `lib/` — shared logic
- `server/routers/` — tRPC request and database boundaries
- `prisma/` — schema and migrations
- `scripts/`, `services/` — tooling and the Python LOD engine

There is no `src/` root. UI components must not access Prisma directly.

## Conventions

`AGENTS.md` is the operational contract. `DESIGN.md` is the design system
(zinc dark theme, brand categorical palette, density rules). `PRODUCT.md` is
the product context. Where a document and the app source disagree, the source
wins.
