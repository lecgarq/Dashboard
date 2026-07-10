---
phase: 22-issue-type-resolution
plan: 01
subsystem: data-layer
tags: [prisma, migration, aps-backfill, issue-types]
dependency-graph:
  requires: []
  provides: [AccIssueType-lookup-table, acc-issue-types-backfill-script]
  affects: [lib/server/issueFunnelView.ts (future 22-02/22-03 consumer)]
tech-stack:
  added: []
  patterns: [raw-SQL-migration-fallback, global-GUID-upsert-dedupe, 3-leg-APS-auth-backfill-script]
key-files:
  created:
    - prisma/migrations-raw/2026-07-10-acc-issue-type.sql
    - scripts/acc-issue-types-backfill.cjs
  modified:
    - prisma/schema.prisma
    - docs/erd.md
decisions:
  - "Migration applied via prisma/migrations-raw/ raw SQL, not `prisma migrate dev` — the shadow DB chokes on the pre-existing pgvector requirement from migration 20260416011500_fix_lod_search_foundation (P3018), same standing guardrail already documented in STATE.md for AccInstanceEmbedding/AccActivityAccds."
  - "APS issue-types endpoint returns 404 ISSUES_SERVICE_NOT_FOUND for containers where the Issues module isn't provisioned (596/1153 projects), distinct from the 403-forbidden pattern the sibling /issues list endpoint uses (only 38/1153 here). Both are counted honestly and separately (error vs forbidden) — not a bug, a real APS response-shape difference discovered empirically."
metrics:
  duration: ~50min
  completed: 2026-07-10
status: complete
---

# Phase 22 Plan 01: Additive AccIssueType Lookup Table + APS Backfill Script Summary

Additive `AccIssueType` Prisma model (applied via raw-SQL migration fallback after
`prisma migrate dev` hit the known pgvector shadow-DB choke) plus a re-runnable,
idempotent APS issue-types metadata backfill script, live-run against all 1,153
accessible projects: 316/316 distinct `issueTypeId` GUIDs on `AccIssue` now have
298 resolved to human-readable names (18 genuinely unresolved — a live "Unknown
type" case exists for 22-03), 515/515 distinct `issueSubtypeId` GUIDs have 477
resolved.

## What Was Built

**Task 1 — `AccIssueType` model + migration.** Appended a purely-additive model to
`prisma/schema.prisma` (GUID `@id`, `name`, `kind` ("type"|"subtype"),
`parentTypeId` nullable, `updatedAt` freshness record — no run-audit table, per
the locked CONTEXT.md decision). `npx prisma migrate dev --create-only` failed
before creating any migration folder (P3006/P3018: shadow DB errors on
`CREATE EXTENSION "vector"` from an unrelated prior migration
`20260416011500_fix_lod_search_foundation`). Fell back to the documented
`prisma/migrations-raw/` pattern: hand-wrote
`prisma/migrations-raw/2026-07-10-acc-issue-type.sql` (clones the shape of the
two existing precedent files), applied with
`npx prisma db execute --file prisma/migrations-raw/2026-07-10-acc-issue-type.sql`
(Prisma 7.8.0 CLI reads the datasource from `prisma.config.ts`, no `--schema`
flag needed — a plan-doc deviation from Prisma 6-era CLI syntax, auto-corrected
per Rule 3). No `migrate resolve` was needed since no migration folder was ever
created. `npx prisma generate` regenerated the client and `docs/erd.md`
(tracked generated file, included in the commit).

**Task 2 — `scripts/acc-issue-types-backfill.cjs`.** Structural clone of
`scripts/acc-issues-backfill.cjs`: `require("tsx/cjs")` + dotenv preamble,
`refreshAndPersistFromDb(db, "data:read")` 3-leg auth, `prisma()` factory
(`PrismaPg` adapter, `DIRECT_URL || DATABASE_URL`), `apiGet()` retry-on-429/5xx
loop, `--dry-run` / `--project=<id>` flags, per-project console progress with
`ok`/`zero`/`forbidden`/`error` counters and a final summary line. New
`buildIssueTypesUrl`/`listIssueTypes` paginate
`GET /construction/issues/v1/projects/{id}/issue-types?include=subtypes&limit=100&offset=N`
stopping on `pagination.totalResults` or an empty `results` page. Writes:
`db.accIssueType.upsert` by `id` for each `results[]` type (`kind: "type"`,
`parentTypeId: null`) and each `subtypes[]` entry (`kind: "subtype"`,
`parentTypeId: <parent type id>`) — global GUID dedupe, last-crawled name wins.
A 401 is distinguished from the expected per-project 403s (would indicate a
scope problem, none observed).

Dry-run against one known-accessible project
(`4b61c346-4240-4d61-a37c-f76a9dc13a40`, sourced from
`AccIssueProjectFetchResult` status='ok') logged the full raw response of the
first type and confirmed the MEDIUM-confidence research field mapping exactly:
`title` (not `name`), `subtypes[].id`, `subtypes[].issueTypeId`,
`subtypes[].title` — human-readable titles ("Design", "Requirement Change",
"Client Feedback", "Work to Complete", "Building Code", "Existing Condition").
No code changes were needed after the dry-run; zero DB writes confirmed
(`AccIssueType` count stayed 0).

**Task 3 — Live backfill + evidence.** Full crawl of all 1,153 `AccProject`
rows. Final summary line:

```
projects ok=519 zero=0 forbidden=38 error=596 types upserted=5291 subtypes upserted=11637
```

**Finding (not a bug):** the issue-types endpoint's failure mode differs from
the sibling `/issues` list endpoint's ~724-forbidden pattern the research
anticipated. Instead of mostly-403, most inaccessible-for-issue-types
containers (596/1153) return `404 { errorCode: "ISSUES_SERVICE_NOT_FOUND" }` —
the Issues module simply isn't provisioned in those Docs-only containers,
distinct from the 38/1153 that are genuinely 403-permission-locked. The script
counts both honestly and separately (`error` vs `forbidden`); this does not
affect the lookup table's correctness or the coverage caption's honesty (both
are unresolvable-project counts either way).

### Evidence (live DB, post-run)

1. **Per-kind row counts:** `kind='type'` → 5,291 rows; `kind='subtype'` →
   11,637 rows. (Far exceeds the 316/515 counts used on actual `AccIssue` rows
   because each project instantiates its own copy of the ACC issue-type
   template with distinct GUIDs — the table stores every distinct GUID
   discovered across all 519 accessible projects, matching the CONTEXT.md
   "global GUID→name dedupe" design.)
2. **`AccIssue` distinct GUID counts (unchanged, matches REQUIREMENTS.md
   baseline):** `issueTypeId` → 316 distinct; `issueSubtypeId` → 515 distinct.
3. **Resolution split:** 298 of 316 distinct `issueTypeId` GUIDs resolve via
   `AccIssueType` (18 unresolved — confirms a **live unresolved GUID exists**,
   satisfying roadmap success criterion 4 for 22-03's "Unknown type" live
   verification, no unit-test-only fallback needed). 477 of 515 distinct
   `issueSubtypeId` GUIDs resolve (38 unresolved).
4. **Spot-check (5 rows):** `Design` (type), `Design` (subtype),
   `Requirement Change` (subtype), `Client Feedback` (subtype), `Work to
   Complete` (subtype) — all human-readable, no GUIDs rendered as names.
5. **Idempotency:** total row count before re-run = 16,928; re-ran
   `--project=4b61c346-4240-4d61-a37c-f76a9dc13a40` alone (10 types + 21
   subtypes upserted again); total row count after = 16,928 (unchanged —
   confirmed upsert-by-GUID, no duplicates).

## Verification

- `npx tsc --noEmit` — clean (0 errors), run after Task 1's schema/client
  change and again after the full Task 3 live run.
- `npm test` — 2,495 passed / 1 skipped / 0 failed (STATE.md baseline was
  2,477; growth is pre-existing uncommitted WIP already in this branch's
  working tree, unrelated to this plan — this plan added zero test files and
  zero app-code changes).
- `git diff --cached --name-only` before each commit: Task 1 commit touched
  exactly `prisma/schema.prisma`, `prisma/migrations-raw/2026-07-10-acc-issue-type.sql`,
  `docs/erd.md`; Task 2 commit touched exactly `scripts/acc-issue-types-backfill.cjs`.
  No `AccIssue` model diff, no existing issue query touched, no
  `mainCharts.tsx`/`issueFunnelView.ts` touched, `/users/spatial-graph`
  untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma 7 CLI dropped the `--schema` flag on `prisma db execute`**
- **Found during:** Task 1, applying the raw-SQL migration fallback.
- **Issue:** The plan's documented command
  (`npx prisma db execute --file ... --schema prisma/schema.prisma`) errored
  with `unknown or unexpected option: --schema` — Prisma 7.8.0's CLI reads the
  datasource from `prisma.config.ts` instead.
- **Fix:** Ran `npx prisma db execute --file prisma/migrations-raw/2026-07-10-acc-issue-type.sql`
  without `--schema`. Succeeded immediately ("Script executed successfully").
- **Files modified:** none (command-only fix).
- **Commit:** N/A (no file change from this fix itself).

No architectural deviations. The `prisma migrate dev` → `migrations-raw`
fallback itself was an explicitly pre-authorized branch in the plan (Pitfall 3
in 22-RESEARCH.md), not a deviation.

## Workshop Impact

None yet — this plan is purely data-layer (additive table + populated lookup
data). No route, page, or chart changed. `/access-analysis` Projects tab is
unaffected until 22-02/22-03 build the ISSUE-05 chart consuming this table.

## Data Truthfulness Notes

- Source: live APS `GET .../issue-types?include=subtypes` crawl over all 1,153
  `AccProject` rows, upserted by GUID (last-crawled name wins).
- Under-covered and labeled: 596 projects 404 (Issues module not provisioned in
  that container) + 38 projects 403 (permission-locked) — both are excluded
  from the lookup table honestly (no fabricated rows). The resulting 18
  unresolved `issueTypeId` / 38 unresolved `issueSubtypeId` GUIDs on `AccIssue`
  are real, live, unresolvable-from-this-account gaps that 22-03's "Unknown
  type" bucket must render, not hide.
- No hardcoded counts were written into any app code — all figures above are
  from this session's live DB queries, recorded here as evidence only.

## Known Stubs

None — this plan has no UI surface.

## Threat Flags

None — purely additive lookup table + a manually-run backfill script using the
existing 3-leg APS auth helper; no new endpoint, no new auth path, no schema
change at a trust boundary beyond one new table with no relations.

## Dashboard Self-Check

- **Context:** `.planning/STATE.md`, `.planning/PROJECT.md`, `22-CONTEXT.md`,
  `22-RESEARCH.md`, `22-01-PLAN.md`, `prisma/schema.prisma`,
  `scripts/acc-issues-backfill.cjs`, `lib/acc/apsAuth.ts` all read this
  session.
- **Evidence:** every path/command/model/endpoint in this plan verified
  against repo files or a live APS response (dry-run) before use; the APS
  response field-name mapping was MEDIUM-confidence in research and is now
  HIGH-confidence (empirically confirmed this session).
- **Constraints:** no `/users/spatial-graph` touch, no new npm dependency, no
  new WebGL, zinc theme N/A (no UI this plan), additive-only schema change,
  `npx tsc --noEmit` run twice (clean both times).
- **Gates:** `npx tsc --noEmit` (clean), `npm test` (2495/1/0, no regressions),
  live DB row-count/spot-check evidence (above) in place of an automated test
  (script has no CI harness, matching `acc-issues-backfill.cjs`'s own
  precedent).
- **VERIFY:** none remaining for this plan's scope.

## Self-Check: PASSED

- FOUND: `prisma/migrations-raw/2026-07-10-acc-issue-type.sql`
- FOUND: `scripts/acc-issue-types-backfill.cjs`
- FOUND: commit `fbe451ab` (Task 1)
- FOUND: commit `a5d56e35` (Task 2)
- FOUND: live `AccIssueType` table populated (16,928 rows: 5,291 type + 11,637 subtype)
