# Phase 22: Issue Type Resolution - Research

**Researched:** 2026-07-10
**Domain:** Additive Prisma lookup table + one-time APS metadata backfill script (clone of an existing script) + a top-N/Other ECharts bar chart following an established 4-layer registration pattern. No new npm dependencies, no new UI framework surface.
**Confidence:** HIGH (every claim below is grounded in a file read from this repo, except the exact APS issue-types response JSON shape, which is MEDIUM — cross-verified across two independent web sources but not fetched as raw JSON from a live call in this session)

<user_constraints>
## User Constraints (from 22-CONTEXT.md)

### Locked Decisions

**Chart form & drill behavior**
- Horizontal bars, top-N ranked + "Other" row (`ProvisionedModulesChart` pattern) — not a donut; long type names read better as bars.
- Click a type → per-project drill: ranked list of projects containing issues of that type, matching `IssueStatusChart`'s per-status project drill convention.
- Top-10 + expandable "Other": `Other (N types)` expands in place via the same `summarize*(rows, topN=rows.length)` re-invocation pattern locked in 20.1-07 (`PermissionLevelChart`/`FolderActivityByCompanyChart`), with a collapse-back link.
- Full-width third panel stacked below `IssueStatusChart` — do not touch 21-04's shipped 2-panel layout other than appending the sibling.

**Subtype surfacing**
- Backfill-only this phase. All 515 subtype GUIDs land in the lookup table (ISSUE-04 covers both kinds), but the chart and drill stay type-level — no subtype UI in Phase 22. A future subtype cut becomes cheap because the names are already resolved.

**Backfill lifecycle**
- Idempotent, re-runnable script (upsert by GUID), run manually — no cron, no Task Scheduler change this phase. When "Unknown type" volume grows over time, the answer is "re-run the script."
- Accessible projects only; 403 gaps labeled honestly. Crawl what the account can reach, dedupe GUIDs across projects; GUIDs that only exist in locked projects stay unresolved and render "Unknown type" with the coverage caption stating the live split.
- Script UX matches `acc-issues-backfill.cjs`: per-project console progress, 403/error counters, final summary; safe to Ctrl+C and re-run. No run-audit table — the lookup table's `updatedAt` is the freshness record.

**Lookup table shape**
- One table, kind column: GUID PK, `name`, `kind` (`"type"` | `"subtype"`), parent type GUID for subtypes (nullable). One migration, one upsert path, one resolver.
- Global GUID→name dedupe — GUID is the PK, no per-project rows; last-crawled name wins. The chart aggregates account-wide, so per-project provenance is unused.

**Coverage honesty display**
- "Unknown type" ranks by count like any real type — competes for a top-N slot; if unknowns are the #2 volume the chart says so (20.1-03 UNKNOWN_COMPANY precedent: ranked, not pinned, lossless inside Other when small).
- Null `issueTypeId` is its own explicit bucket — never dropped; population totals must reconcile with the status donut above.
- Caption combines both truths: "N of M type GUIDs resolved to names" (live-computed from the lookup table vs distinct `issueTypeId`s) + the existing issue-fetch coverage line (`deriveIssueCoverageCaption`) the sibling panels already show. Zero hardcoded figures — never bake in "316".
- Empty/not-run state: if zero GUIDs resolve (fresh environment, backfill never run), replace the all-Unknown wall with an explicit notice — "Type names not yet backfilled — run scripts/<script-name>.cjs" — instead of rendering 100% Unknown bars.

**Issue population**
- Match the Phase 21 funnel exactly: the same full 17,360-row `AccIssue` set (no `isCoordination` filter, no `deleted` filter) so all three sibling panels answer over the same population and counts reconcile across the tab.

**Data-layer integration**
- Extend `loadIssueFunnel()` (`lib/server/issueFunnelView.ts`) with a third cut (type `groupBy` + lookup-name join) inside its existing `Promise.all` — same 5-min TTL cache, same single lazy Projects-tab fetch, zero new action or fetch branch in `AccessAnalysisCharts.tsx`. Matches the STATE.md fan-out-consolidation guardrail.

**Owner checkpoint scope**
- One checkpoint at the end of the phase: ISSUE-04's backfill verifies via script output + DB counts (no owner eyes needed); one `:3100` production-preflight owner checkpoint after ISSUE-05 wiring, same shape as 21-04/21.1-04. `:3000` untouched until the owner asks for a deploy.

### Claude's Discretion
- Exact table/model name, column names, index choices (verified against schema conventions at planning time). **Research recommendation: `AccIssueType`** — matches the existing `AccRole` lookup-table shape (`id String @id`, `name String`, no relations required for the chart).
- Chart accent color (distinct from the amber timeline + status donut palette), exact copy for titles/subtitles/captions (subtitle should state the question the panel answers, per the 20.1-07 owner preference), spacing, skeleton behavior.
- Whether the transform lives in a new `issueTypeCounts.ts` or extends `issueFunnelCounts.ts` — follow the 21-02 fixed-bucket/honest-overflow file pattern.
- Script name and flag details, provided conventions above hold. **Research recommendation: `scripts/acc-issue-types-backfill.cjs`** (parallels `acc-issues-backfill.cjs`) or `scripts/backfill-issue-types.cjs` (parallels `backfill-folder-perm-summary.cjs`) — both are live repo naming conventions; either satisfies the constraint.

### Deferred Ideas (OUT OF SCOPE)
- Subtype-level UI (drill or stacked cut) — data will be ready in the lookup table; future phase/seed.
- Automated type-metadata refresh (cron piggyback on issue ingestion) — manual re-run suffices for now.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| ISSUE-04 | Issue type/subtype GUIDs resolve locally to human-readable names via a new Prisma lookup table populated by a one-time APS issue-types metadata backfill (existing 3-leg auth, `acc-issues-backfill.cjs` pattern; 316 type / 515 subtype GUIDs). Unresolved IDs render "Unknown type", never a raw GUID. | Verified `scripts/acc-issues-backfill.cjs` clone pattern (auth, pagination, per-project loop, console summary); verified `AccIssue.issueTypeId`/`issueSubtypeId` fields (schema.prisma:847-848); verified `AccRole` as the closest existing lookup-table shape; verified APS `GET /construction/issues/v1/projects/{projectId}/issue-types?include=subtypes` endpoint path, pagination (`limit`/`offset`/`pagination.totalResults` — same shape `listIssuesForDeletedFilter` already parses), and response field names (`id`, `title`, `subtypes[].id`, `subtypes[].issueTypeId`, `subtypes[].title`) via APS docs + cross-referenced OpenAPI gist. Verified `prisma/migrations-raw/` fallback pattern (2 precedent files) for when `prisma migrate dev` chokes. |
| ISSUE-05 | Issues by type as a top-N + "other" breakdown chart, every `issueTypeId` resolved via the ISSUE-04 lookup table. | Verified `lib/server/issueFunnelView.ts::loadIssueFunnel()`'s exact `Promise.all` shape and its Vitest mock harness (`lib/server/issueFunnelView.test.ts`) — third-cut extension point identified with a concrete pitfall (see Common Pitfalls #1). Verified `summarizePermissionLevel`'s top-N + "Other (N roles)" + expand-in-place pattern (`permissionLevelCounts.ts`) as the exact shape to clone for top-N + "Other" bucketing. Verified `ProvisionedModulesChart.tsx` as the exact horizontal-bar + local-drill-state component shape to clone. Verified `ProjectsTabPanel.tsx`'s reserved mount point (comment at line 141: "Phase 22's issues-by-type chart appends here as a third sibling, zero redesign"). Verified `AccessAnalysisCharts.tsx`'s lazy fetch-once-per-tab wiring (`issueFunnelFetchedRef`, `tab === "projects"`) already threads `loadIssueFunnel` — zero new prop needed for the fetch itself, only a new memo (`filteredIssueTypeRows`) mirroring `filteredIssueStatusRows`. |
</phase_requirements>

## Summary

Phase 22 is two clean extensions of patterns that already exist verbatim in this repo — there is no new architecture to design, only faithful cloning. ISSUE-04 clones `scripts/acc-issues-backfill.cjs`'s auth/pagination/per-project-loop/console-summary shape against a new APS endpoint (`GET /construction/issues/v1/projects/{projectId}/issue-types?include=subtypes`, same base URL, same 3-leg `refreshAndPersistFromDb` auth helper, same `limit`/`offset` pagination idiom) and upserts into one new additive Prisma model shaped like the existing `AccRole` lookup table. ISSUE-05 clones `summarizePermissionLevel`'s top-N + "Other" + expand-in-place transform and `ProvisionedModulesChart`'s horizontal-bar + local-drill-state component, mounted at the exact spot `ProjectsTabPanel.tsx` already comments as reserved.

The one real design decision — already locked by CONTEXT.md — is to extend `loadIssueFunnel()` with a third cut instead of adding a new loader, avoiding further `mainCharts.tsx`/fan-out growth (PITFALLS.md Pitfall 4). The one genuine execution risk this research surfaces (not previously flagged in CONTEXT.md) is that `lib/server/issueFunnelView.test.ts`'s existing test (b) pins `expect(mocks.queryRaw).toHaveBeenCalledTimes(1)` — the new type cut must NOT be implemented as a second `$queryRaw` call (a raw SQL join against the new lookup table) or this pin breaks; use a second `db.accIssue.groupBy(["projectId","issueTypeId"])` call (mirroring the existing status cut) plus a small `db.accIssueType.findMany()` (≤831 rows total) joined in JS instead.

**Primary recommendation:** ISSUE-04's script and model are pure clones (auth pattern held constant, endpoint and shape are new); ISSUE-05's transform and chart are pure clones (`summarizePermissionLevel`/`ProvisionedModulesChart` held constant, data source is new). Budget planning effort on getting the migration path and the loader-test-mock update right, not on inventing new chart/backfill mechanics.

## Standard Stack

### Core

No new npm dependencies — REQUIREMENTS.md's overarching guardrail ("zero new npm dependencies") applies, and every piece of this phase is buildable from already-installed packages.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `@prisma/client` / `prisma` | ^7.8.0 (verified `package.json`) | New `AccIssueType` model, migration, upsert | Already the DB access layer for every model in this repo |
| `tsx` (via `require("tsx/cjs")`) | already a dep (used by `acc-issues-backfill.cjs` line 4) | Lets the new `.cjs` script `require()` `.ts` helper modules (`lib/acc/apsAuth.ts`, etc.) directly | Exact pattern the existing backfill script uses |
| native `fetch` | Node >=22 builtin | APS API calls | `acc-issues-backfill.cjs`'s `apiGet()` already uses bare `fetch`, no HTTP client library |
| `echarts` | 6.1.0 (per REQUIREMENTS.md guardrail) | Horizontal bar chart | Same `@/components/ui/EChart` wrapper every existing chart uses |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | already configured (`vitest.config.ts` exists) | Unit tests for the loader extension, transform, and chart | `npm test` = `vitest run --exclude "**/tests/e2e/**"` (verified `package.json` line 9) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One combined `AccIssueType` table with a `kind` column | Two separate tables (`AccIssueType` + `AccIssueSubtype`) | CONTEXT.md explicitly locks the single-table-with-kind-column shape — two tables would be a needless second migration/model for no query benefit at this scale (≤831 rows total) |
| `prisma migrate dev` for the new table | `prisma db push` (no migration history) | `db:push` is a real script (`package.json` line 23) but STATE.md's standing guardrail says migrations on this DB have historically choked and the `prisma/migrations-raw/` + hand-edit-`schema.prisma` fallback is the established recovery path — prefer `migrate dev` first (this table has no BigInt/vector column so it is very likely to succeed cleanly), fall back only if it chokes |

**Installation:** none — no new packages.

## Architecture Patterns

### Recommended Project Structure (files this phase touches/adds)

```
prisma/schema.prisma                                    # + AccIssueType model (additive)
prisma/migrations/<timestamp>_add_acc_issue_type/        # normal path, OR:
prisma/migrations-raw/<date>-acc-issue-type.sql          # fallback path if migrate dev chokes
scripts/acc-issue-types-backfill.cjs                      # NEW — clones acc-issues-backfill.cjs
lib/server/issueFunnelView.ts                             # MODIFIED — 3rd cut (typeRows) in Promise.all
lib/server/issueFunnelView.test.ts                        # MODIFIED — mock the 3rd cut, do NOT break test (b)
app/(dashboard)/access-analysis/issueFunnelCounts.ts       # MODIFIED (or new issueTypeCounts.ts) — summarizeIssueType
app/(dashboard)/access-analysis/__tests__/issueFunnelCounts.test.ts  # MODIFIED/new co-located test
app/(dashboard)/access-analysis/components/IssueTypeChart.tsx        # NEW — clones ProvisionedModulesChart shape
app/(dashboard)/access-analysis/__tests__/IssueTypeChart.test.tsx    # NEW — incl. the self-grep no-cross-filter-bus test
app/(dashboard)/access-analysis/components/ProjectsTabPanel.tsx      # MODIFIED — mount at the reserved comment (line 141)
app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx  # MODIFIED — +1 memo (filteredIssueTypeRows), +2 props threaded to ProjectsTabPanel
```

`mainCharts.tsx` is **NOT modified** — `loadIssueFunnelAction` is already threaded through as a function prop (verified `mainCharts.tsx:125` `loadIssueFunnel={loadIssueFunnelAction}`); the type cut rides inside the same lazy per-tab fetch.

### Pattern 1: Clone the backfill script's shape exactly, swap the endpoint

**What:** `acc-issues-backfill.cjs`'s structure — `require("tsx/cjs")`, `refreshAndPersistFromDb(db, "data:read")` for auth, a `db.accProject.findMany({ select: { id, name } })` project list (or `--project=<id>` single-project override), a per-project loop with try/catch → counters (`ok`/`forbidden`/`error`), a final one-line summary, `--dry-run` support.
**When to use:** ISSUE-04's backfill script, verbatim structural clone.
**Example:**
```js
// Source: scripts/acc-issues-backfill.cjs (verified this session, lines 1-33, 115-150, 154-176)
require("tsx/cjs");
const { refreshAndPersistFromDb } = require("../lib/acc/apsAuth.ts");
const BASE = "https://developer.api.autodesk.com";
const DRY = process.argv.includes("--dry-run");
const ONLY = (process.argv.find((a) => a.startsWith("--project=")) || "").split("=")[1] || null;

async function apiGet(url, token, tries = 4) { /* identical retry-on-429/5xx loop */ }

// NEW: issue-types list URL builder (mirrors buildIssueListUrl's pagination idiom)
function buildIssueTypesUrl({ baseUrl, projectId, limit, offset }) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), include: "subtypes" });
  return `${baseUrl.replace(/\/+$/, "")}/construction/issues/v1/projects/${encodeURIComponent(projectId)}/issue-types?${params}`;
}

async function listIssueTypes(token, projectId) {
  const out = [];
  let offset = 0; const limit = 100;
  for (;;) {
    const url = buildIssueTypesUrl({ baseUrl: BASE, projectId, limit, offset });
    const { status, ok, body } = await apiGet(url, token);
    if (status === 403) return { forbidden: true, types: [] };
    if (!ok) throw new Error(`issue-types ${status}: ${JSON.stringify(body).slice(0, 200)}`);
    for (const it of body.results || []) out.push(it);
    const total = body.pagination?.totalResults ?? out.length;
    offset += limit;
    if (offset >= total || !(body.results || []).length) break;
  }
  return { forbidden: false, types: out };
}
```

### Pattern 2: Global GUID→name upsert, dedupe across projects

**What:** Per CONTEXT.md's locked "Lookup table shape" decision — GUID is the PK, last-crawled name wins, no per-project rows. Loop every accessible project's `results[]` (types) and `results[].subtypes[]` (subtypes), `upsert` each by `id`.
**When to use:** The core write loop of ISSUE-04's script.
**Example:**
```js
// Pattern: mirrors acc-issues-backfill.cjs's db.accIssue.upsert shape (lines 219-234)
for (const type of r.types) {
  await db.accIssueType.upsert({
    where: { id: type.id },
    create: { id: type.id, name: type.title ?? "", kind: "type", parentTypeId: null },
    update: { name: type.title ?? "", kind: "type", parentTypeId: null },
  });
  for (const sub of type.subtypes ?? []) {
    await db.accIssueType.upsert({
      where: { id: sub.id },
      create: { id: sub.id, name: sub.title ?? "", kind: "subtype", parentTypeId: type.id },
      update: { name: sub.title ?? "", kind: "subtype", parentTypeId: type.id },
    });
  }
}
```
Verified field names (`title`, `subtypes[].issueTypeId`, `subtypes[].id`) come from the official APS response shape (see Sources — MEDIUM confidence, cross-referenced across the APS docs page and an independently-hosted OpenAPI gist, not fetched as raw JSON from a live call this session).

### Pattern 3: Extend `loadIssueFunnel()` with a third cut — do NOT add a `$queryRaw` call

**What:** CONTEXT.md locks "extend `loadIssueFunnel()` ... inside its existing `Promise.all`". The existing `Promise.all` has 4 entries: a `$queryRaw` (month cut), a `groupBy` (status cut), and two `findMany`s (project name maps). Adding the type cut as a **second `groupBy`** (not a second `$queryRaw`) plus a **new small `findMany`** on the lookup table keeps the shape additive and avoids breaking `issueFunnelView.test.ts`'s `expect(mocks.queryRaw).toHaveBeenCalledTimes(1)` pin (test at line 69).
**When to use:** `lib/server/issueFunnelView.ts`'s `loadIssueFunnel()` function.
**Example:**
```ts
// Source: lib/server/issueFunnelView.ts (verified this session, lines 41-63) — extension sketch
const [monthRaw, statusGroups, typeGroups, typeLookup, projects, dcProjects] = await Promise.all([
  db.$queryRaw<RawMonthRow[]>`...`,                                   // unchanged (1 $queryRaw call — test (b) pin holds)
  db.accIssue.groupBy({ by: ["projectId", "status"], _count: { id: true } }),      // unchanged
  db.accIssue.groupBy({ by: ["projectId", "issueTypeId"], _count: { id: true } }), // NEW — 2nd groupBy call
  db.accIssueType.findMany({ select: { id: true, name: true } }),                  // NEW — ≤831 rows, cheap
  db.accProject.findMany({ select: { id: true, name: true } }),
  db.accDcProject.findMany({ select: { id: true, name: true } }),
]);
// Join typeGroups -> typeLookup in JS (tiny table, no need to push into SQL):
const nameByTypeId = new Map(typeLookup.map((t) => [t.id, t.name]));
const typeRows = typeGroups.map((g) => ({
  projectId: g.projectId,
  projectName: resolveProjectName(nameById, g.projectId),
  issueTypeId: g.issueTypeId, // keep null distinct from resolved/unknown — the chart decides "Unknown type" vs "No type"
  typeName: g.issueTypeId == null ? null : (nameByTypeId.get(g.issueTypeId) ?? null), // null here = "Unknown type" (GUID present, not resolved)
  count: g._count.id,
}));
```

### Pattern 4: Top-N + "Other" + expand-in-place transform

**What:** `summarizePermissionLevel(rows, topN = DEFAULT_TOP_N)` — sort desc, slice at `topN`, fold the rest into one `Other (N types)` bucket (no drill entry for Other), re-invoke with `topN = rows.length` to expand.
**When to use:** The new `summarizeIssueType` transform (in `issueFunnelCounts.ts` or a new `issueTypeCounts.ts`, per CONTEXT.md's discretion).
**Example:** see `app/(dashboard)/access-analysis/permissionLevelCounts.ts` lines 69-170 (full function read this session) — clone the sort/slice/fold/`projectsByRole`-style drill-map shape onto `issueTypeId`/`typeName` instead of `roleId`/`roleName`. CONTEXT.md's "Unknown type ranks like any real type" and "null issueTypeId is its own explicit bucket" requirements mean the transform needs **two synthetic buckets** distinct from the real named types: one for `issueTypeId == null` (label e.g. `"No type set"`) and one for `issueTypeId != null && !resolved` (label `"Unknown type"`), both competing for top-N rank like any real slice — do not special-case them out of the sort.

### Pattern 5: Chart component — clone `ProvisionedModulesChart`'s local-drill-state horizontal bars

**What:** `useState<string|null>` drill toggle, `EChart` horizontal bar (`yAxis: category`, `xAxis: value`), click handler toggles drill, drill panel renders a capped project list with a "+N more" overflow line, a `data-testid` for the drilldown block, a self-test asserting the source does NOT contain `"onSliceClick"`/`"activeSlice"`/`"sliceFilters"` (local drill only, no cross-filter-bus wiring — CONTEXT.md's locked decision, matches the 21-03/20.1 convention of project-picker-only filtering for issue data).
**When to use:** `IssueTypeChart.tsx`.
**Example:** see `app/(dashboard)/access-analysis/components/ProvisionedModulesChart.tsx` (full file read this session, 162 lines) — near-verbatim clone with `module`→`issueType` renames, plus the expand/collapse "Other" toggle from `PermissionLevelChart.tsx` (see Pattern 4).

### Anti-Patterns to Avoid
- **Don't add a `db.$queryRaw` join for the type cut.** Breaks `issueFunnelView.test.ts`'s existing `toHaveBeenCalledTimes(1)` pin on `mocks.queryRaw`. Use a second `groupBy` + a tiny `findMany` joined in JS (Pattern 3).
- **Don't add a new `mainCharts.tsx` `Promise.all` entry or a new server action.** CONTEXT.md locks reuse of the existing `loadIssueFunnelAction` prop already threaded through `AccessAnalysisCharts.tsx`.
- **Don't collapse "No type set" (null `issueTypeId`) and "Unknown type" (non-null but unresolved GUID) into one bucket.** CONTEXT.md requires both as distinct, honest, always-present buckets.
- **Don't literally type `onSliceClick`, `activeSlice`, or `sliceFilters` anywhere in the new chart file** — even in a doc comment explaining their absence. The repo's own convention (`ProvisionedModulesChart.test.tsx` line 93-100) is a source-text grep test that fails on the literal string appearing anywhere in the file, comments included (verified 21.1-02/21.1-03 both hit this trap per STATE.md deviation notes).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| APS OAuth 3-leg token refresh | A new token-refresh helper in the backfill script | `refreshAndPersistFromDb(db, "data:read")` from `lib/acc/apsAuth.ts` (verified, imports cleanly via `require(...ts)` under `tsx/cjs`) | Already handles APS v2's single-use refresh-token rotation persistence — reimplementing risks breaking dashboard login (per project memory: `project_aps_refresh_token_rotation`) |
| Paginated APS list fetch with retry-on-429/5xx | A new fetch/retry wrapper | `apiGet()`'s retry loop, cloned verbatim from `acc-issues-backfill.cjs` lines 115-124 | Proven pattern already handling APS rate limits for the sibling issues-list crawl |
| Project name resolution (GUID → display name) | A new name-lookup helper | `buildProjectNameMap`/`resolveProjectName` from `lib/server/folderActivityView.ts` (already imported by `issueFunnelView.ts`) | Every loader in this codebase uses this exact AccProject-over-AccDcProject precedence; a new one would drift |
| Top-N + "Other" bucketing with expand-in-place | A new bucketing algorithm | Clone `summarizePermissionLevel`'s sort/slice/fold shape (`permissionLevelCounts.ts`) | Locked by CONTEXT.md as the exact pattern to follow; already has 2 shipped, tested analogs (`PermissionLevelChart`, `FolderActivityByCompanyChart`) |
| Horizontal bar chart with local click-to-drill | A new EChart option builder from scratch | Clone `ProvisionedModulesChart.tsx`'s EChart `option` shape | Identical visual/interaction requirement (CONTEXT.md explicitly cites this component as the pattern) |

**Key insight:** Every mechanical piece of this phase has a shipped analog already in the repo. The only genuinely new knowledge is the APS issue-types endpoint shape (external) and the new Prisma model (internal, but structurally identical to `AccRole`).

## Common Pitfalls

### Pitfall 1: Breaking `issueFunnelView.test.ts`'s `$queryRaw` call-count pin
**What goes wrong:** Implementing the type cut as a raw SQL join (`db.$queryRaw` against `AccIssue` + the new lookup table) makes `mocks.queryRaw` get called twice, failing the existing test `"filters null createdAt out of the month cut via a date_trunc('month', ...) WHERE clause"` which asserts `expect(mocks.queryRaw).toHaveBeenCalledTimes(1)` (verified `lib/server/issueFunnelView.test.ts:69`).
**Why it happens:** A raw SQL join feels natural for "group by type, then look up the name" — but the lookup table is tiny (≤831 rows), so a JS-side `Map` join after a plain `groupBy` is both simpler and test-safe.
**How to avoid:** Use `db.accIssue.groupBy({ by: ["projectId", "issueTypeId"], _count: { id: true } })` (a second `groupBy` call, not `$queryRaw`) plus `db.accIssueType.findMany()`, joined in JS (Pattern 3 above).
**Warning signs:** `npm test` fails on `issueFunnelView.test.ts` after the loader extension with a call-count assertion error.

### Pitfall 2: Collapsing null-type and unresolved-GUID into one "Unknown type" bucket
**What goes wrong:** It's tempting to treat `issueTypeId == null` and `issueTypeId` present-but-unmapped as the same "Unknown type" bucket — but CONTEXT.md explicitly requires them as two distinct, always-present buckets ("Null `issueTypeId` is its own explicit bucket").
**Why it happens:** Both cases render the same visual fallback (no real name), so the distinction is easy to lose in the transform.
**How to avoid:** Carry the resolution outcome as three states through the transform: `{ issueTypeId: string, typeName: string }` (resolved), `{ issueTypeId: string, typeName: null }` (GUID present, unresolved → "Unknown type"), `{ issueTypeId: null }` (no type set → its own label, e.g. "No type set"). Test both paths explicitly.
**Warning signs:** A live spot-check where the "Unknown type" bucket's count doesn't match `distinct issueTypeId GUIDs not in AccIssueType` × their issue counts, or where issues with a genuinely null `issueTypeId` disappear from the total.

### Pitfall 3: `prisma migrate dev` drift from prior `migrations-raw` tables
**What goes wrong:** Two existing tables (`AccInstanceEmbedding`, `AccActivityAccds`) were created via raw SQL outside `prisma migrate dev` (verified: no `prisma/migrations/2026060*` folder exists for either, despite both appearing in `schema.prisma`) — this means the migration history and the live DB schema have a standing, tolerated drift. A `prisma migrate dev` run for the new `AccIssueType` table could, in rare cases, try to reconcile/diff against this drift rather than cleanly adding one new table.
**Why it happens:** Prisma's migration history assumes every schema change went through `migrate dev`; this repo has two known exceptions.
**How to avoid:** Run `npx prisma migrate dev --create-only` first to inspect the generated SQL before applying — confirm it contains ONLY a `CREATE TABLE "AccIssueType"` (and its indexes), nothing touching `AccInstanceEmbedding`/`AccActivityAccds`/`LodEmbedding`'s vector column. If `migrate dev` errors or the diff is unexpectedly large, fall back to a hand-written `prisma/migrations-raw/<date>-acc-issue-type.sql` (clone the shape of the 2 existing files) applied via `prisma db execute --file <path> --schema prisma/schema.prisma`, matching the established recovery pattern.
**Warning signs:** `prisma migrate dev`'s interactive diff proposes dropping or altering any column unrelated to `AccIssueType`.

### Pitfall 4: `mainCharts.tsx` Promise.all fan-out growth (avoided by design, verify it stays avoided)
**What goes wrong:** PITFALLS.md Pitfall 4 (from the milestone-level research) warns against growing the eager `Promise.all` fan-out. CONTEXT.md's locked decision to extend `loadIssueFunnel()` in place already avoids this — but a plan/executor could still accidentally add a new top-level loader out of habit (every other Wave-A/B panel in Phase 20/20.1 did add one).
**How to avoid:** Confirm at review time that `mainCharts.tsx`'s eager `Promise.all` array length is unchanged before/after this phase (it should stay at whatever count Phase 21.1 left it — the type cut rides entirely inside the existing lazy `loadIssueFunnelAction` path).
**Warning signs:** A diff touching `mainCharts.tsx`'s `Promise.all` array for this phase is itself a warning sign — this phase should not need to touch that file at all.

### Pitfall 5: 403-locked projects during the issue-types crawl silently understate coverage
**What goes wrong:** Per project memory (`project_dc_access_universe`), ~724 of 1,153 projects are 403-locked for this account. The issue-types endpoint will 403 on the same universe as the issues-list endpoint (same per-project ACC permission boundary). If the script doesn't track/report this like `acc-issues-backfill.cjs` does (`forbidden++`, printed in the final summary), the "N of M type GUIDs resolved" caption has no honest denominator context.
**How to avoid:** Mirror the existing script's `ok`/`zeroIssues`/`forbidden`/`errors` counters and final summary line exactly (Pattern 1) — the CONTEXT.md-required coverage caption on the chart needs this same "accessible vs. total" framing, sourced live from the lookup table's row count vs. `AccIssue`'s distinct `issueTypeId` count, not from the backfill script's console output (the chart caption is computed at render time, not baked in from the backfill run).
**Warning signs:** The backfill script's console summary has no forbidden/error counts, or the chart caption doesn't reconcile with a manual `SELECT COUNT(DISTINCT "issueTypeId") FROM "AccIssue"` vs. `SELECT COUNT(*) FROM "AccIssueType" WHERE kind='type'`.

## Code Examples

### APS issue-types request (verified endpoint shape)
```
GET https://developer.api.autodesk.com/construction/issues/v1/projects/{projectId}/issue-types?include=subtypes&limit=100&offset=0
Authorization: Bearer <3-leg token, scope data:read>
```
Response (MEDIUM confidence — cross-referenced APS docs page + independently-hosted OpenAPI gist, not fetched as raw JSON live this session):
```json
{
  "pagination": { "limit": 100, "offset": 0, "totalResults": 25 },
  "results": [
    {
      "id": "1110f111-...",
      "containerId": "a5f49f04-...",
      "title": "Coordination",
      "isActive": true,
      "orderIndex": 2,
      "subtypes": [
        { "id": "2220f222-...", "issueTypeId": "1110f111-...", "title": "Clash", "isActive": true }
      ]
    }
  ]
}
```
Same `pagination.limit`/`offset`/`totalResults` shape `listIssuesForDeletedFilter` already parses at `scripts/acc-issues-backfill.cjs:135` (`body.pagination?.totalResults ?? out.length`) — the existing pagination loop pattern transfers directly.

### New Prisma model (additive, clones `AccRole`'s shape)
```prisma
// Source: pattern from prisma/schema.prisma:479-488 (AccRole, read this session)
model AccIssueType {
  id           String   @id // APS issue-type or issue-subtype GUID
  name         String
  kind         String   // "type" | "subtype"
  parentTypeId String?  // set only when kind = "subtype"; the parent type's GUID
  updatedAt    DateTime @updatedAt // freshness record — no separate run-audit table per CONTEXT.md

  @@index([kind])
  @@index([parentTypeId])
}
```

## Open Questions

1. **Exact required OAuth scope for the issue-types endpoint**
   - What we know: `acc-issues-backfill.cjs` uses `refreshAndPersistFromDb(db, "data:read")` for the sibling `construction/issues/v1/.../issues` endpoint under the same API family.
   - What's unclear: The APS reference pages fetched this session did not explicitly list required scopes for `GET issue-types`.
   - Recommendation: Reuse `data:read` (same family, same auth helper) — verify empirically with a `--project=<one accessible id> --dry-run`-style first call before running the full crawl; a 401 (not 403) would indicate a scope problem, distinguishable from the expected per-project 403s.

2. **Whether `prisma migrate dev` will apply cleanly given the 2 known `migrations-raw` drift tables**
   - What we know: `AccIssueType` has no BigInt/vector columns (the two documented trap classes in this repo), so it's structurally simple.
   - What's unclear: Whether Prisma's migration-history diff engine treats the pre-existing drift (`AccInstanceEmbedding`, `AccActivityAccds` absent from `prisma/migrations/`) as a blocker for any NEW migration, not just for edits to those two tables.
   - Recommendation: Run `npx prisma migrate dev --create-only` first and inspect the generated SQL before applying (Pitfall 3); have the `migrations-raw/` fallback ready as documented recovery, per STATE.md's standing guardrail.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (config: `vitest.config.ts`, verified present) |
| Config file | `C:\LECG\Dashboard\vitest.config.ts` |
| Quick run command | `npx vitest run lib/server/issueFunnelView.test.ts app/\(dashboard\)/access-analysis/__tests__/issueFunnelCounts.test.ts app/\(dashboard\)/access-analysis/__tests__/IssueTypeChart.test.tsx` (targeted) |
| Full suite command | `npm test` (= `vitest run --exclude "**/tests/e2e/**"`, verified `package.json:9`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| ISSUE-04 | Backfill script upserts type/subtype rows by GUID, idempotently, tolerating 403s | manual (script has no DB in CI) + live DB row-count spot-check | `node scripts/acc-issue-types-backfill.cjs --dry-run` then a live run, verified via `psql`/Prisma Studio row counts | ❌ Wave 0 — new script, no automated test (matches `acc-issues-backfill.cjs`'s own precedent — it has no test file either) |
| ISSUE-04 | `loadIssueFunnel()`'s new type cut is bounded/aggregate (never a raw scan) and resolves names via the lookup table | unit | `npx vitest run lib/server/issueFunnelView.test.ts` | ❌ Wave 0 — extend the EXISTING file, do not create a new one (must not break test (b), Pitfall 1) |
| ISSUE-05 | `summarizeIssueType` produces top-N + "Other", both "No type set" and "Unknown type" as distinct honest buckets, per-type project drill sorted correctly | unit | `npx vitest run app/\(dashboard\)/access-analysis/__tests__/issueFunnelCounts.test.ts` (or a new `issueTypeCounts.test.ts`) | ❌ Wave 0 — new test cases needed |
| ISSUE-05 | `IssueTypeChart` renders bars, drills locally (no cross-filter-bus tokens in source), expand/collapse Other works | component | `npx vitest run app/\(dashboard\)/access-analysis/__tests__/IssueTypeChart.test.tsx` | ❌ Wave 0 — new file, clone `ProvisionedModulesChart.test.tsx`'s structure including its self-grep test |

### Sampling Rate
- **Per task commit:** targeted `vitest run` on the touched files.
- **Per wave merge:** `npm test` (full suite) — baseline to beat: 2477 passed / 1 skipped / 0 failed (per STATE.md, as of Phase 21.1 close).
- **Phase gate:** Full suite green + `npx tsc --noEmit` clean before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `lib/server/issueFunnelView.test.ts` — extend with mocks for the new `groupBy`(issueTypeId) call and `accIssueType.findMany` — covers ISSUE-04's loader-level honesty guarantees.
- [ ] `app/(dashboard)/access-analysis/__tests__/issueFunnelCounts.test.ts` (or new `issueTypeCounts.test.ts`) — covers ISSUE-05's transform.
- [ ] `app/(dashboard)/access-analysis/__tests__/IssueTypeChart.test.tsx` — covers ISSUE-05's chart, including the repo's self-grep "no cross-filter-bus tokens" convention.
- [ ] No new test framework/config needed — Vitest is already fully configured for this exact class of file.

## Sources

### Primary (HIGH confidence — repo files read directly this session)
- `C:/LECG/Dashboard/scripts/acc-issues-backfill.cjs` — full file, backfill script pattern to clone
- `C:/LECG/Dashboard/lib/acc/apsAuth.ts` — `refreshAndPersistFromDb` auth helper
- `C:/LECG/Dashboard/lib/acc/issueListQuery.ts` — pagination URL-builder pattern
- `C:/LECG/Dashboard/lib/acc/issueBackfillAudit.ts` — fetch-result/summary builder pattern
- `C:/LECG/Dashboard/prisma/schema.prisma` — `AccIssue` (lines 840-869), `AccRole` (479-488), `AccInstanceEmbedding` (909-916), full model list
- `C:/LECG/Dashboard/prisma/migrations-raw/2026-06-08-acc-instance-embedding.sql`, `2026-06-11-acc-activity-accds.sql` — raw-SQL fallback precedent
- `C:/LECG/Dashboard/prisma/migrations/` directory listing — confirmed no formal migration exists for the two `migrations-raw` tables (drift precedent)
- `C:/LECG/Dashboard/lib/server/issueFunnelView.ts` + `.test.ts` — exact extension point and the test pin that must not break (Pitfall 1)
- `C:/LECG/Dashboard/app/(dashboard)/access-analysis/issueFunnelCounts.ts` — fixed-bucket + honest-overflow pattern
- `C:/LECG/Dashboard/app/(dashboard)/access-analysis/permissionLevelCounts.ts` — top-N + "Other" + expand-in-place pattern (full file read)
- `C:/LECG/Dashboard/app/(dashboard)/access-analysis/components/ProvisionedModulesChart.tsx` — horizontal-bar + local-drill component pattern (full file read)
- `C:/LECG/Dashboard/app/(dashboard)/access-analysis/components/IssueStatusChart.tsx` — sibling issue-chart color/caption conventions
- `C:/LECG/Dashboard/app/(dashboard)/access-analysis/components/ProjectsTabPanel.tsx` — reserved mount point (line 141 comment)
- `C:/LECG/Dashboard/app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` (lines 280-390) — lazy fetch-once-per-tab wiring, memo pattern
- `C:/LECG/Dashboard/app/(dashboard)/access-analysis/__tests__/ProvisionedModulesChart.test.tsx` (lines 93-100) — self-grep no-cross-filter-bus test convention
- `C:/LECG/Dashboard/package.json` — `npm test` command, prisma scripts (`db:push`, `db:migrate`), dependency versions
- `.planning/phases/22-issue-type-resolution/22-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` — milestone-level constraints and guardrails
- `.planning/config.json` — confirmed `nyquist_validation: true`, `commit_docs: true`

### Secondary (MEDIUM confidence — official APS docs, cross-referenced)
- APS docs: `GET issue-types | Autodesk Construction Cloud APIs` (`aps.autodesk.com/en/docs/acc/v1/reference/http/issues-issue-types-GET/`) — confirmed endpoint path, `include=subtypes` param, `limit`/`offset` pagination, `filter[updatedAt]`/`filter[isActive]` optional filters
- `aps.autodesk.com/llms-full.txt` — corroborated endpoint path and pagination shape independently

### Tertiary (LOW confidence — flagged for empirical validation)
- Response JSON field names (`title`, `subtypes[].issueTypeId`, etc.) sourced via WebSearch synthesis referencing an independently-hosted OpenAPI gist (`gist.github.com/petrbroz/a4274548c52e2ee71914c9e644490e5e`), not fetched as raw JSON from a live authenticated call this session — VERIFY against the first live `--dry-run` script response before finalizing field-mapping code.
- Required OAuth scope for `GET issue-types` — not explicitly stated on the fetched pages; inferred by API-family analogy to the existing issues-list endpoint's `data:read` scope (see Open Questions #1).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, every library already verified in `package.json`.
- Architecture (loader/transform/chart extension points): HIGH — every file and line cited was read directly this session.
- Backfill script pattern: HIGH — full source of `acc-issues-backfill.cjs` and its 3 helper modules read directly.
- APS issue-types endpoint (path, pagination, `include=subtypes`): HIGH — confirmed by 2 independent official-domain fetches.
- APS issue-types response field names: MEDIUM — cross-referenced but not fetched as raw JSON from a live call; flagged as an Open Question with a concrete empirical-validation step (first `--dry-run` run).
- Migration risk (Pitfall 3): MEDIUM — the `migrations-raw` drift pattern is verified real (2 tables), but whether it will actually cause `migrate dev` friction for THIS unrelated new table is not something that can be confirmed without running it.
- Pitfalls (Pitfall 1, the `$queryRaw` test pin): HIGH — the exact test assertion was read and quoted verbatim.

**Research date:** 2026-07-10
**Valid until:** 30 days (stable internal patterns + one external API surface unlikely to change short-term; re-verify the APS response shape empirically at ISSUE-04 execution time regardless of this validity window)
