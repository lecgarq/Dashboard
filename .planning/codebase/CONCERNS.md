# Concerns

Snapshot of technical debt, known bugs, fragile areas, and external blockers as of 2026-05-19.

## Critical / Active Bugs

### DC ingest drift (multi-day data loss, 2026-05-14 → 2026-05-18)

The Autodesk Data Connector activity ingest silently failed for several days. Cascade of bugs:

- **Bug A — schema mismatch:** ingest writes an `ingestRunId` column that does not exist on `AccActivity` in `prisma/schema.prisma`. Fix shipped in commit `7987695` ("fix(dc-ingest): map real APS DC per-module schema column names").
- **Bug B — error silenced:** exceptions caught with `console.error` but the run was still marked `status='success'`, hiding the failure from the sync center. (Status: open per memory `project_phase09_dc_ingest_drift`.)
- **Bug C — backward slice contamination:** admin snapshots run on every pass, causing bogus quarantine of valid data.
- **Bug D — column-name drift:** open per memory; per-module CSV columns drift from what the parser expects.

References:
- `lib/acc/dcIngest.ts` (~1239 lines) — main ingest loop, error swallowing
- `lib/acc/dcActivityCsvIngest.ts` — schema + column mapping
- `prisma/schema.prisma` — `AccActivity` model
- Spec: `docs/superpowers/specs/2026-05-18-dc-ingest-drift-recovery-design.md`

### Kill switch auto-deletes

`.dc-ingest.disabled` (the only manual quota-protection switch) keeps disappearing from Luis's PC. Root cause unknown — possibly a Task Scheduler script, possibly editor/IDE cleanup. Memory: `project_dc_kill_switch_autodelete`.

## External Blockers

### APS Data Connector daily quota

APS DC enforces ~25 requests per UTC-day per user. Hit on 2026-05-13 and again 2026-05-18. Workaround: `DC_RESUME=1` env var to retry after a 429; otherwise wait for UTC midnight.

Memory: `project_dc_daily_quota`.

### 2-leg auth permanently blocked

The production APS client ID is not authorized for the Data Connector API on the 2-leg flow. 3-leg (user-context) works and is currently the only viable path. Documented in memory `project_data_connector_declined`.

## Tech Debt

### Oversized React files

- `app/(dashboard)/users/AccUsersGraph.tsx` — ~4242 lines. Partial extraction landed in commit `702ff30` ("refactor(users): extract AccUsersGraph sub-components + shared types") but the parent file is still well beyond comfortable review size.
- `app/(dashboard)/users/UsersDirectoryClient.tsx` — ~2526 lines.

### Deployment quirks

- Dashboard runs on **Luis's PC via Windows Task Scheduler** since Railway trial expired 2026-05-13. `railway.toml`, `railway.cron.toml`, `railway.submitter.toml` are retained but unused.
- Local Postgres 18 with `trust` auth on localhost. Migrated off Supabase pooler 2026-05-18. See `server/auth.ts` for related `issuer` fix.
- `scripts/dc-daily-cron.ps1` is fragile — couples tightly to `.env` location and assumes Node on PATH.

### Stale planning artifacts

`.gsd/` is fully deleted in working tree (see git status). The `.planning/` folder is the new home. Historical milestone records lost from the working tree — recover from git history if needed.

## Security

- **No CSP / strict security headers** observed in `next.config.ts`.
- **Trust-mode Postgres on localhost** — safe only because the host is a single-user laptop, but any future move back to cloud requires re-enabling auth.
- **Secrets in `.env`** loaded by both Node and PowerShell scripts — easy to accidentally log via `console.log(process.env)`.
- **`gen-lang-client-0149211578-61b15c488c7b.json`** at repo root is a Google service-account credential file — verify it's gitignored before committing.

## Performance

- **DuckDB-WASM warmup** — `scripts/copy-duckdb-wasm.cjs` runs postinstall; first query on a cold tab is slow. Mitigated by frozen Cosmos positions cache.
- **Cosmograph alpha inversion gotcha** — `getSimulationAlpha()` returns `1 - progress`; cosmos.gl v3 progress semantics are inverted from d3 alpha. Easy to break label/dimming animations. Memory: `project_cosmos_alpha_inversion`.
- **Graph rebuild cost** — full topology recompute on filter change; one-node-per-(user, project) model (memory `project_user_project_instances`) increases node count substantially.

## Fragile Areas

- **APS Data Connector CSV schema** — two formats coexist: legacy single-file (YESTERDAY range only) vs new per-module 46-file format (2-yr backfills). Promote scripts must handle both. Memory: `project_dc_csv_schema_real`.
- **Cosmograph / Mosaic redesign in flight** — `.planning/` direction has shifted multiple times (per-user → user×project instances, monolithic graph → DuckDB→Mosaic→frozen-cosmos). Code in `app/(dashboard)/users/access-analysis/` is mid-transition.
- **Similarity edges must never render as visible edges/nodes** — they are positional/clustering only. Memory: `feedback_similarity_positional_only`.
- **Manual sync UI must stay hidden** — Sync All / Refresh / stale-cache banners were intentionally removed; sync is automatic via cron. Memory: `feedback_no_manual_sync_ui`.

## Test Coverage Gaps

- No E2E / browser tests.
- Most tRPC routers untested.
- Auth flows (`server/auth.ts`, NextAuth callbacks) untested.
- DC cron path tested only manually.
- No coverage threshold enforced in `vitest.config.ts`.

## Scaling Limits

- Single-machine deployment caps concurrent users to one host's resources.
- Postgres on localhost with default tuning — no connection-pool sizing for >5 concurrent ingest workers.
- APS DC 25 req/day quota is the hard ceiling on ingest cadence regardless of code quality.

## Cleanup Candidates

- `railway.*.toml` — keep or delete now that Railway is retired?
- `.dc-ingest.disabled` (currently deleted) — replace with a more robust kill-switch mechanism (DB row, env var) since the file keeps vanishing.
- `dashboard-app/` directory at repo root — verify it's not a stale duplicate of `app/`.
- `input.csv`, `JSOON.JSON`, `lazy panel.png` at repo root — looks like ad-hoc artifacts; check before committing.
