# Phase 14: Characterization Tests - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Pin the **current** behavior of the access-analysis terrain boundary and the
shared `AccFolderPermission` join so the deferred REF-01 (monolith split) and
REF-02 (`folderPermQuery` extraction) refactors are safe to perform later, and
stamp the three monolith files with `// SPLIT-PENDING:` warning comments.

Fixed scope (ROADMAP Phase 14, requirements TEST-02 + TEST-03):
- Characterization tests for the access-analysis terrain **boundary outputs**
  and pure transforms.
- A characterization test for the shared `AccFolderPermission` terrain query
  (used by both `/template-mty` and `/access-analysis`).
- `// SPLIT-PENDING:` comments on all three monoliths referencing REF-01/REF-02.
- `npm test` green with the new tests.

Explicitly NOT in this phase: performing the REF-01/REF-02 splits themselves,
any `/users/spatial-graph` work, and any new analytics/UI behavior.

</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` (Phase 14 details) + `.planning/REQUIREMENTS.md`
  (TEST-02, TEST-03; REF-01/REF-02 are deferred Future requirements) — fixed the
  scope, the three monolith targets, and the four success criteria.
- `.planning/STATE.md` — Phase 13 COMPLETE, Phase 14 is the final v2.1 phase;
  depends on Phase 10 (done).
- `.planning/codebase/TESTING.md` — established the binding conventions: Vitest,
  `node` env, inject a fake `db` with `vi.fn()`, **no real DB in unit tests**,
  explicit `.toEqual` assertions (repo has **zero** `toMatchSnapshot` usage),
  **no jest-dom** matchers, tRPC pattern = `createCaller`/injected `db.$queryRaw`
  with chained `mockResolvedValueOnce` (see `acc-activity.coverage.test.ts`,
  `expect(db.$queryRaw).toHaveBeenCalledTimes(7)`).
- Source verified by Grep/Read:
  - `app/(dashboard)/access-analysis/folderTerrain.ts` — pure transforms
    (`buildScene`, `buildCameraScene`, `buildStackedScenes`, `rankForTier`, …)
    **already covered** by `app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts`.
  - `lib/server/folderPermissionTerrainView.ts` — exports `loadTerrainProjects()`,
    `loadFolderPermissionTerrain()` → `FolderTerrainData`, and
    `loadFolderPermissionOverview()` → `FolderTerrainData`; each runs multiple
    raw `db.$queryRaw` calls over `AccFolderPermission`. **No test file exists** →
    this is the TEST-02 boundary gap.
  - `lib/server/templateFolderTerrain.ts` — exports the **pure** `buildFolderTerrain()`
    (already covered by `lib/server/__tests__/templateFolderTerrain.test.ts`) and
    `loadTemplateFolderTerrain()` whose `$queryRaw` role/perm/folder join over
    `AccFolderPermission` is the **same shared join** as in
    `folderPermissionTerrainView.ts` → the TEST-03 / REF-02 target.
  - `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx` — third
    monolith; a **client** DuckDB/Mosaic component; real logic is browser-only.
- VERIFY: the exact mock seam for the `lib/server` loaders — whether `db` is a
  module-level `@/server/db` import (mock via `vi.mock`) or injectable — confirm
  by mirroring the existing `lib/server/acc-hot-cache.test.ts` before writing the
  boundary tests.
- VERIFY: the precise `$queryRaw` call order inside `loadFolderPermissionTerrain`
  (projects → folders → role/perm → users×2) so the fake `db.$queryRaw` chains
  `mockResolvedValueOnce` in the right sequence.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Test framework/conventions per `TESTING.md`: Vitest, `node` env, fake `db`
  (`vi.fn()`), no real DB, explicit `.toEqual` shape assertions, no jest-dom.
- Do **not** re-pin the pure geometry in `folderTerrain.ts` — `folderTerrain.test.ts`
  already covers it. New tests target the **untested** `folderPermissionTerrainView.ts`
  boundary + the shared query contract.
- `// SPLIT-PENDING:` top-of-file comment on all three monoliths referencing
  REF-01 (and REF-02 where the shared query lives) — criteria #2 is explicit, no
  choice needed.
- Gates: `npx tsc --noEmit` (typechecks the whole tree incl. tests) + `npm test`
  green before any rebuild; `/users/spatial-graph` untouched.
- Test placement follows existing layout: `lib/server/__tests__/` for the
  boundary/shared-query tests (co-located with `templateFolderTerrain.test.ts`),
  matching repo Pattern 1/2.

</defaults>

<decisions>
## Implementation Decisions

### Pinning strictness — HYBRID
- **Shared `AccFolderPermission` query (TEST-03):** structural **contract** only —
  assert the returned column set, value types, ordering invariants, and the
  row-bound (grouped result ≤ `n_roles × n_projects`, never raw permission rows).
  Refactor-tolerant so REF-02 extraction won't fight the test.
- **Boundary transform outputs (`loadFolderPermissionTerrain` /
  `loadFolderPermissionOverview` → `FolderTerrainData`):** one **golden-master**
  `.toEqual(...)` on a fixed in-memory fixture per boundary — pins the full
  assembled shape AND values so a split that perturbs assembly fails.
- Net: contract on the query rows, golden-master on the assembled output.

### Third monolith scope (`HybridAnalyticsSurface.tsx`) — COMMENT-ONLY
- Add the `// SPLIT-PENDING:` comment (criteria #2) but **no new tests**.
- Rationale: it is a client DuckDB/Mosaic component on the legacy
  `/users/access-analysis` surface; its real logic is browser-only and its
  extractable helpers are thin. Test budget goes to the two live terrain
  boundaries driving `/access-analysis` + `/template-mty`.

### Shared-query characterization (TEST-03) — MOCK-DB CONTRACT
- Inject a fake `db.$queryRaw` returning representative rows; assert the column
  set + that grouping collapses to ≤ `n_roles × n_projects`. Pure, fast, matches
  the repo convention (no real DB). Row-bound is proven by the aggregation logic,
  not by live counts. **No committed real-data fixture** (rejected: heavier,
  staleness risk).

### Coverage breadth — TARGETED
- Pin: the untested `folderPermissionTerrainView.ts` boundary outputs + the
  shared-query contract + the primary transform entry points. Skip what
  `folderTerrain.test.ts` / `templateFolderTerrain.test.ts` already cover. No
  redundant re-pinning of pure geometry.

### Claude's Discretion
- Exact fixture factories (mirror the `mk(...)` inline-factory style in
  `roleCounts.test.ts` / `folderTerrain.test.ts`), test file names, the precise
  `SPLIT-PENDING` wording, and how the `$queryRaw` call sequence is mocked — all
  within the conventions above and the verified call order.

</decisions>

<specifics>
## Specific Ideas

- Characterization intent is "lock current behavior before a risky split," not
  "assert correctness." Tests should read as golden-master pins, with a brief
  comment noting REF-01/REF-02 as the deferred extraction targets they protect.
- Mirror the existing fake-`db` chained-`mockResolvedValueOnce` pattern already
  proven in `server/routers/acc-activity.coverage.test.ts`.

</specifics>

<workshop>
## Workshop Impact

- Surfaces: `/access-analysis` and `/template-mty` (terrain views) — **no
  user-visible change**. This is a safety-net phase: it makes the deferred
  monolith/query refactors safe and adds `SPLIT-PENDING` signposts for the next
  contributor. `/users/access-analysis` (HybridAnalyticsSurface) gets only a
  comment.
- Demo benefit: indirect — lower regression risk for the two terrain surfaces
  the workshop relies on.

</workshop>

<data_truth>
## Data Truthfulness

- No data changes. Tests use synthetic in-memory fixtures via a fake `db`; they
  do not read the live PostgreSQL DB.
- The shared-query row-bound (≤ `n_roles × n_projects`) is asserted from the
  aggregation logic, consistent with the TEST-01 OOM-aggregate guard already in
  `acc-hot-cache.test.ts`. No claim of live-data coverage is made.

</data_truth>

<deferred>
## Deferred Ideas

- REF-01 — split `FolderPermissionTerrain.tsx` (1,041) / `folderTerrain.ts`
  (1,093) / `HybridAnalyticsSurface.tsx` (1,326) into data-hook / transform /
  thin-view modules. (Already tracked; this phase only makes it safe.)
- REF-02 — extract `lib/server/folderPermQuery.ts` owning the base
  `AccFolderPermission` join. (Already tracked; TEST-03 pins it first.)
- A committed real-data fixture for the shared query (rejected this phase as
  staleness-prone) could be revisited if the mock contract proves too loose.

</deferred>

<verification>
## Verification Expectations

- `npx tsc --noEmit` (whole-tree, incl. new test files) before any rebuild.
- `npm test` green with all new characterization tests included (criteria #4).
- Confirm: `loadFolderPermissionTerrain` / `loadFolderPermissionOverview`
  boundary outputs are pinned (TEST-02); the shared `AccFolderPermission` join
  contract is pinned with a row-bound (TEST-03); all three monoliths carry a
  `// SPLIT-PENDING:` comment referencing REF-01/REF-02 (criteria #2).
- Negative check: diff touches only test files, the three monolith file headers,
  and (if needed) the shared-query module — **no** `/users/spatial-graph` files
  and no behavior changes to the loaders/transforms themselves.

</verification>

---

*Phase: 14-characterization-tests*
*Context gathered: 2026-06-30*
