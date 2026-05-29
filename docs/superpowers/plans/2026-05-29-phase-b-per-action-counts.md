# Phase B — Per-Action Counts Through the Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry an exact per-canonical-action count map onto every `(user, project)` node — `NodeFeatureSnapshot.actionCounts` — sourced from the activity data already grouped by `rawAction`, plus account-level admin actions attributed to the actor. The existing 7-bucket `activityMix` stays untouched.

**Architecture:** The hot cache already runs `groupBy(["userEmail","projectId","rawAction"])`; today `foldActivityRows` collapses it to 7 categories and discards the action. We add a sparse `actionCounts` map (keyed by canonical taxonomy id via `resolveActionId`) beside `activityMix`, thread it through the five links that already carry `activityMix` (`activityAggregate → dcUserAssembly → acc-types → graphTables → featureSnapshot`), and add a parallel admin-source fold attributed to the actor across all their instances. The activity cache shape-token is bumped so the new field rebuilds.

**Tech Stack:** TypeScript, Prisma/Postgres (`groupBy`), apache-arrow + DuckDB-WASM, Vitest 4. Depends on Phase A's `accTaxonomy` (`resolveActionId`).

**Scope note:** This phase carries **raw integer counts** only. Turning counts into `none/low/med/high` buckets via per-action quantile thresholds is **deferred to Phase D** (where the ordinal-ramp layout consumes them) — building the threshold table here would be unused (YAGNI).

---

## File Structure

| File | Change |
|---|---|
| `lib/acc/activityAggregate.ts` | `InstanceActivity.actionCounts?`; `foldActivityRows` populates it; new `AdminActionRow` + `foldAdminActionRows` |
| `lib/acc/activityAggregate.test.ts` | update "no payload leak" key-set; add actionCounts + admin-fold tests |
| `lib/acc/acc-types.ts` | `BulkAccProject.actionCounts?` |
| `lib/acc/dcUserAssembly.ts` | `DcAssemblyInput.adminActionsByActor?`; merge per-instance + actor admin counts; attach to project |
| `lib/acc/dcUserAssembly.test.ts` | add actionCounts merge + admin-projection test |
| `lib/server/acc-hot-cache.ts` | admin `groupBy` + `foldAdminActionRows`; pass `adminActionsByActor`; bump cache token `act`→`act2` |
| `app/(dashboard)/users/access-analysis/graphTables.ts` | serialize `activity_actions_json` column |
| `app/(dashboard)/users/access-analysis/graphTables.test.ts` | assert the column round-trips |
| `app/(dashboard)/users/access-analysis/interactionTypes.ts` | `NodeFeatureSnapshot.actionCounts?` |
| `app/(dashboard)/users/access-analysis/featureSnapshot.ts` | select + parse `activity_actions_json` → `actionCounts` |
| `app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts` | mock the column + assert parse |

---

## Task 1: per-action folding in `activityAggregate.ts`

**Files:**
- Modify: `lib/acc/activityAggregate.ts`
- Test: `lib/acc/activityAggregate.test.ts`

- [ ] **Step 1: Update the test first** — replace the ENTIRE contents of `lib/acc/activityAggregate.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { foldActivityRows, foldAdminActionRows } from "./activityAggregate";

describe("foldActivityRows", () => {
  it("buckets raw actions by normalized category per (email, projectId)", () => {
    const out = foldActivityRows([
      { userEmail: "A@x.com", projectId: "p1", rawAction: "File Viewed", count: 3, lastCreatedAt: "2026-05-01T00:00:00Z" },
      { userEmail: "a@x.com", projectId: "p1", rawAction: "File Uploaded", count: 2, lastCreatedAt: "2026-05-10T00:00:00Z" },
    ]);
    const inst = out.get("a@x.com::p1")!; // key lowercased
    expect(inst.mix.view).toBe(3);
    expect(inst.mix.upload).toBe(2);
    expect(inst.total).toBe(5);
    expect(inst.lastActivity).toBe("2026-05-10T00:00:00.000Z"); // max
  });

  it("keeps a per-canonical-action count map (resolved + summed) alongside the category mix", () => {
    const out = foldActivityRows([
      { userEmail: "a@x.com", projectId: "p1", rawAction: "view-entity", count: 4, lastCreatedAt: "2026-05-01T00:00:00Z" },
      { userEmail: "a@x.com", projectId: "p1", rawAction: "view-entity", count: 1, lastCreatedAt: "2026-05-02T00:00:00Z" },
      { userEmail: "a@x.com", projectId: "p1", rawAction: "issue-create", count: 2, lastCreatedAt: "2026-05-03T00:00:00Z" },
      // alias: DB "...namingstandard" resolves to the canonical "...naming-standard"
      { userEmail: "a@x.com", projectId: "p1", rawAction: "add-attribute-to-namingstandard", count: 1, lastCreatedAt: "2026-05-04T00:00:00Z" },
    ]);
    const inst = out.get("a@x.com::p1")!;
    expect(inst.actionCounts!["view-entity"]).toBe(5);
    expect(inst.actionCounts!["issue-create"]).toBe(2);
    expect(inst.actionCounts!["add-attribute-to-naming-standard"]).toBe(1);
  });

  it("emits only category mix + canonical action ids — never raw payload strings", () => {
    const out = foldActivityRows([
      { userEmail: "a@x.com", projectId: "p1", rawAction: "view-entity", count: 1, lastCreatedAt: "2026-05-01T00:00:00Z" },
    ]);
    const inst = out.get("a@x.com::p1")!;
    expect(Object.keys(inst).sort()).toEqual(["actionCounts", "lastActivity", "mix", "total"]);
    for (const k of Object.keys(inst.mix)) {
      expect(["view","upload","edit","delete","memberEvent","projectEvent","other"]).toContain(k);
    }
    // action ids are kebab (no spaces / uppercase) — no raw label leak
    for (const k of Object.keys(inst.actionCounts!)) expect(k).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("foldAdminActionRows", () => {
  it("sums admin actions per actor (lowercased), keyed by canonical action id", () => {
    const out = foldAdminActionRows([
      { actorEmail: "Boss@x.com", rawAction: "assign-member", count: 3 },
      { actorEmail: "boss@x.com", rawAction: "assign-member", count: 2 },
      { actorEmail: "boss@x.com", rawAction: "edit-project", count: 1 },
    ]);
    expect(out.get("boss@x.com")).toEqual({ "assign-member": 5, "edit-project": 1 });
  });
});
```

- [ ] **Step 2: Run the test, verify it FAILS** — `npx vitest run lib/acc/activityAggregate.test.ts` → FAIL (`foldAdminActionRows` not exported; `actionCounts` undefined).

- [ ] **Step 3: Edit `lib/acc/activityAggregate.ts`.** Replace the whole file with:

```ts
import { categorize, type ActivityCategory } from "./activityCategories";
import { resolveActionId } from "@/app/(dashboard)/users/access-analysis/accTaxonomy";

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
  /** [Phase B] Sparse per-canonical-action counts for THIS instance (keyed by taxonomy id). */
  actionCounts?: Record<string, number>;
}

export function foldActivityRows(rows: readonly RawActivityGroupRow[]): Map<string, InstanceActivity> {
  const out = new Map<string, InstanceActivity>();
  for (const r of rows) {
    const key = `${r.userEmail.toLowerCase()}::${r.projectId}`;
    const cur = out.get(key) ?? { mix: {}, total: 0, lastActivity: null, actionCounts: {} };
    const cat = categorize(r.rawAction);
    cur.mix[cat] = (cur.mix[cat] ?? 0) + r.count;
    cur.total += r.count;
    const actionId = resolveActionId(r.rawAction);
    cur.actionCounts![actionId] = (cur.actionCounts![actionId] ?? 0) + r.count;
    const iso = new Date(r.lastCreatedAt).toISOString();
    if (cur.lastActivity === null || iso > cur.lastActivity) cur.lastActivity = iso;
    out.set(key, cur);
  }
  return out;
}

/** [Phase B] Account-level admin activity row (sourceFile='admin'); attributed to the ACTOR. */
export interface AdminActionRow {
  actorEmail: string;
  rawAction: string;
  count: number;
}

/** Fold admin rows into per-actor count maps: lowercased actorEmail -> { canonicalActionId: count }. */
export function foldAdminActionRows(rows: readonly AdminActionRow[]): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const actor = r.actorEmail.toLowerCase();
    const cur = out.get(actor) ?? {};
    const actionId = resolveActionId(r.rawAction);
    cur[actionId] = (cur[actionId] ?? 0) + r.count;
    out.set(actor, cur);
  }
  return out;
}
```

- [ ] **Step 4: Run the test, verify it PASSES** — `npx vitest run lib/acc/activityAggregate.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/acc/activityAggregate.ts lib/acc/activityAggregate.test.ts
git commit -m "feat(acc-activity): preserve per-action counts + admin actor fold"
```

---

## Task 2: attach `actionCounts` in `dcUserAssembly` (+ acc-types)

**Files:**
- Modify: `lib/acc/acc-types.ts`
- Modify: `lib/acc/dcUserAssembly.ts`
- Test: `lib/acc/dcUserAssembly.test.ts`

- [ ] **Step 1: Add the test first.** Append this `describe` block to the END of `lib/acc/dcUserAssembly.test.ts` (after the existing `activityByInstance attach` block, before EOF):

```ts
describe("actionCounts attach", () => {
  it("merges per-instance action counts with the actor's admin action counts onto every instance", () => {
    const out = assembleDcUsers({
      ...base,
      users: [{ id: "u1", email: "a@hermosillo.com", name: "A", status: "active", companyId: null }],
      projectUsers: [
        { projectId: "p1", userId: "u1" },
        { projectId: "p2", userId: "u1" },
      ],
      projectMeta: {
        p1: { name: "P1", status: "active", crawlStatus: "ok" },
        p2: { name: "P2", status: "active", crawlStatus: "ok" },
      },
      activityByInstance: new Map([
        ["a@hermosillo.com::p1", { mix: { view: 4 }, total: 4, lastActivity: "2026-05-10T00:00:00.000Z", actionCounts: { "view-entity": 4 } }],
      ]),
      adminActionsByActor: new Map([["a@hermosillo.com", { "assign-member": 3 }]]),
    });
    const byId = Object.fromEntries(out[0].projects.map((p) => [p.id, p]));
    // p1: per-instance view-entity AND actor-wide assign-member
    expect(byId.p1.actionCounts).toEqual({ "view-entity": 4, "assign-member": 3 });
    // p2: no per-instance activity, but the actor's admin count still lands here
    expect(byId.p2.actionCounts).toEqual({ "assign-member": 3 });
  });

  it("defaults actionCounts to an empty object when nothing applies", () => {
    expect(assembleDcUsers(base)[0].projects[0].actionCounts).toEqual({});
  });
});
```

- [ ] **Step 2: Run it, verify it FAILS** — `npx vitest run lib/acc/dcUserAssembly.test.ts` → FAIL (`adminActionsByActor` not in type / `actionCounts` undefined).

- [ ] **Step 3: Edit `lib/acc/acc-types.ts`.** Find this block (around line 26):

```ts
  /** [P5-C] ISO of the most recent activity event for THIS instance; null when none. */
  lastActivity?: string | null;
}
```

Replace with:

```ts
  /** [P5-C] ISO of the most recent activity event for THIS instance; null when none. */
  lastActivity?: string | null;
  /** [Phase B] Sparse per-canonical-action counts for THIS instance (taxonomy ids). */
  actionCounts?: Record<string, number>;
}
```

- [ ] **Step 4: Edit `lib/acc/dcUserAssembly.ts` — add the input field.** Find (around line 27):

```ts
  /** [P5-C] Per-(user,project) activity aggregate, keyed `lowercasedEmail::projectId`. */
  activityByInstance?: Map<string, InstanceActivity>;
}
```

Replace with:

```ts
  /** [P5-C] Per-(user,project) activity aggregate, keyed `lowercasedEmail::projectId`. */
  activityByInstance?: Map<string, InstanceActivity>;
  /** [Phase B] Account-level admin action counts per actor (lowercased email -> {actionId: count}). */
  adminActionsByActor?: Map<string, Record<string, number>>;
}
```

- [ ] **Step 5: Edit `lib/acc/dcUserAssembly.ts` — merge + attach.** Find (around line 175):

```ts
      const activity = input.activityByInstance?.get(`${email}::${pid}`);
      return {
        id: pid,
        name: meta.name,
        status: meta.status,
        isAdmin,
        roles,
        modules: prods.map((p) => p.key),
        crawlStatus: meta.crawlStatus,
        addedOn: membershipDates.get(`${u.id}::${pid}`)?.addedOn ?? null,
        lastSignIn: membershipDates.get(`${u.id}::${pid}`)?.lastSignIn ?? null,
        permissionStrength,
        folderBreadth,
        permMixedProfile,
        fullController,
        activityMix: activity?.mix,
        activityTotal: activity?.total,
        lastActivity: activity?.lastActivity,
      };
```

Replace with:

```ts
      const activity = input.activityByInstance?.get(`${email}::${pid}`);
      // [Phase B] per-instance action counts, then fold in the actor's account-level
      // admin action counts (same for every one of this user's instances — decision 9).
      const actionCounts: Record<string, number> = { ...(activity?.actionCounts ?? {}) };
      const adminCounts = input.adminActionsByActor?.get(email);
      if (adminCounts) {
        for (const [k, v] of Object.entries(adminCounts)) {
          actionCounts[k] = (actionCounts[k] ?? 0) + v;
        }
      }
      return {
        id: pid,
        name: meta.name,
        status: meta.status,
        isAdmin,
        roles,
        modules: prods.map((p) => p.key),
        crawlStatus: meta.crawlStatus,
        addedOn: membershipDates.get(`${u.id}::${pid}`)?.addedOn ?? null,
        lastSignIn: membershipDates.get(`${u.id}::${pid}`)?.lastSignIn ?? null,
        permissionStrength,
        folderBreadth,
        permMixedProfile,
        fullController,
        activityMix: activity?.mix,
        activityTotal: activity?.total,
        lastActivity: activity?.lastActivity,
        actionCounts,
      };
```

- [ ] **Step 6: Run the test, verify it PASSES** — `npx vitest run lib/acc/dcUserAssembly.test.ts` → PASS (existing + 2 new).

- [ ] **Step 7: Commit**

```bash
git add lib/acc/acc-types.ts lib/acc/dcUserAssembly.ts lib/acc/dcUserAssembly.test.ts
git commit -m "feat(acc-assembly): attach per-instance + actor-admin actionCounts to projects"
```

---

## Task 3: wire admin query + actionCounts in `acc-hot-cache.ts` (+ cache bump)

**Files:**
- Modify: `lib/server/acc-hot-cache.ts`

No new unit test (Prisma glue). Verified by `tsc` + the full suite; the folding logic it calls is already unit-tested in Task 1, and the merge in Task 2.

- [ ] **Step 1: Update the import.** Find (line 5):

```ts
import { foldActivityRows, type InstanceActivity } from "@/lib/acc/activityAggregate";
```

Replace with:

```ts
import { foldActivityRows, foldAdminActionRows, type InstanceActivity } from "@/lib/acc/activityAggregate";
```

- [ ] **Step 2: Bump the activity cache shape-token.** Find (line ~178):

```ts
      includeActivityMix ? "act" : null,
```

Replace with:

```ts
      includeActivityMix ? "act2" : null, // bumped: payload now includes per-action counts (Phase B)
```

- [ ] **Step 3: Add the admin fold + variable.** Find this block (around line 244):

```ts
      let activityByInstance: Map<string, InstanceActivity> | undefined;
      if (includeActivityMix) {
        // Grouped ONLY — never findMany over AccActivity. sourceFile='project'
        // already excludes admin rows (projectId='' sentinel); the projectId filter
        // is explicit per spec. C0 measured this at ~218ms over ~623k rows.
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

Replace with:

```ts
      let activityByInstance: Map<string, InstanceActivity> | undefined;
      let adminActionsByActor: Map<string, Record<string, number>> | undefined;
      if (includeActivityMix) {
        // Grouped ONLY — never findMany over AccActivity. sourceFile='project'
        // already excludes admin rows (projectId='' sentinel); the projectId filter
        // is explicit per spec. C0 measured this at ~218ms over ~623k rows.
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
        // [Phase B] Account-level admin actions (projectId='' sentinel): attribute to the
        // ACTOR (userEmail). No target resolution. Grouped by actor + action only.
        const adminGroups = await db.accActivity.groupBy({
          by: ["userEmail", "rawAction"],
          where: { sourceFile: "admin", userEmail: { not: null } },
          _count: { _all: true },
        });
        adminActionsByActor = foldAdminActionRows(
          adminGroups.map((g: any) => ({
            actorEmail: g.userEmail as string,
            rawAction: g.rawAction as string,
            count: g._count._all as number,
          })),
        );
      }
```

- [ ] **Step 4: Pass it into `assembleDcUsers`.** Find (around line 266):

```ts
      return assembleDcUsers({
        includePermissionContexts,
        includePermissionSummary,
        activityByInstance,
        users: users.map((u: any) => ({
```

Replace with:

```ts
      return assembleDcUsers({
        includePermissionContexts,
        includePermissionSummary,
        activityByInstance,
        adminActionsByActor,
        users: users.map((u: any) => ({
```

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` → confirm no errors referencing `acc-hot-cache.ts`, `dcUserAssembly.ts`, `activityAggregate.ts`, or `acc-types.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/server/acc-hot-cache.ts
git commit -m "feat(acc-cache): query admin actions + supply actionCounts; bump activity cache token"
```

---

## Task 4: serialize `activity_actions_json` in `graphTables.ts`

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/graphTables.ts`
- Test: `app/(dashboard)/users/access-analysis/graphTables.test.ts`

- [ ] **Step 1: Add the test first.** Append to the END of the `describe("buildGraphArrowTables", ...)` block in `graphTables.test.ts` (i.e., add a new `it` before the closing `});` of that describe):

```ts
  it("serializes per-action counts into the activity_actions_json column", async () => {
    const users = [
      user({
        email: "alpha@example.com",
        projects: [
          {
            id: "p1", name: "Project One", status: "active", isAdmin: false,
            roles: ["Architect"], modules: ["Docs"],
            actionCounts: { "view-entity": 5, "issue-create": 2 },
          },
        ],
      }),
    ];
    const tables = await buildGraphArrowTables({ users, similarityInput: null, topology: null });
    const col = tables.userProjects.getChild("activity_actions_json");
    expect(col).not.toBeNull();
    expect(JSON.parse(String(col!.get(0)))).toEqual({ "view-entity": 5, "issue-create": 2 });
  });
```

- [ ] **Step 2: Run it, verify it FAILS** — `npx vitest run "app/(dashboard)/users/access-analysis/graphTables.test.ts"` → FAIL (`getChild("activity_actions_json")` is null).

- [ ] **Step 3: Edit `graphTables.ts` — populate the row field.** Find (around line 146):

```ts
        activity_mix_json: JSON.stringify(project.activityMix ?? {}),
        activity_total: project.activityTotal ?? 0,
        last_activity: timestampMillis(project.lastActivity ?? null),
```

Replace with:

```ts
        activity_mix_json: JSON.stringify(project.activityMix ?? {}),
        activity_actions_json: JSON.stringify(project.actionCounts ?? {}),
        activity_total: project.activityTotal ?? 0,
        last_activity: timestampMillis(project.lastActivity ?? null),
```

- [ ] **Step 4: Edit `graphTables.ts` — add the Arrow column.** Find (around line 218):

```ts
      activity_mix_json: projectRows.map((row) => row.activity_mix_json),
      activity_total: Int32Array.from(projectRows.map((row) => row.activity_total)),
```

Replace with:

```ts
      activity_mix_json: projectRows.map((row) => row.activity_mix_json),
      activity_actions_json: projectRows.map((row) => row.activity_actions_json),
      activity_total: Int32Array.from(projectRows.map((row) => row.activity_total)),
```

- [ ] **Step 5: Run the test, verify it PASSES** — `npx vitest run "app/(dashboard)/users/access-analysis/graphTables.test.ts"` → PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/graphTables.ts" "app/(dashboard)/users/access-analysis/graphTables.test.ts"
git commit -m "feat(acc-graph): serialize per-action counts into activity_actions_json column"
```

---

## Task 5: parse `actionCounts` onto `NodeFeatureSnapshot`

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/interactionTypes.ts`
- Modify: `app/(dashboard)/users/access-analysis/featureSnapshot.ts`
- Test: `app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts`

- [ ] **Step 1: Add the type.** In `interactionTypes.ts`, find (around line 102):

```ts
  /** [P5-C] Sum of activityMix values. */
  activityTotal?: number;
}
```

Replace with:

```ts
  /** [P5-C] Sum of activityMix values. */
  activityTotal?: number;
  /** [Phase B] Sparse per-canonical-action counts for this instance (taxonomy action ids). */
  actionCounts?: Record<string, number>;
}
```

- [ ] **Step 2: Add the test.** In `__tests__/featureSnapshot.test.ts`:
  (a) add the optional field to the `FakeRow` interface — after `activity_mix_json: string | null;` add:
  ```ts
  activity_actions_json?: string | null;
  ```
  (b) Append a new test inside the existing top-level `describe(...)` (add before its closing `});`):
  ```ts
  it("parses activity_actions_json into a per-action count map", async () => {
    mockRows = [
      {
        user_id: "u1", project_id: "p1", full_name: "A", email: "a@x.com",
        project_name: "P1", role_display: "Architect", perm_tier: null,
        is_external: false, activity_count: 0, last_signin_days: 1,
        firm_name: "", account_status: "active", permission_coverage: "known",
        is_project_admin: false, module_ids: "", added_on: null,
        last_sign_in_instance: null, perm_strength: 0, folder_breadth: 0,
        full_controller: false, perm_mixed: false, activity_mix_json: "{}",
        activity_actions_json: '{"view-entity":7,"issue-create":2}',
        activity_total: 0, last_activity: null,
      },
    ];
    const [snap] = await buildFeatureSnapshot({ nodeIds: ["u1::p1"] });
    expect(snap.actionCounts?.["view-entity"]).toBe(7);
    expect(snap.actionCounts?.["issue-create"]).toBe(2);
  });
  ```
  (Note: if the existing mock harness uses a different row-builder shape, mirror the fields the other rows in this file already set; the key addition is `activity_actions_json` + the two assertions.)

- [ ] **Step 3: Run it, verify it FAILS** — `npx vitest run "app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts"` → FAIL (`snap.actionCounts` undefined).

- [ ] **Step 4: Edit `featureSnapshot.ts` — RawFeatureRow.** Find (around line 113):

```ts
  activity_mix_json: string | null;
  activity_total: bigint | number | null;
```

Replace with:

```ts
  activity_mix_json: string | null;
  activity_actions_json: string | null;
  activity_total: bigint | number | null;
```

- [ ] **Step 5: Edit `featureSnapshot.ts` — SQL select.** Find (around line 175):

```ts
      ANY_VALUE(up.activity_mix_json)                                   AS activity_mix_json,
      COALESCE(ANY_VALUE(up.activity_total), 0)                         AS activity_total,
```

Replace with:

```ts
      ANY_VALUE(up.activity_mix_json)                                   AS activity_mix_json,
      ANY_VALUE(up.activity_actions_json)                              AS activity_actions_json,
      COALESCE(ANY_VALUE(up.activity_total), 0)                         AS activity_total,
```

- [ ] **Step 6: Edit `featureSnapshot.ts` — parse.** Find (around line 208):

```ts
    const activityMix = (() => {
      try { return r.activity_mix_json ? JSON.parse(r.activity_mix_json) : {}; }
      catch { return {}; }
    })();
```

Replace with:

```ts
    const activityMix = (() => {
      try { return r.activity_mix_json ? JSON.parse(r.activity_mix_json) : {}; }
      catch { return {}; }
    })();
    const actionCounts = (() => {
      try { return r.activity_actions_json ? JSON.parse(r.activity_actions_json) : {}; }
      catch { return {}; }
    })();
```

- [ ] **Step 7: Edit `featureSnapshot.ts` — attach to the snapshot.** Find (around line 267):

```ts
      activityMix,
      activityTotal,
      permissionStrength,
```

Replace with:

```ts
      activityMix,
      actionCounts,
      activityTotal,
      permissionStrength,
```

- [ ] **Step 8: Edit `featureSnapshot.ts` — fallback snapshot.** Find (around line 310):

```ts
    activityMix: {},
    activityTotal: 0,
  });
```

Replace with:

```ts
    activityMix: {},
    actionCounts: {},
    activityTotal: 0,
  });
```

- [ ] **Step 9: Run the test, verify it PASSES** — `npx vitest run "app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts"` → PASS.

- [ ] **Step 10: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/interactionTypes.ts" "app/(dashboard)/users/access-analysis/featureSnapshot.ts" "app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts"
git commit -m "feat(acc-graph): parse activity_actions_json onto NodeFeatureSnapshot.actionCounts"
```

---

## Task 6: full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck** — `npx tsc --noEmit` → confirm no NEW errors in any touched file.
- [ ] **Step 2: Run the lib/acc + access-analysis suites** — `npx vitest run lib/acc "app/(dashboard)/users/access-analysis"` → all PASS.
- [ ] **Step 3: Run the whole unit suite** — `npm test` → all PASS (e2e excluded by the script).
- [ ] **Step 4:** If anything fails, report it; do not paper over. No commit needed for this task (verification only).

---

## Self-Review

**Spec coverage (Phase B scope, spec §8):**
- Preserve per-action counts beside `activityMix` → Tasks 1,2,4,5. ✅
- Thread through `activityAggregate → dcUserAssembly → acc-types → graphTables → featureSnapshot → NodeFeatureSnapshot.actionCounts` → Tasks 1–5. ✅
- Admin actor-attribution (no target resolution) → Tasks 1 (`foldAdminActionRows`), 2 (merge onto every instance), 3 (admin `groupBy`). ✅
- Bump activity-mix cache version → Task 3 (`act`→`act2`). ✅
- Per-action quantile buckets → **deferred to Phase D** (documented in scope note; building it here would be unused). ✅ (intentional, not a gap)

**Placeholder scan:** Task 5 Step 2(b) notes the mock harness may differ — the concrete field + assertions are given; this is the one spot the executor adapts to the existing file. All other steps are exact old→new blocks.

**Type consistency:** `actionCounts?: Record<string, number>` is identical on `InstanceActivity`, `BulkAccProject`, and `NodeFeatureSnapshot`. `adminActionsByActor: Map<string, Record<string, number>>` matches between `foldAdminActionRows` return (Task 1), `DcAssemblyInput` (Task 2), and the hot-cache variable (Task 3). `resolveActionId` is imported from `@/app/(dashboard)/users/access-analysis/accTaxonomy` (Phase A export) — consistent with the existing `@/app/(dashboard)/...` import already in `dcUserAssembly.ts`.

**Compatibility traps handled:** `actionCounts` is OPTIONAL on `InstanceActivity` so the existing `activityByInstance attach` test (which omits it) still compiles; the `activityAggregate.test.ts` "no payload leak" key-set is updated to include `actionCounts`.
