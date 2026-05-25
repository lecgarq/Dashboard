# P5-C — AccActivity Aggregation (Performance Plan & Review)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **STATUS: PLAN/REVIEW ONLY — do NOT implement until Luis approves.** This is the dedicated performance slice for the one remaining P5 phase. P5 A→B→D shipped 2026-05-25 (commits `d56d3bc`→`66406aa`); Phase C was deliberately deferred because it is the only phase that queries the large `AccActivity` table.

**Goal:** Add per-`UserProjectInstance` `activityMix` (event counts by category), `activityTotal`, and TRUE last-activity recency to `NodeFeatureSnapshot`, sourced from a **grouped** `AccActivity` query that is performance-bounded, cache-versioned, and ships only compact aggregates — never raw activity rows.

**Architecture:** One grouped Prisma query (`groupBy [userEmail, projectId, rawAction]` with `_count` + `_max(createdAt)`) runs inside `acc-hot-cache.ts` behind a new `includeActivityMix` flag, folds to one record per instance via a pure `foldActivityRows`, attaches `activityMix`/`activityTotal`/`lastActivity` to each `BulkAccProject`, then flows through `graphTables` (JSON-string + epoch-ms columns) into `featureSnapshot` — which finally feeds the real `activityTotal` into `computeRiskFlags`, making `highActivityHighPerm` reachable. No new DIMENSION_REGISTRY descriptors, sliders, edges, UI, or node-identity changes.

**Tech Stack:** TypeScript, Next.js App Router, tRPC, Prisma/Postgres, apache-arrow + DuckDB-WASM, Vitest, Playwright.

---

## 1. Review of the existing C1/C2 plan against the performance checklist

The existing plan (`docs/superpowers/plans/2026-05-22-p5-snapshot-enrichment-advanced-dimensions.md`, Phase C, Tasks C1/C2) is **directionally correct** but has **four performance/correctness gaps**. Status of each criterion Luis listed:

| Criterion | Existing C1/C2 | Verdict | Gap → mitigation (this plan) |
|-----------|----------------|---------|------------------------------|
| **Grouped SQL only, no row-by-row fetch** | C1 uses `groupBy([userEmail, projectId, rawAction], _count, _max(createdAt))` | ✅ correct | Keep. Forbid `findMany` over AccActivity in this path. |
| **Cache versioning** | C1 says "cache under its own version key" but names none | ⚠️ underspecified | **Add `ACTIVITY_VERSION_SPECS = [{ model: "accActivity", maxField: "createdAt" }]`**; vary cache id by `includeActivityMix`. (Task C3) |
| **Expected row counts** | not stated | ❌ missing | **Task C0 measures** `count()` + group cardinality + `EXPLAIN ANALYZE` before any code. Output is bounded at ≤ 1 row per instance (~16,942 today); the cost is the scan. |
| **Payload size** | C2 stores mix as JSON string (good) | ⚠️ partial | Bound it: mix is ≤ 7 keys (`ActivityCategory`) per instance → < ~120 bytes/instance, ~2 MB total worst case. Assert no raw rows shipped. |
| **e2e load impact** | C2 adds `includeActivityMix: true` to the shell | ⚠️ risk | **Task C5 measures cold-aggregation time**; if it threatens the 300 s webServer boot or page interactivity, gate behind the index decision (§2). |
| **No node-count change** | not asserted for C | ❌ missing | Task C5 asserts e2e `n` stays **16,942** (the flag adds columns, not rows/nodes). |
| **No raw activity payload shipped** | implied | ⚠️ not tested | Negative test: assembled output exposes mix/total/lastActivity only — no `rawAction` arrays, no per-event rows. (Tasks C2, C3) |
| **activityTotal + lastActivity per UserProjectInstance** | C1/C2 key by `userEmail::projectId` | ✅ correct | Keep. Lowercase email join key (`userIdFor`). |
| **highActivityHighPerm reachable only after activityTotal lands** | C2 finalizes riskFlags | ✅ correct | Task C4 flips the P5-D test from `false`→`true` (the inverse of the adapted D1). |

**Two correctness bugs in the existing C1 query (must fix):**

1. **`where: { projectId: { not: null } }` does NOT exclude admin rows.** `AccActivity.projectId` uses an **empty-string sentinel** (`""`) for admin activity, not `null` (schema.prisma:536). The existing filter would aggregate admin events into bogus `user::""` instances. **Fix:** filter `sourceFile: "project"` (cleanest — admin rows are `sourceFile: "admin"`, schema.prisma:541) and `userEmail: { not: null }`.
2. **`_max(createdAt)` as the cache version misses historical backfills.** New activity advances `max(createdAt)`, but a backfill of OLD activity will not — risking a stale cache. **Mitigation:** acceptable because `invalidateAccHotCache()` already fires on server restart (deploy = rebuild + restart per [[project_deploy_mechanism]]). Documented as a known limitation; revisit only if backfills become routine.

---

## 2. The central performance decision (REQUIRES LUIS'S CALL)

`AccActivity` indexes today (schema.prisma:546-550): `(autodeskId, createdAt)`, `(userEmail, createdAt)`, `(projectId, createdAt)`, `(rawAction)`, `(ingestRunId)`. **None covers the C1 group key `(userEmail, projectId, rawAction)`.** Postgres will therefore execute the `groupBy` as a **full sequential scan + hash aggregate** over the entire table (millions of rows per [[project_dc_csv_schema_real]]).

Three options, to be decided **after** Task C0's `EXPLAIN ANALYZE`:

- **Option A — Accept the scan, lean on the cache (no migration).** The aggregation runs once per cache version (daily DC ingest cadence), 10-min TTL, version-keyed. Cost is paid once on the cold request after each ingest/restart, then served from memory. *Good if C0 shows cold time is tolerable (target < ~5 s).* No ingest write penalty, no schema change. Risk: a multi-second first-page-load and an e2e cold-start cost; single-user/single-process deployment makes this low-stakes.
- **Option B — Add a composite index** `@@index([userEmail, projectId, rawAction, createdAt])` (partial: `where sourceFile = 'project'`). Enables an index-only/index scan for both the grouping and the `_max(createdAt)`. *Recommended if C0 shows the scan is slow (> ~5 s) or grows.* Costs: one-time index build on a large table, small per-insert overhead on the daily ingest, extra storage.
- **Option C — Materialize at ingest** (a per-instance aggregate table updated during DC ingest). Lowest read cost, highest complexity. Out of scope for this slice; note as the long-term path if activity volume explodes.

**Recommendation:** default to **Option A**, and pre-write the **Option B** migration as a ready-to-apply task (C1) that is only run if C0's measurement crosses the threshold. The decision is data-driven and deferred to C0.

---

## 3. File structure

| File | Responsibility | New/Modify |
|------|----------------|------------|
| (measurement only) | C0 — measure scale + EXPLAIN, no code | — |
| `prisma/schema.prisma` | C1 — optional composite index (Option B), applied only if C0 warrants | Modify |
| `lib/acc/activityAggregate.ts` | C2 — pure `foldActivityRows` (raw grouped rows → per-instance mix/total/lastActivity) | Create |
| `lib/acc/activityAggregate.test.ts` | C2 — unit tests for the pure folder | Create |
| `lib/acc/acc-types.ts` | C3 — `BulkAccProject.activityMix/activityTotal/lastActivity` | Modify |
| `lib/acc/dcUserAssembly.ts` (+`.test.ts`) | C3 — accept `activityByInstance` map, attach to projects | Modify |
| `lib/server/acc-hot-cache.ts` | C3 — `includeActivityMix` path: grouped query + version spec + cache key | Modify |
| `server/routers/acc-dc-graph.ts` (+`.test.ts`) | C3 — `includeActivityMix` input flag | Modify |
| `app/(dashboard)/users/access-analysis/graphTables.ts` (+`.test.ts`) | C4 — `activity_mix_json`/`activity_total`/`last_activity` columns | Modify |
| `app/(dashboard)/users/access-analysis/featureSnapshot.ts` (+test) | C4 — read columns; set mix/total; override recency; finalize riskFlags | Modify |
| `app/(dashboard)/users/access-analysis/interactionTypes.ts` | C4 — `activityMix`/`activityTotal` fields | Modify |
| `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` | C4 — request `includeActivityMix: true` | Modify |

---

# Task C0: Measure scale + plan the query (NO CODE)

**Goal:** Decide §2's option with real numbers before writing aggregation code.

- [ ] **Step 1: Confirm local Postgres is up**

Run: `npm run db:status`
Expected: running. (If not: `npm run db:start`.)

- [ ] **Step 2: Measure row count, instance cardinality, and group cardinality**

Run (psql; adjust the connection per `.env` `DATABASE_URL` — the app patches env at runtime, so run these directly in psql):

```sql
-- Total rows + project-only rows (the rows C will actually scan)
SELECT count(*) AS total,
       count(*) FILTER (WHERE "sourceFile" = 'project' AND "userEmail" IS NOT NULL) AS project_attributable
FROM "AccActivity";

-- Distinct (user,project) instances that will receive a mix (upper bound on output rows)
SELECT count(*) FROM (
  SELECT DISTINCT "userEmail", "projectId"
  FROM "AccActivity"
  WHERE "sourceFile" = 'project' AND "userEmail" IS NOT NULL AND "projectId" <> ''
) t;

-- Group cardinality (rows returned from the DB to the server before folding)
SELECT count(*) FROM (
  SELECT "userEmail", "projectId", "rawAction"
  FROM "AccActivity"
  WHERE "sourceFile" = 'project' AND "userEmail" IS NOT NULL AND "projectId" <> ''
  GROUP BY "userEmail", "projectId", "rawAction"
) g;
```

Record: `total`, `project_attributable`, instance count (expect ≈ 16,942 — the live node count), group cardinality (expect instances × avg distinct actions, ~100k–400k).

- [ ] **Step 3: Time the actual aggregation (the decision input)**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT "userEmail", "projectId", "rawAction", count(*), max("createdAt")
FROM "AccActivity"
WHERE "sourceFile" = 'project' AND "userEmail" IS NOT NULL AND "projectId" <> ''
GROUP BY "userEmail", "projectId", "rawAction";
```

Record the total execution time and whether the plan is `Seq Scan` + `HashAggregate`.

- [ ] **Step 4: Decide the index (§2)**

Decision rule: if Step 3 execution time **< 5 s** → **Option A** (no index; skip Task C1). If **≥ 5 s** or group cardinality is growing fast → **Option B** (apply Task C1). Write the chosen option + the measured numbers into this plan before continuing. **Surface the numbers to Luis and get the go-ahead before implementation.**

---

# Task C1: (CONDITIONAL) composite index for the aggregation

**Apply only if Task C0 selects Option B.** Skip entirely under Option A.

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Add a partial composite index to `AccActivity`**

In `model AccActivity`, alongside the existing `@@index` lines, add:

```prisma
  @@index([userEmail, projectId, rawAction, createdAt], name: "accactivity_instance_action_mix")
```

(A partial index `WHERE "sourceFile" = 'project'` is ideal but Prisma's partial-index support is limited; if using a raw migration, prefer `CREATE INDEX ... WHERE "sourceFile" = 'project'`. Otherwise the full composite index above is acceptable.)

- [ ] **Step 2: Apply + time the build**

Run: `npm run db:push`
Expected: index created. Note build time (one-time).

- [ ] **Step 3: Re-run the EXPLAIN from C0 Step 3**

Expected: plan now uses the new index (`Index Scan` / `Index Only Scan`), execution time materially lower. Record before/after.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "perf(acc-graph): P5-C composite index for AccActivity instance-action aggregation"
```

---

# Task C2: pure `foldActivityRows`

**Files:**
- Create: `lib/acc/activityAggregate.ts`
- Test: `lib/acc/activityAggregate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// activityAggregate.test.ts
import { describe, it, expect } from "vitest";
import { foldActivityRows } from "./activityAggregate";

describe("foldActivityRows", () => {
  it("buckets raw actions by normalized category per (email, projectId)", () => {
    const out = foldActivityRows([
      { userEmail: "A@x.com", projectId: "p1", rawAction: "File Viewed", count: 3, lastCreatedAt: "2026-05-01T00:00:00Z" },
      { userEmail: "a@x.com", projectId: "p1", rawAction: "File Uploaded", count: 2, lastCreatedAt: "2026-05-10T00:00:00Z" },
    ]);
    const inst = out.get("a@x.com::p1")!;        // key lowercased
    expect(inst.mix.view).toBe(3);
    expect(inst.mix.upload).toBe(2);
    expect(inst.total).toBe(5);
    expect(inst.lastActivity).toBe("2026-05-10T00:00:00.000Z"); // max
  });

  it("never emits raw actions — only categorized counts (no payload leak)", () => {
    const out = foldActivityRows([
      { userEmail: "a@x.com", projectId: "p1", rawAction: "Some Obscure Action", count: 1, lastCreatedAt: "2026-05-01T00:00:00Z" },
    ]);
    const inst = out.get("a@x.com::p1")!;
    expect(Object.keys(inst)).toEqual(["mix", "total", "lastActivity"]);
    // every key of mix is a known ActivityCategory, not a raw action string
    for (const k of Object.keys(inst.mix)) {
      expect(["view","upload","edit","delete","memberEvent","projectEvent","other"]).toContain(k);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** → `npx vitest run activityAggregate` → FAIL (module missing).

- [ ] **Step 3: Implement the pure folder**

```typescript
// activityAggregate.ts
import { categorize, type ActivityCategory } from "./activityCategories";

export interface RawActivityGroupRow {
  userEmail: string;
  projectId: string;
  rawAction: string;
  count: number;
  lastCreatedAt: string; // ISO
}

export interface InstanceActivity {
  mix: Partial<Record<ActivityCategory, number>>;
  total: number;
  lastActivity: string | null;
}

export function foldActivityRows(rows: readonly RawActivityGroupRow[]): Map<string, InstanceActivity> {
  const out = new Map<string, InstanceActivity>();
  for (const r of rows) {
    const key = `${r.userEmail.toLowerCase()}::${r.projectId}`;
    const cur = out.get(key) ?? { mix: {}, total: 0, lastActivity: null };
    const cat = categorize(r.rawAction);
    cur.mix[cat] = (cur.mix[cat] ?? 0) + r.count;
    cur.total += r.count;
    const iso = new Date(r.lastCreatedAt).toISOString();
    if (cur.lastActivity === null || iso > cur.lastActivity) cur.lastActivity = iso;
    out.set(key, cur);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acc/activityAggregate.ts lib/acc/activityAggregate.test.ts
git commit -m "feat(acc-graph): P5-C pure foldActivityRows (categorized per-instance mix)"
```

---

# Task C3: server aggregation + assembly + router flag

**Files:**
- Modify: `lib/acc/acc-types.ts` (`BulkAccProject` activity fields)
- Modify: `lib/acc/dcUserAssembly.ts` (+ `dcUserAssembly.test.ts`) — accept `activityByInstance`
- Modify: `lib/server/acc-hot-cache.ts` — `includeActivityMix` path
- Modify: `server/routers/acc-dc-graph.ts` (+ `acc-dc-graph.test.ts`) — input flag

- [ ] **Step 1: `BulkAccProject` fields (acc-types.ts)**

After the P5-B permission fields, add:

```typescript
  /** [P5-C] Activity event counts by normalized category for THIS instance. */
  activityMix?: Partial<Record<import("@/app/(dashboard)/users/access-analysis/dummy").never, number>>;
```

> NOTE: do not import a type that creates a cycle. Define the mix value type inline as `Record<string, number>` on `BulkAccProject` (the strong `ActivityCategory` typing lives in `activityAggregate.ts` and `interactionTypes.ts`). Concretely:

```typescript
  /** [P5-C] Activity event counts keyed by ActivityCategory for THIS instance. */
  activityMix?: Record<string, number>;
  /** [P5-C] Sum of activityMix values. */
  activityTotal?: number;
  /** [P5-C] ISO of the most recent activity event for THIS instance; null when none. */
  lastActivity?: string | null;
```

- [ ] **Step 2: `dcUserAssembly` accepts an instance→activity map (write failing test first)**

Add to `DcAssemblyInput`:

```typescript
  /** [P5-C] Per-(user,project) activity aggregate, keyed `userId::projectId`. */
  activityByInstance?: Map<string, { mix: Record<string, number>; total: number; lastActivity: string | null }>;
```

Test (`dcUserAssembly.test.ts`, mirrors the B1 pattern):

```typescript
describe("activityByInstance attach", () => {
  it("attaches mix/total/lastActivity to the matching project", () => {
    const out = assembleDcUsers({
      ...base,
      users: [{ id: "u1", email: "a@hermosillo.com", name: "A", status: "active", companyId: null }],
      activityByInstance: new Map([["u1::p1", { mix: { view: 4 }, total: 4, lastActivity: "2026-05-10T00:00:00.000Z" }]]),
    });
    const proj = out[0].projects[0];
    expect(proj.activityTotal).toBe(4);
    expect(proj.activityMix!.view).toBe(4);
    expect(proj.lastActivity).toBe("2026-05-10T00:00:00.000Z");
  });
  it("defaults to undefined when no aggregate is supplied", () => {
    expect(assembleDcUsers(base)[0].projects[0].activityTotal).toBeUndefined();
  });
});
```

Implement in the `projects.map` (read `input.activityByInstance?.get(`${u.id}::${pid}`)` and spread the three fields into the returned object). Run `npx vitest run dcUserAssembly` → PASS.

- [ ] **Step 3: `acc-hot-cache` aggregation path**

Add a version spec near the others:

```typescript
const ACTIVITY_VERSION_SPECS = [{ model: "accActivity", maxField: "createdAt" }];
```

Extend `getCachedAccDcBulkUsers`'s input to `{ includePermissionContexts?, includePermissionSummary?, includeActivityMix? }`. When `includeActivityMix`:
- include `ACTIVITY_VERSION_SPECS` in the `dbVersion` call,
- add `"act"` to the composable `cacheId` (e.g. `["ctx"?, "sum"?, "act"?].filter(Boolean).join("+") || "lean"`),
- run the GROUPED query (NEVER `findMany`) and fold it:

```typescript
let activityByInstance: Map<string, InstanceActivity> | undefined;
if (includeActivityMix) {
  const groups = await db.accActivity.groupBy({
    by: ["userEmail", "projectId", "rawAction"],
    where: { sourceFile: "project", userEmail: { not: null }, projectId: { not: "" } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  activityByInstance = foldActivityRows(
    groups.map((g: any) => ({
      userEmail: g.userEmail as string,
      projectId: g.projectId as string,
      rawAction: g.rawAction as string,
      count: g._count._all as number,
      lastCreatedAt: (g._max.createdAt as Date).toISOString(),
    })),
  );
}
```

Pass `activityByInstance` into `assembleDcUsers({ ... })`. Import `foldActivityRows` + `InstanceActivity` from `@/lib/acc/activityAggregate`.

> **Perf guardrails (assert in review):** exactly ONE `groupBy` call; no `accActivity.findMany` in this path; the `where` clause is present (never aggregate the whole table unfiltered); the result is folded to ≤ instance-count records before leaving the function.

- [ ] **Step 4: router flag (acc-dc-graph.ts + test)**

Add `includeActivityMix: z.boolean().optional()` to the input object. Test (findMany/groupBy mocks; mirror the B6 cache-bypass pattern — provide a `accActivity.groupBy` mock returning two rows for `u1::p1`) asserts `rows[0].projects[0].activityTotal > 0` and that no raw rows appear.

- [ ] **Step 5: gates + commit**

Run `npx vitest run activityAggregate dcUserAssembly acc-dc-graph acc-hot-cache` → PASS; `npx tsc --noEmit -p tsconfig.json` filtered to touched files → clean.

```bash
git add lib/acc/activityAggregate.ts lib/acc/acc-types.ts lib/acc/dcUserAssembly.ts lib/acc/dcUserAssembly.test.ts lib/server/acc-hot-cache.ts server/routers/acc-dc-graph.ts server/routers/acc-dc-graph.test.ts
git commit -m "feat(acc-graph): P5-C grouped AccActivity aggregation behind includeActivityMix"
```

---

# Task C4: emit columns, read in snapshot, finalize risk

**Files:** `graphTables.ts` (+test), `featureSnapshot.ts` (+test), `interactionTypes.ts`, `AccessAnalysisShell.tsx`

- [ ] **Step 1: graphTables columns** (mirror the existing `module_weights_json` JSON-string precedent, dataLayer.ts:145):

In `projectRows`:
```typescript
        activity_mix_json: JSON.stringify(project.activityMix ?? {}),
        activity_total: project.activityTotal ?? 0,
        last_activity: timestampMillis(project.lastActivity ?? null),
```
In `userProjects: tableFromArrays`:
```typescript
      activity_mix_json: projectRows.map((row) => row.activity_mix_json),
      activity_total: Int32Array.from(projectRows.map((row) => row.activity_total)),
      last_activity: projectRows.map((row) => row.last_activity),
```
Test: a project with `activityMix: { view: 3 }, activityTotal: 3` → `JSON.parse(row.activity_mix_json).view === 3`, `row.activity_total === 3`.

- [ ] **Step 2: interactionTypes fields**
```typescript
  /** [P5-C] Activity event counts by normalized category. */
  activityMix?: Partial<Record<import("@/lib/acc/activityCategories").ActivityCategory, number>>;
  /** [P5-C] Sum of activityMix values. */
  activityTotal?: number;
```

- [ ] **Step 3: featureSnapshot — read + finalize** (`RawFeatureRow`: `activity_mix_json: string|null`, `activity_total: bigint|number|null`, `last_activity: bigint|number|null`; SQL `ANY_VALUE(up.activity_mix_json) AS activity_mix_json`, etc.):

```typescript
    const activityMix = (() => {
      try { return r.activity_mix_json ? JSON.parse(r.activity_mix_json) : {}; }
      catch { return {}; }
    })();
    const activityTotal = Number(r.activity_total ?? 0);
    const lastActivityMs =
      r.last_activity === null || r.last_activity === undefined ? null : Number(r.last_activity);
    const lastActivityDays =
      lastActivityMs === null ? null : Math.floor((Date.now() - lastActivityMs) / 86_400_000);
```
Object literal: set `activityMix`, `activityTotal`, and OVERRIDE recency with true last-activity when present:
```typescript
      activityMix,
      activityTotal,
      activityRecencyBucket: lastActivityMs !== null
        ? bucketRecency(lastActivityDays)
        : bucketRecency(instanceRecencyDays),  // falls back to the P5-B sign-in proxy
```
**Update the `computeRiskFlags` local to pass the real `activityTotal`** (it was `0` through P5-B). `fallback()`: `activityMix: {}`, `activityTotal: 0`.

- [ ] **Step 4: shell** — change the query input to `{ includePermissionSummary: true, includeActivityMix: true }`.

- [ ] **Step 5: tests** — snapshot test: row with `activity_mix_json: '{"view":5,"upload":2}'`, `activity_total: 7`, recent `last_activity` → `activityMix.view === 5`, `activityTotal === 7`, `activityRecencyBucket === "0-7d"`. **Risk reachability test:** `activity_total: 200, perm_strength: 5, email gmail` → `highActivityHighPerm === true`.

- [ ] **Step 6: FLIP the adapted D1 test** — in `featureSnapshot.test.ts`, the P5-D "A→B→D slice" block currently asserts `highActivityHighPerm === false` / `riskScore >= 3`. Add `activity_total: 250, last_activity: BigInt(recent)` to its fixture and change the assertions to `highActivityHighPerm === true` / `riskScore >= 4` (restoring the original plan D1 intent now that activity is plumbed). Update the comment.

- [ ] **Step 7: commit**

```bash
git add "app/(dashboard)/users/access-analysis/graphTables.ts" "app/(dashboard)/users/access-analysis/featureSnapshot.ts" "app/(dashboard)/users/access-analysis/interactionTypes.ts" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx" "app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts" "app/(dashboard)/users/access-analysis/graphTables.test.ts"
git commit -m "feat(acc-graph): P5-C activityMix + true last-activity recency; finalize highActivityHighPerm"
```

---

# Task C5: full gates + e2e performance check

- [ ] **Step 1:** `npm test` → all green (prior 952 + new C tests).
- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.json` → 0 errors.
- [ ] **Step 3:** `npm run test:e2e` → **19/19**, and assert in the log that the live `bulkUsers?...includeActivityMix=true` request returns 200 and the graph still reports **n = 16942** (no node-count change). Note the cold `bulkUsers` response time from the WebServer log — this is the real e2e load-impact number.
- [ ] **Step 4 (perf gate):** if the cold `bulkUsers` time under `includeActivityMix` is materially worse and Option A was chosen in C0, reconsider Option B (Task C1). Record the decision.
- [ ] **Step 5:** commit any e2e fixture updates (only if needed).

---

## Self-Review

- **Checklist coverage:** every criterion in §1 maps to a task (versioning→C3, row counts→C0, payload→C2/C3, e2e→C5, no-node-change→C5, no-raw-payload→C2/C3, per-instance→C2/C3, risk reachability→C4 Steps 5-6). ✅
- **Perf bugs fixed:** sentinel filter (`sourceFile:"project"`, `projectId:{not:""}`) and version spec both addressed; index decision is data-driven (C0→C1). ✅
- **No scope creep:** no DIMENSION_REGISTRY descriptors, sliders, edges, renderer/lasso/camera/nav/UserDetailPanel; node identity `userId::projectId` preserved; only runtime change is the shell flag (C4 Step 4). ✅
- **Type consistency:** `InstanceActivity`/`RawActivityGroupRow` defined in C2 and reused in C3; `BulkAccProject.activityMix` is `Record<string, number>` (loose, no import cycle) while the snapshot's `activityMix` uses the strong `ActivityCategory` keying. ✅
- **Known limitation:** `_max(createdAt)` cache version misses historical backfills; mitigated by restart-time `invalidateAccHotCache()`. Documented in §1.

## Execution Handoff

Plan saved. **Do not implement until Luis approves.** When approved, the natural order is: **C0 (measure) → decide index → C1 (if needed) → C2 → C3 → C4 → C5**, via subagent-driven-development with the same surgical-commit + scope-verify discipline used for A→B→D ([[feedback_surgical_staging]], [[feedback_verify_tree_after_subagents]]).
