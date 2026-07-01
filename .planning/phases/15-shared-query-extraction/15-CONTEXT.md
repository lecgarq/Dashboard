# Phase 15: Shared Query Extraction - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract the base per-project `AccFolderPermission` join (the 5-column
`folder_id | role_id | role_name | perm_type | n_actions` select, currently
duplicated across `lib/server/templateFolderTerrain.ts` and
`lib/server/folderPermissionTerrainView.ts`) into a single owned module
`lib/server/folderPermQuery.ts`. Both terrain routes import from it instead of
inlining the SQL. **Behavior-preserving only** — `/template-mty`,
`/access-analysis`, and `/users/access-analysis` render identically; TEST-03
(`templateFolderTerrain.sharedQuery.test.ts`) and TEST-02
(`folderPermissionTerrainView.test.ts`) stay **byte-identical and green**.

This is QUERY-01 / REF-02. The monolith splits (REF-01, Phases 16–17) and the
`AccFolderPermissionSummary` projection (REF-03, Phases 18–19) build on this
module. No workshop-visible change; `/users/spatial-graph` untouched.

</domain>

<evidence>
## Grounding Sources

- `.claude/skills/lecg-dashboard/SKILL.md` — zinc-dark taste, source roots
  (`lib/server/`), gate order (`npx tsc --noEmit` before rebuild), no-new-WebGL,
  spatial-graph out of scope.
- `.planning/STATE.md` — Phase 15 = REF-02, the foundation for 16–19;
  behavior-preserving mandate; commit-by-explicit-path (heavy branch WIP);
  2 pre-existing WIP failures in `FolderPermissionTerrain.test.tsx` are
  unrelated (deferred to Phase 16, which touches that surface).
- `.planning/ROADMAP.md` Phase 15 success criteria (5 SCs) + `REQUIREMENTS.md`
  QUERY-01 — define the exact contract this phase must satisfy.
- **Source (read):** `lib/server/templateFolderTerrain.ts` (join at L179–186,
  all-folders, no parent filter) and `lib/server/folderPermissionTerrainView.ts`
  (join at L96–107, L2-only via `JOIN "AccFolder" parent … parent.name =
  'Project Files'`) — proved the two joins are **not identical**; the scope
  filter differs and must be preserved.
- **TEST-03 (read):** `lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts`
  — assertion #4 pins `db.$queryRaw` "called exactly once" with `TEMPLATE_MTY_ID`
  present in the tagged-template call args. This **forbids** `Prisma.sql`
  fragment composition on the template-mty path (it would change the mock call
  shape and break the byte-identical requirement).

VERIFY: none — all claims above are grounded in files read this session.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Target file is `lib/server/folderPermQuery.ts` (fixed by QUERY-01), in the
  verified `lib/server/` source root.
- The module owns the 5-column select + `AccRole`/`AccFolder` joins +
  project-scoped `WHERE f."projectId" = ${projectId}` + the
  `COALESCE(cardinality(fp.actions), 0)::int AS n_actions` null-path handling.
- **Plain tagged-template `db.$queryRaw` on both scope branches** — NO
  `Prisma.sql` / `Prisma.raw` / `Prisma.join` composition — so both TEST-03 and
  TEST-02 stay byte-identical regardless of what they assert.
- The all-folders vs L2-only scope difference is **preserved, not unified**
  (template-mty needs the full tree for its BFS inheritance walk;
  access-analysis needs L2-scoped rows or its cells would change).
- Zinc theme, ECharts, and all workshop UI are irrelevant here — pure
  server-side query relocation, no rendering change.
- Commit the new file + edited callers **by explicit path only** (never
  `-A`/`.`); the branch carries unrelated WIP + `.planning/` migration deletions.

</defaults>

<decisions>
## Implementation Decisions

### Extraction scope — base join only
- Extract **only** the per-project 5-column join genuinely duplicated across the
  two files. Leave in place (single-use, not duplicated): the account-wide
  overview `GROUP BY` aggregate + CTEs (`loadFolderPermissionOverview`), the
  projects-density query (`loadTerrainProjects`), and the access-analysis
  "Project Files" parent-grants inheritance query. Smallest diff; exactly
  QUERY-01. Broader consolidation is explicitly deferred (see Deferred Ideas).

### Module API — one parameterized function, raw rows
- Export a single async function, shape:
  `loadFolderPermRows(projectId: string, opts?: { l2Only?: boolean })`.
- Returns the **current raw snake_case rows** unchanged:
  `Array<{ folder_id, role_id, role_name, perm_type, n_actions }>`.
- Two plain tagged-template branches inside: default (all folders, no parent
  join) and `l2Only: true` (adds the `parent.name = 'Project Files'` join).
- Callers change minimally: each swaps its inline `$queryRaw` block for a call.
  - `templateFolderTerrain.ts` → `loadFolderPermRows(TEMPLATE_MTY_ID)`, keeps its
    existing `.map()` to camelCase for `buildFolderTerrain`.
  - `folderPermissionTerrainView.ts` → `loadFolderPermRows(projectId, { l2Only:
    true })` inside its `Promise.all`, keeps its snake_case downstream usage
    (`perms.map(p => p.folder_id …)`) untouched.
- Rationale: lowest-risk diff on golden-master-pinned surfaces; both callers'
  transform/mapping code is preserved verbatim; only one `$queryRaw` runs per
  `loadTemplateFolderTerrain` call (TEST-03 "called once" holds).

### Claude's Discretion
- Exact TypeScript row/return type naming and whether `opts` defaults to `{}` or
  is a second positional boolean (will use `{ l2Only }` for call-site clarity).
- JSDoc wording and the `SPLIT-PENDING: REF-02` → resolved comment cleanup on the
  two source files (the deferred-target comments now point at a file that exists).
- Whether to keep a shared SELECT-projection constant inside the module vs.
  repeating the identical select text across the two tagged-template branches
  (must stay tagged templates either way — no `Prisma.sql`).

</decisions>

<specifics>
## Specific Ideas

- The hard design constraint driving the "plain tagged-template" default: TEST-03
  assertion #4 mocks `db.$queryRaw` and checks `mock.calls[0]` contains
  `TEMPLATE_MTY_ID`. Any `Prisma.sql`-composed query passes a single `Prisma.Sql`
  object as `calls[0][0]` and breaks that assertion — so fragment composition is
  off the table for this extraction.
- Treat Luis as the workshop presenter: the win is internal maintainability
  (one owned query for the REF-01/REF-03 work that follows), with provably zero
  change to what the demo shows.

</specifics>

<workshop>
## Workshop Impact

- Surfaces touched (server-side only, no visible change): `/template-mty`
  (`loadTemplateFolderTerrain`) and `/access-analysis`
  (`loadFolderPermissionTerrain`).
- Nothing should look or behave differently in the workshop. The value is
  structural: the shared join gets one owner, unblocking the Phase 16–19 splits
  and summary projection.

</workshop>

<data_truth>
## Data Truthfulness

- No data changes. Same Prisma source (`AccFolderPermission ⨝ AccRole ⨝
  AccFolder`, project-scoped), same rows, same values. The extraction relocates
  SQL; it does not alter coverage, aggregation, or labeling.
- Row-bound + inheritance semantics are unchanged (grouping happens in the
  callers' transforms, which are not modified).

</data_truth>

<deferred>
## Deferred Ideas

- Co-locating the adjacent single-use `AccFolderPermission` reads (overview
  `GROUP BY`, projects-density, parent-grants inheritance query) into
  `folderPermQuery.ts` as a fuller "folder-permission query" home — out of scope
  for QUERY-01 (they aren't duplicated). Candidate for a later tidy-up, not this
  phase.
- Returning a typed camelCase canonical row and rewriting access-analysis's
  snake_case usage — rejected here to minimize churn on the pinned surface;
  could revisit once REF-01 splits land (Phase 16).

</deferred>

<verification>
## Verification Expectations

- `npx tsc --noEmit` exits 0 after the extraction (before any rebuild).
- `npm test` green with **zero changes** to `templateFolderTerrain.sharedQuery.test.ts`
  (TEST-03) and `folderPermissionTerrainView.test.ts` (TEST-02) — byte-identical.
  (Note: the 2 pre-existing `FolderPermissionTerrain.test.tsx` WIP failures are
  unrelated branch debt, deferred to Phase 16 — do not "fix" them here.)
- Grep confirms no duplicated join SQL remains in `templateFolderTerrain.ts` or
  `folderPermissionTerrainView.ts` (SC#2).
- Owner visual parity check on `/template-mty` and `/access-analysis` — must
  render identically to pre-phase (SC#5).
- `/users/spatial-graph` not touched; commit by explicit path only; verify
  `git diff --cached --name-only` before committing.

</verification>

---

## Dashboard self-check

- **Context:** Loaded SKILL.md, STATE.md, PROJECT.md, ROADMAP.md (Phase 15),
  REQUIREMENTS.md (QUERY-01), and read the two source files + the TEST-03 file.
- **Evidence:** Duplicated join located at `templateFolderTerrain.ts:179` and
  `folderPermissionTerrainView.ts:96`; scope difference (parent join) confirmed;
  TEST-03 assertion #4 confirmed as the constraint forbidding `Prisma.sql`.
- **Constraints:** Behavior-preserving, byte-identical tests, tagged-template
  only, explicit-path commits, spatial-graph untouched.
- **Gates:** `npx tsc --noEmit` → `npm test` (TEST-02/TEST-03 byte-identical) →
  grep for residual duplicated SQL → owner visual parity check.
- **VERIFY:** none.

---

*Phase: 15-shared-query-extraction*
*Context gathered: 2026-07-01*
