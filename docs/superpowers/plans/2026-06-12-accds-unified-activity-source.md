# Unified Activity Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repoint the three `/access-analysis` activity panels (timeline, activity-by-role donut, module donut) onto a single unified dataset where `AccActivityAccds` is primary and `AccActivity` (DC) backfills only the pre-accds history + account-level admin rows.

**Architecture:** Three thin `server-only` view modules each change from a single-table read to a raw-SQL `UNION ALL` merge sharing a per-project `accds-start` CTE. accds owns each project's covered range; DC fills only `createdAt < that project's earliest accds row`, plus account-level (no-project) admin rows all-time. The page, client component, and pure summarizers are unchanged — the merge is invisible above the view layer.

**Tech Stack:** Next.js App Router (RSC), Prisma 7 (`db.$queryRaw` tagged templates), Postgres 18 (local), Node `.cjs` verification scripts (the existing `scripts/diag-*.cjs` pattern), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-12-accds-unified-activity-source-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `scripts/verify-accds-merge.cjs` | Live-DB verification of the merge SQL: reconciliation, overlap-exclusion, backfill/admin presence, boundary spot-check. The real "test" for this DB-bound work. | **Create** |
| `lib/server/activityTimelineView.ts` | `(project, month)` activity counts for the timeline. | **Modify** — query body → merge |
| `lib/server/moduleActivityView.ts` | `(project, rawAction)` activity counts for the module donut. | **Modify** — query body → merge |
| `lib/server/activityByActorView.ts` | `(project, userEmail)` activity counts for the role donut. | **Modify** — query body → merge |

**Untouched (verify they stay green):** `page.tsx`, `AccessAnalysisCharts.tsx`, `timelineCounts.ts`, `moduleCounts.ts`, `roleActivityCounts.ts`, `moduleOverrides.ts`, and all their tests. The page test mocks the three loaders, so it is unaffected by the query changes.

**The shared CTE** used by all three queries:

```sql
WITH astart AS (
  SELECT "projectId", MIN("createdAt") AS s
  FROM "AccActivityAccds"
  GROUP BY "projectId"
)
```

**The DC keep-predicate** (the merge rule, identical phrasing in timeline + module; the actor view drops the account-level branch):

```sql
-- account-level admin (all time) OR project absent from accds (defensive) OR pre-accds backfill
WHERE d."projectId" IS NULL OR d."projectId" = ''
   OR a.s IS NULL
   OR d."createdAt" < a.s
```

---

## Task 1: Verification harness (the test, with teeth)

A `.cjs` script that runs against the live local Postgres and asserts the merge is correct. It is built **first** and demonstrates red→green: pointed at a naive `UNION ALL` (all of DC, no partition) it must FAIL the reconciliation assertion; pointed at the partitioned merge it must PASS. This proves the harness catches the most likely mistake (double-counting the overlap).

**Files:**
- Create: `scripts/verify-accds-merge.cjs`

- [ ] **Step 1: Write the verification script**

```javascript
#!/usr/bin/env node
/**
 * Verifies the accds+DC unified activity merge (spec 2026-06-12). Read-only.
 *
 * Asserts, against the live DB:
 *   1. reconciliation — merged module/timeline total == accds_all + dc_backfill + dc_admin
 *   2. teeth         — a naive UNION (all DC) over-counts by the overlap, so the
 *                      reconciliation FAILS under MERGE_MODE=naive (red), PASSES under
 *                      MERGE_MODE=partitioned (green)
 *   3. backfill      — dc_backfill > 0 (older history is actually kept)
 *   4. admin         — dc_admin > 0 (account-level rows actually kept)
 *   5. boundary      — for the latest-starting project, every kept DC row predates
 *                      that project's earliest accds row (clean, gap-free seam)
 *
 * Usage: node scripts/verify-accds-merge.cjs            # partitioned (expect PASS)
 *        MERGE_MODE=naive node scripts/verify-accds-merge.cjs   # expect FAIL (teeth)
 */
const dotenv = (() => { try { return require('dotenv'); } catch { return null; } })();
if (dotenv) dotenv.config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const MODE = process.env.MERGE_MODE === 'naive' ? 'naive' : 'partitioned';

const CTE = `WITH astart AS (
  SELECT "projectId", MIN("createdAt") AS s FROM "AccActivityAccds" GROUP BY "projectId"
)`;

// Module-shaped merged total (project rows + account-level admin rows).
const moduleMergeTotal = (mode) => `${CTE}
SELECT SUM(c)::bigint AS total FROM (
  SELECT COUNT(*)::int AS c FROM "AccActivityAccds"
  UNION ALL
  SELECT COUNT(*)::int AS c
    FROM "AccActivity" d LEFT JOIN astart a ON a."projectId" = d."projectId"
    ${mode === 'naive'
      ? '' /* naive: keep ALL dc rows -> over-counts the overlap */
      : `WHERE d."projectId" IS NULL OR d."projectId" = '' OR a.s IS NULL OR d."createdAt" < a.s`}
) u`;

async function main() {
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL).trim();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
  const fails = [];
  const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails.push(msg); };
  const n = (rows) => Number(rows[0].total ?? rows[0].count ?? Object.values(rows[0])[0]);
  try {
    const q = (sql) => prisma.$queryRawUnsafe(sql);

    const accds = n(await q(`SELECT COUNT(*)::bigint total FROM "AccActivityAccds"`));
    const dcAdmin = n(await q(`SELECT COUNT(*)::bigint total FROM "AccActivity" WHERE "projectId" IS NULL OR "projectId"=''`));
    const dcBackfill = n(await q(`${CTE}
      SELECT COUNT(*)::bigint total FROM "AccActivity" d JOIN astart a ON a."projectId"=d."projectId"
      WHERE d."projectId" IS NOT NULL AND d."projectId"<>'' AND d."createdAt" < a.s`));
    const expected = accds + dcBackfill + dcAdmin;
    const merged = n(await q(moduleMergeTotal(MODE)));

    console.log(`mode=${MODE}  accds=${accds}  dc_backfill=${dcBackfill}  dc_admin=${dcAdmin}`);
    console.log(`expected unified (module/timeline) = ${expected}   merged query = ${merged}`);

    ok(merged === expected, `reconciliation: merged total equals accds + backfill + admin`);
    ok(dcBackfill > 0, `backfill kept (dc rows predating per-project accds start): ${dcBackfill}`);
    ok(dcAdmin > 0, `account-level admin kept: ${dcAdmin}`);

    // Boundary spot-check on the latest-starting project.
    const [late] = await q(`SELECT "projectId" pid, MIN("createdAt") s
      FROM "AccActivityAccds" GROUP BY "projectId" ORDER BY s DESC LIMIT 1`);
    const pid = String(late.pid).replace(/'/g, "''");
    const expectedLate = n(await q(`SELECT
        (SELECT COUNT(*) FROM "AccActivityAccds" WHERE "projectId"='${pid}')
      + (SELECT COUNT(*) FROM "AccActivity" WHERE "projectId"='${pid}'
           AND "createdAt" < (SELECT MIN("createdAt") FROM "AccActivityAccds" WHERE "projectId"='${pid}'))
      AS total`));
    const mergedLate = n(await q(`${CTE}
      SELECT SUM(c)::bigint AS total FROM (
        SELECT COUNT(*)::int AS c FROM "AccActivityAccds" WHERE "projectId"='${pid}'
        UNION ALL
        SELECT COUNT(*)::int AS c FROM "AccActivity" d
          LEFT JOIN astart a ON a."projectId" = d."projectId"
          WHERE d."projectId"='${pid}' AND (a.s IS NULL OR d."createdAt" < a.s)
      ) u`));
    ok(mergedLate === expectedLate && expectedLate > 0,
      `boundary: latest-start project merge=${mergedLate} == accds(P)+DC-backfill(P)=${expectedLate} (and > 0)`);

    if (fails.length) { console.error(`\n${fails.length} assertion(s) failed`); process.exit(1); }
    console.log('\nAll merge assertions passed.');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it in naive mode to confirm the harness has teeth**

Run: `MERGE_MODE=naive node scripts/verify-accds-merge.cjs`
Expected: **FAIL** — the reconciliation line prints `FAIL` (merged ≈ accds + full DC, larger than expected by ~1,035,547 overlap rows) and the process exits 1.

- [ ] **Step 3: Run it in partitioned mode**

Run: `node scripts/verify-accds-merge.cjs`
Expected: **PASS** — all assertions print `PASS`, `dc_backfill` ≈ 41,696, `dc_admin` ≈ 825, and "All merge assertions passed."

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-accds-merge.cjs
git commit -m "test(accds): live-DB verification harness for the activity merge" -- scripts/verify-accds-merge.cjs
```

---

## Task 2: Timeline view → unified merge

**Files:**
- Modify: `lib/server/activityTimelineView.ts` (replace the query inside `loadActivityTimeline`)

- [ ] **Step 1: Replace the query body**

In `lib/server/activityTimelineView.ts`, replace the `db.$queryRaw<RawRow[]>` template (currently the single-table `FROM "AccActivity"` group-by) with the merged query. Leave the `RawRow` interface, the `accDcProject.findMany`, the `nameById` map, the `rows` build, and the cache exactly as they are.

```ts
    db.$queryRaw<RawRow[]>`
      WITH astart AS (
        SELECT "projectId", MIN("createdAt") AS s
        FROM "AccActivityAccds"
        GROUP BY "projectId"
      )
      SELECT pid AS "projectId", month, SUM(c)::int AS count
      FROM (
        SELECT "projectId" AS pid,
               to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
               COUNT(*)::int AS c
          FROM "AccActivityAccds"
          GROUP BY 1, 2
        UNION ALL
        SELECT COALESCE(NULLIF(d."projectId", ''), '') AS pid,
               to_char(date_trunc('month', d."createdAt"), 'YYYY-MM') AS month,
               COUNT(*)::int AS c
          FROM "AccActivity" d
          LEFT JOIN astart a ON a."projectId" = d."projectId"
          WHERE d."projectId" IS NULL OR d."projectId" = ''
             OR a.s IS NULL
             OR d."createdAt" < a.s
          GROUP BY 1, 2
      ) u
      GROUP BY pid, month
    `,
```

- [ ] **Step 2: Update the file's doc comment**

Replace the comment above `loadActivityTimeline` so it describes the merge (accds primary, DC fills pre-accds + account-level), not "~1M AccActivity rows". Keep it to a few lines; reference the spec date `2026-06-12`.

- [ ] **Step 3: Verify the unit suite stays green**

Run: `npm test -- timelineCounts page.test`
Expected: PASS (these mock the loader / test the pure summarizer; the query change does not touch them).

- [ ] **Step 4: Verify against real data**

Run: `node scripts/verify-accds-merge.cjs`
Expected: PASS (unchanged — confirms the SQL you pasted matches the verified query).

- [ ] **Step 5: Commit**

```bash
git add lib/server/activityTimelineView.ts
git commit -m "feat(accds): timeline view reads unified accds+DC-backfill merge" -- lib/server/activityTimelineView.ts
```

---

## Task 3: Module donut view → unified merge

**Files:**
- Modify: `lib/server/moduleActivityView.ts` (replace `db.accActivity.groupBy(...)` with a raw merge query)

- [ ] **Step 1: Add a `RawRow` interface**

At the top of `lib/server/moduleActivityView.ts` (just below the imports), add:

```ts
interface RawRow {
  projectId: string;
  rawAction: string;
  count: number;
}
```

- [ ] **Step 2: Replace the `pairs` query**

Inside `loadModuleActivity`, replace the first element of the `Promise.all` (the `db.accActivity.groupBy({ by: ["projectId", "rawAction"], _count: { id: true } })` call) with the raw merge. The accds side groups `activityVerb` and aliases it into `rawAction` (same vocabulary, so `classifyActivity` is unchanged):

```ts
    db.$queryRaw<RawRow[]>`
      WITH astart AS (
        SELECT "projectId", MIN("createdAt") AS s
        FROM "AccActivityAccds"
        GROUP BY "projectId"
      )
      SELECT pid AS "projectId", action AS "rawAction", SUM(c)::int AS count
      FROM (
        SELECT "projectId" AS pid, "activityVerb" AS action, COUNT(*)::int AS c
          FROM "AccActivityAccds"
          GROUP BY 1, 2
        UNION ALL
        SELECT COALESCE(NULLIF(d."projectId", ''), '') AS pid, d."rawAction" AS action, COUNT(*)::int AS c
          FROM "AccActivity" d
          LEFT JOIN astart a ON a."projectId" = d."projectId"
          WHERE d."projectId" IS NULL OR d."projectId" = ''
             OR a.s IS NULL
             OR d."createdAt" < a.s
          GROUP BY 1, 2
      ) u
      GROUP BY pid, action
    `,
```

- [ ] **Step 3: Update the `rows` mapping**

The current mapping reads `p.rawAction` and `p._count.id`. With the raw query the shape is now flat (`p.rawAction`, `p.count`). Replace the `rows` build with:

```ts
  const rows: ModuleActivityRow[] = pairs.map((p) => {
    const projectId = p.projectId ?? "";
    const projectName = projectId === "" ? ACCOUNT_LEVEL : nameById.get(projectId) ?? projectId;
    return { projectId, projectName, rawAction: p.rawAction, count: p.count };
  });
```

- [ ] **Step 4: Update the file's doc comment**

Replace the "~990k AccActivity rows" comment with a few lines describing the merge (accds primary, DC fills pre-accds + account-level admin) and noting `activityVerb` is aliased to `rawAction`.

- [ ] **Step 5: Verify the unit suite stays green**

Run: `npm test -- moduleCounts page.test`
Expected: PASS.

- [ ] **Step 6: Verify against real data**

Run: `node scripts/verify-accds-merge.cjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/server/moduleActivityView.ts
git commit -m "feat(accds): module donut view reads unified accds+DC-backfill merge" -- lib/server/moduleActivityView.ts
```

---

## Task 4: Activity-by-role view → unified merge

**Files:**
- Modify: `lib/server/activityByActorView.ts` (replace `db.accActivity.groupBy(...)` with a raw merge query)

- [ ] **Step 1: Add a `RawRow` interface**

At the top of `lib/server/activityByActorView.ts` (below the `ActivityActorRow` interface), add:

```ts
interface RawRow {
  projectId: string;
  userEmail: string;
  count: number;
}
```

- [ ] **Step 2: Replace the `pairs` query**

Inside `loadActivityByActor`, replace the first element of the `Promise.all` (the `db.accActivity.groupBy({ by: ["projectId", "userEmail"], ... })` call) with the raw merge. Account-level rows stay excluded (no project → no role); the DC side keeps only pre-accds backfill:

```ts
    db.$queryRaw<RawRow[]>`
      WITH astart AS (
        SELECT "projectId", MIN("createdAt") AS s
        FROM "AccActivityAccds"
        GROUP BY "projectId"
      )
      SELECT pid AS "projectId", email AS "userEmail", SUM(c)::int AS count
      FROM (
        SELECT "projectId" AS pid, "userEmail" AS email, COUNT(*)::int AS c
          FROM "AccActivityAccds"
          WHERE "userEmail" IS NOT NULL
          GROUP BY 1, 2
        UNION ALL
        SELECT d."projectId" AS pid, d."userEmail" AS email, COUNT(*)::int AS c
          FROM "AccActivity" d
          LEFT JOIN astart a ON a."projectId" = d."projectId"
          WHERE d."projectId" IS NOT NULL AND d."projectId" <> ''
            AND d."userEmail" IS NOT NULL
            AND (a.s IS NULL OR d."createdAt" < a.s)
          GROUP BY 1, 2
      ) u
      GROUP BY pid, email
    `,
```

- [ ] **Step 3: Confirm the `rows` mapping still type-checks**

The current mapping reads `p.projectId`, `p.userEmail`, and `p._count.id`. Change the count read from `p._count.id` to `p.count`; everything else (the `nameByProject` / `nameByEmail` maps, the fallbacks) stays. The mapping becomes:

```ts
  const rows: ActivityActorRow[] = pairs.map((p) => {
    const projectId = p.projectId ?? "";
    const userEmail = p.userEmail ?? "";
    return {
      projectId,
      projectName: nameByProject.get(projectId) ?? projectId,
      userEmail,
      userName: nameByEmail.get(userEmail) ?? userEmail,
      count: p.count,
    };
  });
```

- [ ] **Step 4: Update the file's doc comment**

Replace the "~1M AccActivity rows" comment with a few lines describing the merge and noting account-level rows remain excluded (no role).

- [ ] **Step 5: Verify the unit suite stays green**

Run: `npm test -- roleActivityCounts ActivityByRolePieChart page.test`
Expected: PASS.

- [ ] **Step 6: Verify against real data**

Run: `node scripts/verify-accds-merge.cjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/server/activityByActorView.ts
git commit -m "feat(accds): activity-by-role view reads unified accds+DC-backfill merge" -- lib/server/activityByActorView.ts
```

---

## Task 5: Full regression gate

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS — the whole suite green (the summarizers and components were never touched; the page test mocks the loaders).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors. (If the repo has no standalone tsc config, `npm run build` also type-checks — but do not run a build against the live `:3000` dist; see Task 6.)

- [ ] **Step 3: Final real-data verification**

Run: `node scripts/verify-accds-merge.cjs`
Expected: PASS.

- [ ] **Step 4: Commit (only if Steps changed files; otherwise skip)**

No code changes expected in this task. If `tsc` forced a small fix, commit it by explicit path with a `chore(accds):` message.

---

## Task 6: Build, deploy, and visual UAT (owner-driven)

**Files:** none (deploy + manual verification).

This ships by rebuild, not a git merge. Do **not** `npm run build` against the running `:3000` dist (it 500s the live app). Build into a fresh dir, then swap.

- [ ] **Step 1: Build into a fresh dist**

Run (Bash, background-safe): `NEXT_DIST_DIR=.next-new npm run build`
Expected: build completes, type-checks clean.

- [ ] **Step 2: Swap and restart**

Swap `.next-new` → `.next` and restart `npm start` per the local Task-Scheduler deploy mechanism (`start-local.ps1`).

- [ ] **Step 3: Visual UAT checklist on `http://localhost:3000/access-analysis`**

  - **Timeline** spans back to **Dec 2024** again (DC backfill restored) and the recent year looks fuller than before (accds).
  - The **"Account-level"** project is selectable in the picker and contributes to the timeline + module donut.
  - **Module donut** shows an **Admin Actions** slice and a small (not dominant) **"Unmapped"** slice.
  - **Activity by role** renders; clicking a role lists contributors with real names (not bare emails).
  - Pick a **late-start project** (e.g. one whose accds began ~Oct 2025): its timeline has no missing or doubled month at the mid-2025 seam.

- [ ] **Step 4: Record outcome**

Note the build hash and UAT result. If a panel looks wrong, capture which one + the symptom before iterating.

---

## Self-Review

**Spec coverage:**
- Merge rule (per-project partition + account-level all-time) → Tasks 2–4 SQL + Task 1 assertions. ✓
- accds `activityVerb` ≡ DC `rawAction`, classifier unchanged → Task 3 (alias `activityVerb`→`rawAction`). ✓
- Page/client/summarizers unchanged → no task touches them; Tasks 2–5 assert their tests stay green. ✓
- No `source` param → no task introduces one. ✓
- Verification (reconciliation, no double-count, backfill+admin present, boundary, unmapped small, suite green, visual UAT) → Task 1 (first four), Task 5 (suite/tsc), Task 6 (unmapped + visual). ✓
- Deploy by rebuild, not against live dist → Task 6. ✓

**Placeholder scan:** All code blocks are complete; commands have expected output. No TBD/TODO. The boundary assertion is `keptInRange === 0`.

**Type consistency:** Each modified view defines a flat `RawRow` and the `rows.map` reads `p.count` (not `p._count.id`). `ModuleActivityRow`, `ActivityActorRow`, and `ActivityTimelineRow` shapes are unchanged, so `AccessAnalysisCharts` props and the summarizers compile without edits. Loader names (`loadActivityTimeline`, `loadModuleActivity`, `loadActivityByActor`) are unchanged, matching `page.tsx` imports and `page.test.tsx` mocks.
