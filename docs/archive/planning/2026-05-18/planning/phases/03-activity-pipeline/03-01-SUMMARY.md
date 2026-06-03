---
phase: 03-activity-pipeline
plan: 01
subsystem: database
tags: [prisma, postgres, unzipper, csv-parse, schema-migration, dedup]

# Dependency graph
requires:
  - phase: 02-core-extraction
    provides: AccProjectMember table (email + autodeskId for inviter attribution joins downstream)
provides:
  - AccActivity v2 schema (userEmail, sourceFile, rawAction columns + dedup @@unique + (userEmail, createdAt DESC) index)
  - UnresolvedAttribution table for forensic logging of failed inviter matches
  - unzipper@^0.12.3 + csv-parse@^6.2.1 in dependencies (Node 22 import verified)
  - Applied Prisma migration 20260511151713_acc_activity_v2 (additive on AccActivity, creates UnresolvedAttribution)
  - LodEmbedding.pgvector field declared as Unsupported("vector(768)") so future migrations preserve the existing HNSW index column
affects:
  - 03-02 (deep-sync-ingest streaming pipeline — depends on @@unique dedup key, userEmail column, sourceFile sentinel)
  - 03-03 (lazy tRPC accActivity.getFileActivityForUser — depends on (userEmail, createdAt DESC) index)
  - 03-04 (RecentlyAdded inviter attribution UI + drill-down — depends on UnresolvedAttribution + rawAction)

# Tech tracking
tech-stack:
  added: [unzipper@^0.12.3, csv-parse@^6.2.1]
  patterns:
    - "Manual migration SQL when prisma migrate dev is blocked by non-interactive shell"
    - "Unsupported() declaration to surface DB-managed columns to Prisma without losing them"
    - "Composite @@unique as the dedup key for createMany({ skipDuplicates: true })"

key-files:
  created:
    - prisma/migrations/20260511151713_acc_activity_v2/migration.sql
  modified:
    - package.json
    - package-lock.json
    - prisma/schema.prisma

key-decisions:
  - "Renamed AccActivity.action -> rawAction (safe: row count = 0 in live DB at migration time, verified via prisma adapter query)"
  - "projectId stays nullable; Plan 02 ingest writes empty-string sentinel for admin rows so the @@unique dedup applies (Postgres treats NULL != NULL in unique constraints)"
  - "Generated migration.sql by hand because prisma migrate dev refused to run in non-interactive shell; SQL was lifted from prisma migrate diff --from-config-datasource and filtered to additive-only changes for AccActivity + UnresolvedAttribution"
  - "Declared LodEmbedding.pgvector as Unsupported(\"vector(768)\") so prisma migrate diff stopped proposing a destructive DROP COLUMN of 24619 rows (Rule 3 — pre-existing schema/DB drift was blocking the diff)"

patterns-established:
  - "Phase 3 schema convention: lowercase emails at ingest time (userEmail in AccActivity follows AccProjectMember normalization from Phase 2)"
  - "Forensic logging table pattern: UnresolvedAttribution stores activityId + rawEmail + rawDetails + reason for offline analysis without polluting main UI"

requirements-completed: [ACTV-01, ACTV-02, ACTV-04]

# Metrics
duration: ~15min
completed: 2026-05-11
---

# Phase 3 Plan 1: Activity Pipeline Foundation Summary

**AccActivity v2 schema with composite dedup unique key, UnresolvedAttribution forensic table, and unzipper+csv-parse streaming-ingest dependencies installed and applied via additive migration.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-11T21:03Z
- **Completed:** 2026-05-11T21:18Z
- **Tasks:** 3
- **Files modified:** 4 (package.json, package-lock.json, prisma/schema.prisma, new migration.sql)

## Accomplishments

- unzipper@^0.12.3 and csv-parse@^6.2.1 installed in `dependencies` (production cron, not dev-only); Node 22 import verified (`u.Parse` and `c.parse` both `function`).
- AccActivity extended with userEmail (nullable, lowercased convention), sourceFile (default "project"), and rawAction (renamed from action — 0 rows so non-destructive).
- Composite `@@unique([autodeskId, rawAction, createdAt, projectId])` added — makes `createMany({ skipDuplicates: true })` a real ON CONFLICT DO NOTHING in Plan 02.
- New `(userEmail, createdAt DESC)` index added to drive ACTV-03 lazy `getFileActivityForUser` query.
- UnresolvedAttribution model created (activityId + rawEmail + rawDetails + reason + createdAt) with reason and createdAt indexes for forensic queries.
- Migration `20260511151713_acc_activity_v2` applied successfully; `npx prisma migrate status` reports "Database schema is up to date".
- Prisma Client regenerated; `prisma.unresolvedAttribution` accessor confirmed live.

## Task Commits

1. **Task 1: Install unzipper and csv-parse** — `284633b` (chore)
2. **Task 2: Extend AccActivity + add UnresolvedAttribution model** — `2f77169` (feat)
3. **Task 3: Generate and apply Prisma migration** — `c955b2a` (feat)

**Migration SHA-256:** `0F88F1A701429426BA48EDE4A46F87EE28A04E51E30B1898B2B454446D529D99`

## Files Created/Modified

- `package.json` / `package-lock.json` — added unzipper@^0.12.3 + csv-parse@^6.2.1 in dependencies.
- `prisma/schema.prisma` — AccActivity v2 columns + @@unique + new index; UnresolvedAttribution model; LodEmbedding.pgvector declared as Unsupported("vector(768)").
- `prisma/migrations/20260511151713_acc_activity_v2/migration.sql` — additive migration (ALTER TABLE + CREATE TABLE + CREATE INDEX only; the DROP COLUMN "action" is safe because AccActivity has 0 rows).

## Decisions Made

- **Rename safety:** Ran `SELECT count(*) FROM "AccActivity"` via the project's PrismaPg adapter before editing the schema. Count = 0, so `action` → `rawAction` is non-destructive. Recorded the count and gating logic in the migration.sql header comment.
- **Migration authorship:** `prisma migrate dev --create-only` refused to run because Claude Code's shell is non-interactive. Generated SQL via `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, then hand-filtered out drift artifacts (HNSW indexes, AccGraphLayoutCache default removals) so the migration is strictly the changes Plan 01 owns. Applied via `npx prisma migrate deploy` (non-interactive command).
- **Nullable projectId in dedup:** Kept projectId nullable; Plan 02 will write an empty-string sentinel for admin rows so the composite unique still dedups admin-side. Documented inline in schema comment and migration SQL header.
- **Plan 02 contract confirmed:** `node -e "require('unzipper').Parse; require('csv-parse').parse"` both resolve to functions, so Plan 02 can `import { parse } from "csv-parse"` and `import unzipper from "unzipper"` directly without further wiring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Declared LodEmbedding.pgvector as Unsupported("vector(768)")**
- **Found during:** Task 3 (Generate Prisma migration)
- **Issue:** `prisma migrate diff` and `prisma migrate dev` both proposed a destructive `DROP COLUMN "pgvector"` on `LodEmbedding` (24,619 non-null vectors). The column was created by raw SQL in migration `20260416011500_fix_lod_search_foundation` and indexed by `20260416182000_add_hnsw_vector_index`, but it was never declared in `prisma/schema.prisma`. This pre-existing drift was blocking any new migration from being generated cleanly.
- **Fix:** Added `pgvector Unsupported("vector(768)")?` field to `LodEmbedding` model with an inline comment pointing back to the raw-SQL migration that owns it. Now Prisma sees the column and stops proposing to drop it.
- **Files modified:** prisma/schema.prisma (LodEmbedding model)
- **Verification:** `prisma validate` passes; `prisma migrate diff --from-config-datasource --to-schema` no longer emits a `DROP COLUMN "pgvector"` line; the only remaining diff entries are legitimate pre-existing drift in `AccGraphLayoutCache` defaults and HNSW indexes, both unrelated to this plan and explicitly out of scope (logged here, not fixed).
- **Committed in:** c955b2a (Task 3 commit)

**2. [Rule 3 - Blocking] Hand-wrote migration.sql instead of `prisma migrate dev`**
- **Found during:** Task 3 (Generate Prisma migration)
- **Issue:** `prisma migrate dev --create-only` exits with "Prisma Migrate has detected that the environment is non-interactive, which is not supported." This is a Prisma CLI requirement that cannot be bypassed via stdin piping in the Claude Code shell.
- **Fix:** Used `prisma migrate diff --from-config-datasource --to-schema --script` to generate canonical SQL, then hand-wrote `prisma/migrations/20260511151713_acc_activity_v2/migration.sql` containing only the AccActivity + UnresolvedAttribution changes. Applied with `npx prisma migrate deploy` (non-interactive).
- **Files modified:** prisma/migrations/20260511151713_acc_activity_v2/migration.sql (created)
- **Verification:** `prisma migrate status` reports "Database schema is up to date"; live DB query `information_schema.columns WHERE table_name = 'AccActivity'` confirms userEmail, sourceFile, rawAction present and action absent; `prisma.unresolvedAttribution` accessor exists on the Prisma Client.
- **Committed in:** c955b2a (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - Blocking)
**Impact on plan:** Both deviations were unavoidable infrastructure-level blockers (pre-existing schema/DB drift + Prisma CLI's non-interactive refusal). Neither expanded scope; the migration applied delivers exactly what Plan 01 specified. The Unsupported() declaration is a one-line schema annotation, not a model change.

## Deferred Items

Logged here, not fixed (out of scope — pre-existing drift unrelated to Plan 01):
- `AccGraphLayoutCache.nodes` and `.edges` have DEFAULTs in the live DB that schema.prisma doesn't declare. `prisma migrate diff` proposes `ALTER COLUMN ... DROP DEFAULT`. Out of scope for Phase 03.
- HNSW indexes `LodEmbedding_pgvector_hnsw_idx` and `lod_embedding_pgvector_idx` exist in DB but not in schema. They're maintained by raw-SQL migrations; Prisma sees them as drift. Out of scope.

## Issues Encountered

- The `prisma migrate dev` non-interactive blocker (documented above) — resolved by switching to `migrate diff` + manual SQL + `migrate deploy`.
- The pgvector drift discovered mid-migration (documented above) — resolved by adding `Unsupported()` declaration.

## User Setup Required

None — no external service configuration required. Note the operator-side step from the plan: Railway must run `prisma migrate deploy` in the release phase (already wired per the `notes` in the prompt) before Plan 02 lands, so AccActivity has the new columns when ingest starts writing rows.

## Next Phase Readiness

- Plan 02 (`scripts/deep-sync-ingest.cjs`) can now `import { parse } from "csv-parse"` and `import unzipper from "unzipper"` directly.
- `prisma.accActivity.createMany({ data, skipDuplicates: true })` is now meaningful — the composite `@@unique` makes it a real `ON CONFLICT DO NOTHING`.
- Plan 02 must write `sourceFile: "project"` or `sourceFile: "admin"` per row, and substitute an empty-string sentinel for `projectId` on admin rows so the dedup applies.
- Plan 03 (`getFileActivityForUser`) has the `(userEmail, createdAt DESC)` index it needs.
- Plan 04 (RecentlyAdded inviter attribution) has the `UnresolvedAttribution` table for forensic logging of failed matches.

## Self-Check: PASSED

- FOUND: prisma/migrations/20260511151713_acc_activity_v2/migration.sql
- FOUND: .planning/phases/03-activity-pipeline/03-01-SUMMARY.md
- FOUND commit: 284633b (Task 1)
- FOUND commit: 2f77169 (Task 2)
- FOUND commit: c955b2a (Task 3)

---
*Phase: 03-activity-pipeline*
*Completed: 2026-05-11*
