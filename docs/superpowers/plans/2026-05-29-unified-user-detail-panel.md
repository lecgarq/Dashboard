# Unified, instant user-detail panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared, email-keyed user-detail panel that opens instantly from the already-loaded synced snapshot (no live Autodesk call on the click path), used by both the `/users` directory click and the access-analysis graph node click.

**Architecture:** Reuse the existing rich renderer `AccProfileFull` (in `AccProfileSection.tsx`) but feed it from an in-memory `BulkAccUser` via a pure mapper instead of the per-click `getAccProfile` query. Wrap it in a new presentational `UserProfilePanel` (variants: `dialog` | `rail`). Wire it into `/users`' `PersonDetailModal` (resolving the user from `mergedAccUsers`) and into the access-analysis `RightPanelStack` (resolving from a bulk map built in `AccessAnalysisShell`). The manual **Refresh** button remains the only live-fetch path.

**Tech Stack:** Next.js App Router, React, tRPC + React Query, TypeScript, Tailwind, vitest (jsdom) for unit, Playwright for e2e (`NEXT_PUBLIC_ACC_GRAPH_TEST` bridge).

**Key invariants (do not break):**
- Access-analysis right rail stays `w-96` (P0 camera-stability — resizing reframes the graph).
- The rail panel keeps `data-testid="user-detail-panel"` and the stack keeps `data-top-layer="user-detail"` (existing e2e at `tests/e2e/acc-dc-graph.spec.ts:412` depends on them).
- No live Autodesk (`getAccProfile`) call fires when the panel *opens* — only on explicit Refresh.

---

## File structure

- **Modify** `app/(dashboard)/users/AccProfileSection.tsx` — export the reusable pieces (`AccProfileData`, `ProjectData`, `AccProfileFull`, `AccLoadingProgress`). No behavior change.
- **Create** `app/(dashboard)/users/bulkUserToProfileData.ts` — pure mapper `BulkAccUser → AccProfileData`.
- **Create** `app/(dashboard)/users/bulkUserToProfileData.test.ts` — mapper unit tests.
- **Create** `app/(dashboard)/users/UserProfilePanel.tsx` — shared panel (dialog | rail), fed from `BulkAccUser`, instant open, Refresh override.
- **Create** `app/(dashboard)/users/UserProfilePanel.test.tsx` — not-synced empty-state + no-getAccProfile-on-open.
- **Modify** `app/(dashboard)/users/UsersDirectoryClient.tsx` — `PersonDetailModal` renders `UserProfilePanel`; mount passes the resolved `BulkAccUser`.
- **Modify** `app/(dashboard)/users/access-analysis/RightPanelStack.tsx` — render `UserProfilePanel` (rail) instead of `UserDetailPanel`; new `usersByEmail` prop.
- **Modify** `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` — load `enrichedUsers`, build `usersByEmail`, thread it through `ShellBody` to `RightPanelStack`.
- **Modify** `tests/e2e/acc-dc-graph.spec.ts` — extend the isolate test to assert profile content.

---

### Task 1: Export reusable pieces from `AccProfileSection.tsx`

**Files:**
- Modify: `app/(dashboard)/users/AccProfileSection.tsx` (lines 103, 204, 362, 375)

- [ ] **Step 1: Add `export` to the four declarations**

Change `function AccLoadingProgress()` (line 103) to:

```tsx
export function AccLoadingProgress() {
```

Change `type ProjectData = {` (line 204) to:

```tsx
export type ProjectData = {
```

Change `type AccProfileData = {` (line 362) to:

```tsx
export type AccProfileData = {
```

Change `function AccProfileFull({` (line 375) to:

```tsx
export function AccProfileFull({
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors; these are additive `export`s).

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/users/AccProfileSection.tsx"
git commit -m "refactor(acc-profile): export AccProfileFull + types for reuse"
```

---

### Task 2: Pure mapper `bulkUserToProfileData` (TDD)

**Files:**
- Create: `app/(dashboard)/users/bulkUserToProfileData.ts`
- Test: `app/(dashboard)/users/bulkUserToProfileData.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { bulkUserToProfileData } from "./bulkUserToProfileData";

const baseUser: BulkAccUser = {
  email: "jane@hermosillo.com",
  name: "Jane Doe",
  found: true,
  projectCount: 2,
  activeCount: 1,
  adminCount: 1,
  hasNoProjects: false,
  syncedAt: "2026-05-29T10:00:00.000Z",
  allRoles: ["Architect"],
  allModules: ["docs", "build"],
  isAccountAdmin: false,
  addedOn: "2025-01-15T00:00:00.000Z",
  lastSignIn: "2026-05-20T08:30:00.000Z",
  companyName: "Hermosillo",
  aggregatedStatus: "active",
  projectAdmin: true,
  projects: [
    {
      id: "p1",
      name: "Tower A",
      status: "active",
      isAdmin: true,
      roles: ["Architect"],
      modules: ["docs", "build"],
      addedOn: "2025-01-15T00:00:00.000Z",
    },
    {
      id: "p2",
      name: "Tower B",
      status: "archived",
      isAdmin: false,
      roles: [],
      modules: ["docs"],
    },
  ],
};

describe("bulkUserToProfileData", () => {
  it("maps a found user to AccProfileData with projects and metadata", () => {
    const data = bulkUserToProfileData(baseUser);
    expect(data.found).toBe(true);
    expect(data.name).toBe("Jane Doe");
    expect(data.status).toBe("active");
    expect(data.company).toBe("Hermosillo");
    expect(data.addedOn).toBe("2025-01-15T00:00:00.000Z");
    expect(data.lastSignIn).toBe("2026-05-20T08:30:00.000Z");
    expect(data.syncedAt).toBe("2026-05-29T10:00:00.000Z");
    expect(data.role).toBe("project_admin");
    expect(data.projects).toHaveLength(2);
    expect(data.projects?.[0]).toMatchObject({
      id: "p1",
      name: "Tower A",
      status: "active",
      isAdmin: true,
      roles: ["Architect"],
      modules: ["docs", "build"],
      addedOn: "2025-01-15T00:00:00.000Z",
    });
    // Project without addedOn maps to undefined (not null) for the renderer.
    expect(data.projects?.[1].addedOn).toBeUndefined();
  });

  it("derives account_admin role and falls back on missing enrichment", () => {
    const admin = bulkUserToProfileData({
      ...baseUser,
      isAccountAdmin: true,
      aggregatedStatus: undefined,
      projectAdmin: undefined,
      companyName: null,
    });
    expect(admin.role).toBe("account_admin");
    // No aggregatedStatus → derive "active" because activeCount > 0.
    expect(admin.status).toBe("active");
    // companyName null → company undefined (renderer hides the row).
    expect(admin.company).toBeUndefined();
  });

  it("derives inactive status when no active projects and no enrichment", () => {
    const data = bulkUserToProfileData({
      ...baseUser,
      activeCount: 0,
      aggregatedStatus: undefined,
    });
    expect(data.status).toBe("inactive");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/bulkUserToProfileData.test.ts"`
Expected: FAIL — "bulkUserToProfileData is not a function" (module missing).

- [ ] **Step 3: Write minimal implementation**

```ts
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { AccProfileData, ProjectData } from "./AccProfileSection";

/**
 * Maps an in-memory synced BulkAccUser into the AccProfileData shape that
 * AccProfileFull renders. Pure — no I/O. Used so the profile panel can render
 * instantly from already-loaded bulk data instead of a per-click getAccProfile
 * round trip. Caller must only pass `found` users; callers branch on
 * `user.found` and show a "not synced" state otherwise.
 */
export function bulkUserToProfileData(user: BulkAccUser): AccProfileData {
  const projects: ProjectData[] = user.projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    isAdmin: p.isAdmin,
    roles: p.roles,
    modules: p.modules,
    // ProjectData.addedOn is `string | undefined`; BulkAccProject.addedOn is
    // `string | null | undefined`. Normalize null → undefined.
    addedOn: p.addedOn ?? undefined,
  }));

  const status =
    user.aggregatedStatus ?? (user.activeCount > 0 ? "active" : "inactive");

  const role = user.isAccountAdmin
    ? "account_admin"
    : user.projectAdmin
      ? "project_admin"
      : undefined;

  return {
    found: true,
    status,
    name: user.name,
    syncedAt: user.syncedAt,
    role,
    company: user.companyName ?? undefined,
    addedOn: user.addedOn ?? undefined,
    lastSignIn: user.lastSignIn ?? undefined,
    projects,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/bulkUserToProfileData.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/bulkUserToProfileData.ts" "app/(dashboard)/users/bulkUserToProfileData.test.ts"
git commit -m "feat(acc-profile): pure BulkAccUser -> AccProfileData mapper"
```

---

### Task 3: Shared `UserProfilePanel` component

**Files:**
- Create: `app/(dashboard)/users/UserProfilePanel.tsx`
- Test: `app/(dashboard)/users/UserProfilePanel.test.tsx`

- [ ] **Step 1: Write the failing test (empty-state + no live call on open)**

```tsx
// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BulkAccUser } from "@/lib/acc/acc-types";

// getAccProfile must NOT be fetched on open. Spy on the utils fetch.
const fetchSpy = vi.fn(async () => ({ found: false, syncedAt: "" }));
vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    useUtils: () => ({ users: { getAccProfile: { fetch: fetchSpy } } }),
  },
}));

import { UserProfilePanel } from "./UserProfilePanel";

const stub: BulkAccUser = {
  email: "ghost@example.com",
  name: "Ghost",
  found: false,
  projectCount: 0,
  activeCount: 0,
  adminCount: 0,
  hasNoProjects: true,
  syncedAt: "",
  allRoles: [],
  allModules: [],
  projects: [],
  isAccountAdmin: false,
  addedOn: null,
};

describe("UserProfilePanel", () => {
  afterEach(() => fetchSpy.mockClear());

  it("shows a not-synced state for a found:false user and fires no live fetch", () => {
    render(
      <UserProfilePanel user={stub} email={stub.email} variant="rail" onClose={() => {}} />,
    );
    expect(screen.getByTestId("user-detail-panel")).toBeTruthy();
    expect(screen.getByText(/not.*synced/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a not-synced state when user is null", () => {
    render(<UserProfilePanel user={null} email="missing@example.com" variant="rail" />);
    expect(screen.getByText(/not.*synced/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/UserProfilePanel.test.tsx"`
Expected: FAIL — module `./UserProfilePanel` not found.

- [ ] **Step 3: Write the component**

```tsx
"use client";

/**
 * UserProfilePanel — the single, shared user-detail "tab".
 *
 * Renders the same rich ACC profile that /users shows (AccProfileFull), but fed
 * from an in-memory synced BulkAccUser via bulkUserToProfileData — so it opens
 * INSTANTLY with no getAccProfile round trip. The manual Refresh button is the
 * only path that fetches live from Autodesk.
 *
 * variant:
 *   - "dialog" — embedded inside the /users PersonDetailModal (modal owns chrome).
 *   - "rail"   — mounted in the access-analysis right rail; fixed w-96 (camera
 *                stability) with its own header + close button + scroll.
 */

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import {
  AccProfileFull,
  AccLoadingProgress,
  type AccProfileData,
} from "./AccProfileSection";
import { bulkUserToProfileData } from "./bulkUserToProfileData";

export interface UserProfilePanelProps {
  user: BulkAccUser | null;
  email: string;
  onClose?: () => void;
  variant?: "dialog" | "rail";
}

export function UserProfilePanel({
  user,
  email,
  onClose,
  variant = "dialog",
}: UserProfilePanelProps): React.JSX.Element {
  const utils = trpc.useUtils();
  const [override, setOverride] = useState<AccProfileData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const baseData: AccProfileData | null =
    user && user.found ? bulkUserToProfileData(user) : null;
  const data = override ?? baseData;

  function handleRefresh(): void {
    setRefreshing(true);
    utils.users.getAccProfile
      .fetch({ email, forceRefresh: true })
      .then((fresh) => {
        if (fresh && (fresh as AccProfileData).found) {
          setOverride(fresh as AccProfileData);
        }
      })
      .catch(() => {
        /* keep showing synced data on refresh failure */
      })
      .finally(() => setRefreshing(false));
  }

  const body =
    refreshing && !data ? (
      <AccLoadingProgress />
    ) : data ? (
      <AccProfileFull data={data} email={email} onRefresh={handleRefresh} />
    ) : (
      <div className="mt-6 pt-5 border-t-2 border-border/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
            Autodesk ACC
          </h3>
          <button
            type="button"
            onClick={handleRefresh}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
        <p className="text-sm text-muted-foreground">Not synced yet</p>
        <p className="mt-1 text-[11px] text-muted-foreground/60">
          This user has no synced ACC snapshot. Refresh to pull live, or wait for
          the next automatic sync.
        </p>
      </div>
    );

  if (variant === "dialog") {
    return <div data-testid="user-detail-panel">{body}</div>;
  }

  // rail: fixed width (w-96) so isolating a node never resizes the graph.
  return (
    <aside
      data-testid="user-detail-panel"
      className="flex h-full w-96 shrink-0 flex-col border-l border-border/30 bg-card"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/30 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold" title={user?.name || email}>
            {user?.name || email}
          </h2>
          <p className="truncate text-xs text-muted-foreground" title={email}>
            {email}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
          >
            Close
          </button>
        )}
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-6">{body}</div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/UserProfilePanel.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/UserProfilePanel.tsx" "app/(dashboard)/users/UserProfilePanel.test.tsx"
git commit -m "feat(acc-profile): shared instant UserProfilePanel (dialog | rail)"
```

---

### Task 4: Wire `/users` `PersonDetailModal` to `UserProfilePanel`

**Files:**
- Modify: `app/(dashboard)/users/UsersDirectoryClient.tsx` (import; `PersonDetailModal` ~509–614; mount ~2420)

- [ ] **Step 1: Add the import**

Near the other local imports at the top of `UsersDirectoryClient.tsx`, add:

```tsx
import { UserProfilePanel } from "./UserProfilePanel";
```

- [ ] **Step 2: Give `PersonDetailModal` an `accUser` prop**

Change the signature (line 509) from:

```tsx
function PersonDetailModal({
  person,
  open,
  onOpenChange,
}: {
  person: OrgPerson | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
```

to:

```tsx
function PersonDetailModal({
  person,
  accUser,
  open,
  onOpenChange,
}: {
  person: OrgPerson | null;
  accUser: BulkAccUser | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
```

- [ ] **Step 3: Swap the profile section for the shared panel**

Replace line 583 (`<AccProfileSection email={person.email} />`) with:

```tsx
<UserProfilePanel user={accUser} email={person.email} variant="dialog" />
```

- [ ] **Step 4: Pass the resolved user at the mount site**

Replace the `<PersonDetailModal ... />` block at line 2420 with:

```tsx
<PersonDetailModal
  person={selectedPerson}
  accUser={
    selectedPerson
      ? mergedAccUsers.find(
          (u) => u.email.toLowerCase() === selectedPerson.email.toLowerCase(),
        ) ?? null
      : null
  }
  open={!!selectedPerson}
  onOpenChange={(v) => {
    if (!v) setSelectedPerson(null);
  }}
/>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`AccProfileSection` is now unused in this file; if tsc/eslint flags the unused import, remove the `AccProfileSection` import line — keep the `AccProfileSection.tsx` module, it still exports `AccProfileFull`.)

- [ ] **Step 6: Run the directory route test**

Run: `npx vitest run "app/(dashboard)/users/page.test.tsx"`
Expected: PASS (mocks `UsersDirectoryClient`, so it stays green).

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/UsersDirectoryClient.tsx"
git commit -m "feat(users): directory click opens instant UserProfilePanel from bulk data"
```

---

### Task 5: Wire the access-analysis graph (`RightPanelStack` + `AccessAnalysisShell`)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/RightPanelStack.tsx`
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`

- [ ] **Step 1: `RightPanelStack` — accept `usersByEmail` and render `UserProfilePanel`**

In `RightPanelStack.tsx`, replace the `UserDetailPanel` import (line 20) with:

```tsx
import { UserProfilePanel } from "../UserProfilePanel";
import type { BulkAccUser } from "@/lib/acc/acc-types";
```

Extend the props interface (line 24) to:

```tsx
export interface RightPanelStackProps {
  features: ReadonlyArray<NodeFeatureSnapshot>;
  visibleSelectedIndices: ReadonlySet<number> | null;
  usersByEmail: ReadonlyMap<string, BulkAccUser>;
}
```

Update the destructure (line 47) to include `usersByEmail`:

```tsx
export function RightPanelStack({
  features,
  visibleSelectedIndices,
  usersByEmail,
}: RightPanelStackProps): React.JSX.Element {
```

Replace the `user-detail` branch (lines 65–72) with:

```tsx
{top === "user-detail" ? (
  <motion.div key="user-detail" {...slide}>
    {(() => {
      const email = features[isolatedNodeIndex!]?.emailLower ?? "";
      return (
        <UserProfilePanel
          user={usersByEmail.get(email) ?? null}
          email={email}
          onClose={() => setIsolated(null)}
          variant="rail"
        />
      );
    })()}
  </motion.div>
) : top === "lasso-pie" ? (
```

- [ ] **Step 2: `AccessAnalysisShell` — load enrichment, build the map, thread it through**

In `AccessAnalysisShell.tsx`, add imports near the existing ones (after line 52):

```tsx
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { mergeAccSummaryWithEnrichment } from "../useMergedAccUsers";
```

In `AccessAnalysisShell()` (after line 229, `const users = bulkUsersQuery.data;`), add:

```tsx
  const enrichedQuery = trpc.accMembers.enrichedUsers.useQuery(undefined, {
    staleTime: 600_000,
    retry: false,
  });
  // Build an email → synced-snapshot map once, from data already loaded for the
  // graph (accDcGraph.bulkUsers) + enrichment (company/status parity with /users).
  // Zero extra network on node click; the panel reads from this in-memory map.
  const usersByEmail = useMemo<Map<string, BulkAccUser>>(() => {
    const base = (users ?? []) as BulkAccUser[];
    const merged = mergeAccSummaryWithEnrichment(base, enrichedQuery.data ?? []);
    const map = new Map<string, BulkAccUser>();
    for (const u of merged) map.set(u.email.toLowerCase(), u);
    return map;
  }, [users, enrichedQuery.data]);
```

Add `usersByEmail` to `ShellBodyProps` (after line 82, `graphRef: ...`):

```tsx
  usersByEmail: ReadonlyMap<string, BulkAccUser>;
```

Destructure it in `ShellBody` (add to the param list around line 85–93):

```tsx
  usersByEmail,
```

Pass it to `RightPanelStack` (replace lines 211–214):

```tsx
        <RightPanelStack
          features={features}
          visibleSelectedIndices={visibleSubset}
          usersByEmail={usersByEmail}
        />
```

Pass it from the shell into `ShellBody` (in the `return (<SliderProvider...>` block, add to the `<ShellBody ... />` props around line 375):

```tsx
            usersByEmail={usersByEmail}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`UserDetailPanel` import is now removed from `RightPanelStack`; the `UserDetailPanel.tsx` file is left in place as legacy — do not delete in this plan.)

- [ ] **Step 4: Run access-analysis unit tests**

Run: `npx vitest run "app/(dashboard)/users/access-analysis"`
Expected: PASS. If a `RightPanelStack`/`GraphInteractions` unit test constructs `RightPanelStack` without `usersByEmail`, pass `usersByEmail={new Map()}` in that test so it compiles; the panel then shows the not-synced state, which is acceptable for those tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/RightPanelStack.tsx" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git commit -m "feat(access-analysis): graph node click opens shared UserProfilePanel"
```

---

### Task 6: e2e parity + verification

**Files:**
- Modify: `tests/e2e/acc-dc-graph.spec.ts` (the test at line 412)

- [ ] **Step 1: Extend the isolate test to assert profile content**

In the test `"click isolates a node (user-detail panel) and Escape clears it"`, after the existing assertions (around line 431, after `await expect(page.getByTestId("user-detail-panel")).toBeVisible();`), add:

```ts
    // Parity: the rail now shows the same rich ACC profile as /users (or the
    // graceful "not synced" state for a DC-only node). Either way the ACC
    // section header renders inside the detail panel.
    const panel = page.getByTestId("user-detail-panel");
    await expect(panel.getByText(/Autodesk ACC/i)).toBeVisible({ timeout: 4_000 });
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e`
Expected: the isolate test PASSES; the rail keeps `data-top-layer="user-detail"` and `data-testid="user-detail-panel"`; width stays `w-96` so camera-stability tests stay green. (Per memory, the lasso-drag test can flake under machine load — re-run on an idle machine; it is not a regression.)

- [ ] **Step 3: Full unit suite**

Run: `npx vitest run`
Expected: PASS (existing total + the new mapper/panel tests).

- [ ] **Step 4: Verify "last data" coverage (diagnostic, no code)**

Confirm the synced snapshot covers the user base so every user shows latest data:

Run: `node -e "const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();(async()=>{const u=await db.user.count();const c=await db.accMemberCache.count();console.log('users',u,'cacheRows',c);await db.$disconnect();})()"`
Expected: `cacheRows` is close to `users` (and covers the ACC population). If a large share of users have no cache row, record it as a **sync/backfill follow-up** (out of scope here — UI shows the "not synced yet" state for them).

- [ ] **Step 5: Manual UAT (record result)**

  1. `npm run build` then restart the local app (per the deploy mechanism: rebuild + restart on :3000).
  2. `/users` → click a user → panel opens **instantly**, no "Connecting to Autodesk…" bar; projects/roles/modules + Activity/Folder panels present; "Last synced …" shows.
  3. `/users/access-analysis` → click a graph node → the **same** profile panel opens in the right rail (or "not synced yet" for a DC-only node); graph does not reframe.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/acc-dc-graph.spec.ts
git commit -m "test(access-analysis): assert graph node-click shows ACC profile parity"
```

---

## Self-review

**Spec coverage:**
- "Latest data for every user" → Tasks 2–5 render from `bulkAccSummary`/DC bulk (covers whole base); Task 6 Step 4 verifies coverage. ✓
- "Instant open" → Task 2 (mapper) + Task 3 (no query on open, Refresh-only live) + Task 3 test asserts no `getAccProfile` fetch. ✓
- "Graph parity" → Task 5 swaps `UserDetailPanel` → `UserProfilePanel` keyed by node email; Task 6 e2e asserts it. ✓
- Decisions honored: tab = AccProfileFull content; instant-from-sync; in-memory bulk source; access-analysis graph target; identical content fit to `w-96` rail (Task 3 rail variant). ✓
- Invariants: `w-96`, `data-top-layer="user-detail"`, `data-testid="user-detail-panel"` preserved (Task 3 + Task 5). ✓

**Placeholder scan:** No TBD/TODO; every code step has full code; commands have expected output. ✓

**Type consistency:** `bulkUserToProfileData` returns `AccProfileData` (Task 2) consumed by `AccProfileFull` (exported Task 1) inside `UserProfilePanel` (Task 3). `usersByEmail: ReadonlyMap<string, BulkAccUser>` is defined identically in `RightPanelStack` props and built in `AccessAnalysisShell` (Task 5). `UserProfilePanelProps` (`user`, `email`, `onClose?`, `variant?`) used consistently in Tasks 3/4/5. ✓
