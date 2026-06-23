# Phase 9: DB & Config Hardening - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden the DB/config layer so the fully-extracted ACC dataset is correctly indexed and the
known DB/config concerns are closed: add a standalone `@@index([roleId])` on
`AccFolderPermission`, remove the SSL fossil from `scripts/count-acc-data.cjs`, document the
heap/pool env vars in `.env.example`, flag the ~5M-row raw-scan path in
`lib/server/acc-hot-cache.ts`, and add a Vitest regression guard for the OOM-fix aggregate.

Requirements in scope: **DB-01, DB-02, DB-03, DB-04, TEST-01** (from `.planning/REQUIREMENTS.md`).

This phase clarifies HOW to implement those five requirements. It does NOT split the
access-analysis monoliths (deferred → REF-01), extract `folderPermQuery` (deferred → REF-02),
materialise a summary view (deferred → REF-03), or touch `/users/spatial-graph`.

</domain>

<evidence>
## Grounding Sources

- `.planning/PROJECT.md` / `.planning/STATE.md` — v2.1 Concerns Hardening milestone; Phase 09 is the first phase (09 of 14); analytics source of truth is the local Prisma DB; gate is `npx tsc --noEmit` before any rebuild; deploy = rebuild + Task Scheduler restart on `:3000`.
- `.planning/ROADMAP.md` (Phase 09 details) — the five success criteria, including `EXPLAIN ANALYZE` showing an Index Scan and the aggregate test asserting rows ≤ `n_roles × n_projects`.
- `.planning/REQUIREMENTS.md` — DB-01…DB-04, TEST-01 wording and CONCERNS.md cross-refs (§1.1–1.5, §8.1).
- `prisma/schema.prisma:529-540` — `AccFolderPermission` has `@@unique([folderId, roleId])` and `@@index([folderId])` but **no** standalone `@@index([roleId])`; DB-01 is real and non-redundant (a composite unique cannot serve a `roleId`-leading lookup).
- `prisma/schema.prisma:358-359, 886` — pgvector `Unsupported("vector(768)")` causes a documented `prisma migrate` choke; prior schema changes used raw SQL under `prisma/migrations-raw/` + `prisma migrate resolve`. Precedent index migration: `prisma/migrations/20260618230000_add_acc_activity_email_project_index`.
- `lib/server/acc-hot-cache.ts:188-191, 281-283` — confirmed `includePermissionContexts:true` branch runs `db.accFolderPermission.findMany(...)` (the ~5M-row raw scan → DB-04 target).
- `lib/server/acc-hot-cache.ts:300-339` — the OOM **fix** already exists: a `$queryRaw` `GROUP BY f."projectId", fp."roleId"` (`folderSummaryByProjectRole`) collapsing ~5M grant rows to ~13k group rows. This is the TEST-01 target; the live caller (`includePermissionSummary:true`) is at lines 896-900.
- `scripts/count-acc-data.cjs:14` — confirmed `new Client({ connectionString, ssl: { rejectUnauthorized: false } })` (DB-02 target).
- `package.json:9,18` — `test` = `vitest run --exclude "**/tests/e2e/**"`; `build` = `next build --webpack` (typechecks the whole tree, incl. tests). `vitest.config.ts` + `vitest.setup.ts` present; existing `lib/server/acc-hot-cache.test.ts`.
- VERIFY: `.env.example` exists (1847 bytes, read-blocked by secret-hygiene). Confirm via name-only grep whether `PG_POOL_MAX` / `NODE_OPTIONS` are already present before adding (do not print values).
- VERIFY: the exact "role-joined terrain query" to run `EXPLAIN ANALYZE` against for the DB-01 Index Scan proof — confirm against the `$queryRaw` join in `acc-hot-cache.ts:300-310` (and any `/template-mty` terrain query) at plan time.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- **DB-01 apply method:** raw `CREATE INDEX` SQL migration following the `prisma/migrations-raw/` pattern + `prisma migrate resolve` — NOT `prisma migrate dev` (pgvector migrate-choke is documented in the schema). Index name `acc_folder_permission_role_id_idx` to match the success-criterion plan text.
- **DB-02:** rewire `count-acc-data.cjs` to the project Prisma client / `DATABASE_URL` pool with no TLS-bypass flag (it is a local diagnostic against trust-auth localhost Postgres; SSL was never needed locally).
- **DB-03:** edit the existing `.env.example` (do not create a parallel file); document env var **names** + scaling-rationale comments only — never literal values (secret hygiene).
- **DB-04:** add a `// WARNING:` comment + `VERIFY:` note on the `includePermissionContexts:true` branch; do not change its behavior (guardrail only).
- Stack/source roots unchanged: Prisma schema in `prisma/`, server cache in `lib/server/`, scripts in `scripts/`, tests colocated in `lib/server/` per existing convention.
- No UI surface changes in this phase (no `/access-analysis`, `/users`, `/template-mty`, `/forma-proposal` render changes); zinc theme / no-new-WebGL constraints not engaged here.

</defaults>

<decisions>
## Implementation Decisions

### DB-01 — index migration apply + deploy (user decision)
- **Apply now + rebuild.** Execution runs the raw `CREATE INDEX` against the live local Postgres in this phase, proves it with `EXPLAIN ANALYZE` (expect `Index Scan using acc_folder_permission_role_id_idx`), then rebuilds `:3000`. Local single-user DB → a brief lock during the 6M-row build is acceptable. (Standard `CREATE INDEX`, not `CONCURRENTLY`.)
- Run `npx tsc --noEmit` before the rebuild (gate).
- Register the raw migration with `prisma migrate resolve` so migration state stays consistent.

### TEST-01 — OOM regression test style (user decision)
- **DB-free unit test, mock `db.$queryRaw`.** Assert the assembled result is bounded by group rows (≤ `n_roles × n_projects`), never raw permission rows. Must run in `vitest run` / CI / the `next build` typecheck with no live DB dependency, matching the existing suite. Extend or sit alongside `lib/server/acc-hot-cache.test.ts`.

### DB-02 / DB-03 / DB-04
- Implemented per the Inferred Dashboard Defaults above (no open choices).

### Claude's Discretion
- Exact wording of the `.env.example` comments, the DB-04 warning comment, and the DB-02 connection refactor shape.
- Whether TEST-01 extends `acc-hot-cache.test.ts` or adds a new `*.test.ts`; the exact mock/fixture construction for `$queryRaw`.
- Plan granularity (e.g. isolating the live-DB migration step into its own plan vs bundling with the code/doc/test changes).
- The specific terrain query used as the `EXPLAIN ANALYZE` witness, once verified at plan time.

</decisions>

<specifics>
## Specific Ideas

- The OOM fix is already shipped (`$queryRaw` GROUP BY) — TEST-01 is a *pinning* test that protects the existing win, not a test of new behavior.
- Treat the live local Postgres as the demo's source of truth: the migration must leave it queryable and the dashboard rebuildable on `:3000`.

</specifics>

<workshop>
## Workshop Impact

- No visible workshop-page change. This is repo/infrastructure hardening behind the four workshop pages.
- Indirect benefit: the `roleId` index speeds the role-joined terrain aggregate that feeds `/access-analysis` (and the `/template-mty` terrain query), and the test + warning comment lower the risk of an OOM regression silently returning during a live demo.

</workshop>

<data_truth>
## Data Truthfulness

- No data values change. No new analytics, no ingestion changes.
- The aggregate under test is the verified source of truth (`AccFolderPermission` GROUP BY → ~13k group rows); the test asserts its row-bound contract, not new numbers.
- Data-coverage labeling (DC 428/1,152, ACCDS floor, module caveat) is Phase 11 (TRUTH-*), not here.

</data_truth>

<deferred>
## Deferred Ideas

- `CREATE INDEX CONCURRENTLY` (zero-lock build) — not needed for a local single-user DB; available as a fallback if the standard build ever interferes with a running dashboard.
- Live-DB integration test for the aggregate — deferred; the DB-free unit contract is the in-suite guard. A manual opt-in real-DB check can be added later if more OOM confidence is wanted.
- REF-01 (monolith splits), REF-02 (`folderPermQuery` extraction), REF-03 (summary view/projection) — out of scope this milestone; their characterization tests land in Phase 14.

</deferred>

<verification>
## Verification Expectations

- `npx tsc --noEmit` passes before any rebuild.
- `prisma migrate resolve` leaves migration state consistent; `EXPLAIN ANALYZE` on the role-joined terrain query shows `Index Scan using acc_folder_permission_role_id_idx`.
- `npm test` (`vitest run`) passes, including the new DB-free TEST-01 aggregate test (no live-DB dependency).
- `scripts/count-acc-data.cjs` runs without the SSL-bypass flag and still returns the census counts.
- `.env.example` contains documented `PG_POOL_MAX` + `NODE_OPTIONS` (names/comments only, no values).
- Dashboard guardrails: zinc theme untouched, no new WebGL, `/users/spatial-graph` not touched; rebuild + Task Scheduler restart on `:3000` after the migration applies.

</verification>

---

## Dashboard self-check

- **Context:** Read `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`; verified `prisma/schema.prisma`, `lib/server/acc-hot-cache.ts`, `scripts/count-acc-data.cjs`, `package.json`, `vitest.config.ts`, `prisma/migrations/`. `.planning/codebase/CONCERNS.md` referenced indirectly via REQUIREMENTS cross-refs (not re-read).
- **Evidence:** Index gap (schema:529-540), pgvector migrate-choke + raw-SQL precedent (schema:358,886; migrations-raw pattern), OOM-fix aggregate + raw-scan branch (acc-hot-cache.ts:281-339), SSL fossil (count-acc-data.cjs:14), test/build commands (package.json:9,18).
- **Constraints:** Prisma DB as source of truth; secret hygiene on `.env.example` (names only); `npx tsc --noEmit` before rebuild; deploy = rebuild on `:3000`; spatial-graph + monolith splits out of scope.
- **Gates:** tsc → `vitest run` → `EXPLAIN ANALYZE` index proof → rebuild/restart.
- **VERIFY:** (1) whether `PG_POOL_MAX`/`NODE_OPTIONS` already exist in `.env.example`; (2) exact terrain query used as the `EXPLAIN ANALYZE` witness; (3) no active caller enables `includePermissionContexts:true`.

---

*Phase: 09-db-config-hardening*
*Context gathered: 2026-06-23*
