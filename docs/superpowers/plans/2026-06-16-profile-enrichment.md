# User Profile Enrichment + All-Time Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show cost center + Gmail/Workspace avatar in the shared user-profile sidebar, and make its activity section all-time instead of last-30-days.

**Architecture:** The Google directory already supplies `photoUrl` + `costCenter` per person; they're dropped in `mergePeopleWithAccSummary`. We add two optional fields to `BulkAccUser`, stop dropping them, thread them to `AccProfileData`, and render them (avatar via the existing radix `Avatar`, cost center as a text item). Separately, the activity resolver drops its 30-day filter on counts/top-actions (all-time `totalCount` already exists; recent events are already latest-N).

**Tech Stack:** Next.js App Router, React client components, tRPC, Vitest + @testing-library/react (jsdom), radix `Avatar`, Prisma (local Postgres 18).

---

## File structure

- **Modify** `lib/acc/acc-types.ts` — add `photoUrl?` + `costCenter?` to `BulkAccUser`.
- **Modify** `app/(dashboard)/users/useMergedAccUsers.ts` — carry the two fields through `mergePeopleWithAccSummary` + `createAccUserStub`.
- **Modify** `app/(dashboard)/users/useMergedAccUsers.test.ts` — extend.
- **Modify** `app/(dashboard)/users/bulkUserToProfileData.ts` — map the two fields into `AccProfileData`.
- **Modify** `app/(dashboard)/users/bulkUserToProfileData.test.ts` — extend.
- **Modify** `app/(dashboard)/users/AccProfileSection.tsx` — `AccProfileData` type gets the two fields; render cost center; activity panel goes all-time.
- **Create** `app/(dashboard)/users/getInitials.ts` (+ `getInitials.test.ts`) — pure initials helper.
- **Create** `app/(dashboard)/users/ProfileAvatar.tsx` (+ `ProfileAvatar.test.tsx`) — avatar with photo + initials fallback.
- **Modify** `app/(dashboard)/users/UserProfilePanel.tsx` — render `ProfileAvatar` in the rail header.
- **Modify** `app/(dashboard)/users/UserProfilePanel.test.tsx` — extend (avatar + cost center + all-time).
- **Modify** `server/routers/users/acc-profile.ts` — `getAccUserActivity` drops the 30-day filter.

---

## Task 1: Carry photoUrl + costCenter through the merge

**Files:**
- Modify: `lib/acc/acc-types.ts` (BulkAccUser interface, after `lastSignIn?` ~line 65)
- Modify: `app/(dashboard)/users/useMergedAccUsers.ts`
- Test: `app/(dashboard)/users/useMergedAccUsers.test.ts`

- [ ] **Step 1: Add the two optional fields to `BulkAccUser`**

In `lib/acc/acc-types.ts`, inside `interface BulkAccUser`, immediately after the `lastSignIn?: string | null;` line, add:

```ts
  /** Google Workspace profile photo URL (People API). Undefined when the user is not a directory member. */
  photoUrl?: string | null;
  /** Google Workspace cost center (People API org/userDefined/clientData). Undefined when not a directory member. */
  costCenter?: string | null;
```

- [ ] **Step 2: Write the failing test**

In `app/(dashboard)/users/useMergedAccUsers.test.ts`, add (keep existing imports; add `mergePeopleWithAccSummary` / types to the existing import from `./useMergedAccUsers` if not already imported):

```ts
import { describe, it, expect } from "vitest";
import {
  mergePeopleWithAccSummary,
  type OrgPerson,
} from "./useMergedAccUsers";
import type { BulkAccUser } from "@/lib/acc/acc-types";

function person(over: Partial<OrgPerson>): OrgPerson {
  return {
    resourceName: "people/1",
    displayName: "Ada Lovelace",
    email: "ada@hermosillo.com",
    photoUrl: "https://lh3.googleusercontent.com/a/ada",
    department: null,
    jobTitle: null,
    phoneNumber: null,
    costCenter: "ENG-100",
    ...over,
  };
}

function accUser(email: string): BulkAccUser {
  return {
    email,
    name: "Ada (ACC)",
    found: true,
    projectCount: 1,
    activeCount: 1,
    adminCount: 0,
    hasNoProjects: false,
    syncedAt: "2026-06-16T00:00:00.000Z",
    allRoles: [],
    allModules: [],
    projects: [],
    isAccountAdmin: false,
    addedOn: null,
  };
}

describe("mergePeopleWithAccSummary — directory enrichment", () => {
  it("attaches photoUrl + costCenter onto a matched ACC user", () => {
    const out = mergePeopleWithAccSummary(
      [person({ email: "ada@hermosillo.com" })],
      [accUser("ada@hermosillo.com")],
    );
    const row = out.find((u) => u.email === "ada@hermosillo.com")!;
    expect(row.found).toBe(true); // kept the ACC record
    expect(row.photoUrl).toBe("https://lh3.googleusercontent.com/a/ada");
    expect(row.costCenter).toBe("ENG-100");
  });

  it("sets photoUrl + costCenter on a directory-only stub user", () => {
    const out = mergePeopleWithAccSummary(
      [person({ email: "new@hermosillo.com", photoUrl: "p", costCenter: "CC-9" })],
      [],
    );
    const row = out.find((u) => u.email === "new@hermosillo.com")!;
    expect(row.found).toBe(false); // stub
    expect(row.photoUrl).toBe("p");
    expect(row.costCenter).toBe("CC-9");
  });

  it("leaves photoUrl/costCenter undefined for an ACC user with no directory match", () => {
    const out = mergePeopleWithAccSummary([], [accUser("ghost@x.com")]);
    const row = out.find((u) => u.email === "ghost@x.com")!;
    expect(row.photoUrl).toBeUndefined();
    expect(row.costCenter).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/useMergedAccUsers.test.ts"`
Expected: FAIL — matched user's `photoUrl`/`costCenter` are `undefined` (merge currently drops them).

- [ ] **Step 4: Implement — stop dropping the fields**

In `app/(dashboard)/users/useMergedAccUsers.ts`:

In `createAccUserStub`, add the two fields to the returned object (after `addedOn: null,`):

```ts
    addedOn: null,
    photoUrl: person.photoUrl,
    costCenter: person.costCenter,
```

In `mergePeopleWithAccSummary`, replace the `directoryRows` mapping so a matched ACC user is enriched with the person's fields:

```ts
  const peopleByEmail = new Map(people.map((p) => [p.email.toLowerCase(), p]));
  const directoryRows = people.map((person) => {
    const email = person.email.toLowerCase();
    seen.add(email);
    const acc = byEmail.get(email);
    if (!acc) return createAccUserStub(person);
    return { ...acc, photoUrl: person.photoUrl, costCenter: person.costCenter };
  });
```

(The existing `byEmail` map of accSummary is already built above; `peopleByEmail` is unused here — remove it if you prefer, it is only illustrative. The key change is the `acc ? {...acc, photoUrl, costCenter} : stub` branch.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/useMergedAccUsers.test.ts"`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 6: Commit**

```bash
git add lib/acc/acc-types.ts "app/(dashboard)/users/useMergedAccUsers.ts" "app/(dashboard)/users/useMergedAccUsers.test.ts"
git commit -m "feat(profile): carry photoUrl + costCenter through the directory merge"
```

---

## Task 2: Map the fields into AccProfileData

**Files:**
- Modify: `app/(dashboard)/users/AccProfileSection.tsx` (the `AccProfileData` type, ~line 361)
- Modify: `app/(dashboard)/users/bulkUserToProfileData.ts`
- Test: `app/(dashboard)/users/bulkUserToProfileData.test.ts`

- [ ] **Step 1: Add the fields to the `AccProfileData` type**

In `app/(dashboard)/users/AccProfileSection.tsx`, in `export type AccProfileData = { ... }`, add after `lastSignIn?: string;`:

```ts
  photoUrl?: string | null;
  costCenter?: string | null;
```

- [ ] **Step 2: Write the failing test**

In `app/(dashboard)/users/bulkUserToProfileData.test.ts`, add a test (reuse the file's existing `BulkAccUser` factory if present; otherwise inline a minimal found user):

```ts
it("maps photoUrl and costCenter into the profile data", () => {
  const user = {
    email: "ada@hermosillo.com",
    name: "Ada",
    found: true,
    projectCount: 0,
    activeCount: 0,
    adminCount: 0,
    hasNoProjects: true,
    syncedAt: "2026-06-16T00:00:00.000Z",
    allRoles: [],
    allModules: [],
    projects: [],
    isAccountAdmin: false,
    addedOn: null,
    photoUrl: "https://lh3.googleusercontent.com/a/ada",
    costCenter: "ENG-100",
  } as const;

  const data = bulkUserToProfileData(user as never);
  expect(data.photoUrl).toBe("https://lh3.googleusercontent.com/a/ada");
  expect(data.costCenter).toBe("ENG-100");
});
```

(If the test file already imports `bulkUserToProfileData`, reuse that import; do not add a duplicate.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/bulkUserToProfileData.test.ts"`
Expected: FAIL — `data.photoUrl` / `data.costCenter` are `undefined`.

- [ ] **Step 4: Implement the mapping**

In `app/(dashboard)/users/bulkUserToProfileData.ts`, add to the returned object (after `company: user.companyName ?? undefined,`):

```ts
    photoUrl: user.photoUrl ?? undefined,
    costCenter: user.costCenter ?? undefined,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/bulkUserToProfileData.test.ts"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/AccProfileSection.tsx" "app/(dashboard)/users/bulkUserToProfileData.ts" "app/(dashboard)/users/bulkUserToProfileData.test.ts"
git commit -m "feat(profile): map photoUrl + costCenter into AccProfileData"
```

---

## Task 3: getInitials helper + ProfileAvatar component

**Files:**
- Create: `app/(dashboard)/users/getInitials.ts`
- Test: `app/(dashboard)/users/getInitials.test.ts`
- Create: `app/(dashboard)/users/ProfileAvatar.tsx`
- Test: `app/(dashboard)/users/ProfileAvatar.test.tsx`

- [ ] **Step 1: Write the failing test for `getInitials`**

Create `app/(dashboard)/users/getInitials.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getInitials } from "./getInitials";

describe("getInitials", () => {
  it("uses first + last of a full name", () => {
    expect(getInitials("Ada Lovelace", "x@y.com")).toBe("AL");
  });
  it("uses first two letters of a single name", () => {
    expect(getInitials("Ghost", "x@y.com")).toBe("GH");
  });
  it("derives from the email local-part when name is missing", () => {
    expect(getInitials(null, "john.doe@hermosillo.com")).toBe("JD");
  });
  it("returns a placeholder when nothing is usable", () => {
    expect(getInitials("", "")).toBe("?");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/getInitials.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `getInitials`**

Create `app/(dashboard)/users/getInitials.ts`:

```ts
/** Two-letter initials from a display name, falling back to the email local-part. */
export function getInitials(name?: string | null, email?: string): string {
  const source = (name && name.trim()) || (email ?? "").replace(/@.*/, "");
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/getInitials.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing test for `ProfileAvatar`**

Create `app/(dashboard)/users/ProfileAvatar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ProfileAvatar } from "./ProfileAvatar";

describe("ProfileAvatar", () => {
  // Note: radix Avatar does not "load" images in jsdom, so the fallback initials
  // always render here. The real <img> is verified visually at rebuild time.
  it("renders initials fallback from the name", () => {
    render(<ProfileAvatar name="Ada Lovelace" email="ada@x.com" photoUrl={null} />);
    expect(screen.getByText("AL")).toBeTruthy();
  });

  it("falls back to email-derived initials when no name", () => {
    render(<ProfileAvatar name={null} email="john.doe@x.com" photoUrl={null} />);
    expect(screen.getByText("JD")).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/ProfileAvatar.test.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `ProfileAvatar`**

Create `app/(dashboard)/users/ProfileAvatar.tsx`:

```tsx
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "./getInitials";

export function ProfileAvatar({
  name,
  email,
  photoUrl,
  size = "lg",
}: {
  name?: string | null;
  email: string;
  photoUrl?: string | null;
  size?: "sm" | "default" | "lg";
}): React.JSX.Element {
  return (
    <Avatar size={size} className="shrink-0 border border-border/40">
      {photoUrl ? (
        <AvatarImage src={photoUrl} alt={name || email} referrerPolicy="no-referrer" />
      ) : null}
      <AvatarFallback className="text-xs font-semibold uppercase">
        {getInitials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/ProfileAvatar.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add "app/(dashboard)/users/getInitials.ts" "app/(dashboard)/users/getInitials.test.ts" "app/(dashboard)/users/ProfileAvatar.tsx" "app/(dashboard)/users/ProfileAvatar.test.tsx"
git commit -m "feat(profile): ProfileAvatar with photo + initials fallback"
```

---

## Task 4: Render avatar (rail header) + cost center (AccProfileFull)

**Files:**
- Modify: `app/(dashboard)/users/UserProfilePanel.tsx` (rail header ~lines 102–120)
- Modify: `app/(dashboard)/users/AccProfileSection.tsx` (identity row ~lines 501–531)
- Test: `app/(dashboard)/users/UserProfilePanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `app/(dashboard)/users/UserProfilePanel.test.tsx` with (extends the existing mock so a `found:true` user can render its sub-panels; keeps the original two tests):

```tsx
// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BulkAccUser } from "@/lib/acc/acc-types";

const fetchSpy = vi.fn(async () => ({ found: false, syncedAt: "" }));
const activityData = { totalCount: 5, topActions: [], recentEvents: [] };
vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    useUtils: () => ({ users: { getAccProfile: { fetch: fetchSpy } } }),
    users: {
      getAccUserActivity: { useQuery: () => ({ data: activityData, isLoading: false }) },
      getAccUserFolderAccess: { useQuery: () => ({ data: undefined, isLoading: false }) },
    },
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

const found: BulkAccUser = {
  ...stub,
  email: "ada@hermosillo.com",
  name: "Ada Lovelace",
  found: true,
  syncedAt: "2026-06-16T00:00:00.000Z",
  photoUrl: null,
  costCenter: "ENG-100",
};

describe("UserProfilePanel", () => {
  afterEach(() => fetchSpy.mockClear());

  it("shows a not-synced state for a found:false user and fires no live fetch", () => {
    render(<UserProfilePanel user={stub} email={stub.email} variant="rail" onClose={() => {}} />);
    expect(screen.getByTestId("user-detail-panel")).toBeTruthy();
    expect(screen.getByText(/not.*synced/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a not-synced state when user is null", () => {
    render(<UserProfilePanel user={null} email="missing@example.com" variant="rail" />);
    expect(screen.getByText(/not.*synced/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders an avatar (initials fallback) in the rail header", () => {
    render(<UserProfilePanel user={stub} email={stub.email} variant="rail" />);
    expect(screen.getByText("GH")).toBeTruthy(); // Ghost → GH
  });

  it("shows the cost center for a synced directory member", () => {
    render(<UserProfilePanel user={found} email={found.email} variant="rail" />);
    expect(screen.getByText(/cost center/i)).toBeTruthy();
    expect(screen.getByText("ENG-100")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify the two new ones fail**

Run: `npx vitest run "app/(dashboard)/users/UserProfilePanel.test.tsx"`
Expected: the "avatar" and "cost center" tests FAIL (no `GH`, no cost-center text yet); the original two PASS.

- [ ] **Step 3: Render `ProfileAvatar` in the rail header**

In `app/(dashboard)/users/UserProfilePanel.tsx`, add the import near the top:

```ts
import { ProfileAvatar } from "./ProfileAvatar";
```

Replace the rail `<header>`'s left block so the avatar sits left of the name:

```tsx
      <header className="flex items-center justify-between gap-2 border-b border-border/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProfileAvatar name={user?.name} email={email} photoUrl={user?.photoUrl} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold" title={user?.name || email}>
              {user?.name || email}
            </h2>
            <p className="truncate text-xs text-muted-foreground" title={email}>
              {email}
            </p>
          </div>
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
```

- [ ] **Step 4: Render the cost center in `AccProfileFull`**

In `app/(dashboard)/users/AccProfileSection.tsx`, widen the identity-row guard and add the cost-center item. Change the guard line:

```tsx
      {(data.company || data.addedOn || data.lastSignIn || data.costCenter) && (
```

Then, inside that row, immediately after the `{data.company && ( … )}` block, add:

```tsx
          {data.costCenter && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground/60 font-medium">Cost center:</span>
              <span className="text-foreground font-semibold">{data.costCenter}</span>
            </div>
          )}
```

- [ ] **Step 5: Run the tests to verify all pass**

Run: `npx vitest run "app/(dashboard)/users/UserProfilePanel.test.tsx"`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/UserProfilePanel.tsx" "app/(dashboard)/users/AccProfileSection.tsx" "app/(dashboard)/users/UserProfilePanel.test.tsx"
git commit -m "feat(profile): avatar in rail header + cost center line"
```

---

## Task 5: All-time activity

**Files:**
- Modify: `server/routers/users/acc-profile.ts` (`getAccUserActivity`, ~lines 197–243)
- Modify: `app/(dashboard)/users/AccProfileSection.tsx` (`AccUserActivityPanel`, ~lines 717–802)
- Test: `app/(dashboard)/users/UserProfilePanel.test.tsx` (extend)

- [ ] **Step 1: Write the failing test (panel shows all-time)**

In `app/(dashboard)/users/UserProfilePanel.test.tsx`, add inside the `describe`:

```tsx
  it("labels the activity summary as all-time, not last-30-days", () => {
    render(<UserProfilePanel user={found} email={found.email} variant="rail" />);
    expect(screen.getByText(/5 events all-time/i)).toBeTruthy();
    expect(screen.queryByText(/last 30 days/i)).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/UserProfilePanel.test.tsx"`
Expected: FAIL — subtitle currently reads "… in last 30 days" using `last30dCount`.

- [ ] **Step 3: Update the panel to use all-time**

In `app/(dashboard)/users/AccProfileSection.tsx`, in `AccUserActivityPanel`, change the subtitle to use `totalCount`:

```ts
  const subtitle = data
    ? `${data.totalCount.toLocaleString()} events all-time`
    : isLoading
    ? "loading…"
    : "no data";
```

And change the top-actions label (drop the "(last 30 days)" qualifier):

```tsx
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-bold mb-2">
                Top actions
              </p>
```

- [ ] **Step 4: Make top-actions all-time in the resolver**

In `server/routers/users/acc-profile.ts`, in `getAccUserActivity`, remove the 30-day window. Replace the `since30d` line + the `Promise.all` destructure + array, and the returned object, with:

```ts
      // All-time: no date window. totalCount + top actions span the user's full history;
      // recent events are the latest 20 regardless of age.
      const [totalCount, topActionsRaw, recentRows, projects] = await Promise.all([
        countUnifiedActivityRows(ctx.db, { userEmail: email }),
        groupUnifiedActivityByRawAction(ctx.db, {
          where: { userEmail: email },
          take: 5,
        }),
        listUnifiedActivityRows(ctx.db, {
          where: { userEmail: email },
          take: 20,
        }),
        ctx.db.accProject.findMany({ select: { id: true, name: true } }),
      ]);
```

And remove `last30dCount,` from the returned object (delete the `since30d` declaration and the first `countUnifiedActivityRows` call; the return keeps `totalCount`, `topActions`, `recentEvents`). Update the resolver's leading comment to say "Returns all-time count, top 5 actions, and 20 most-recent events."

- [ ] **Step 5: Run the panel test + the full users suite**

Run: `npx vitest run "app/(dashboard)/users/UserProfilePanel.test.tsx"`
Expected: PASS (5 tests).

Run: `npx tsc --noEmit`
Expected: exit 0 (no `last30dCount` consumers remain; the resolver return type changed cleanly).

- [ ] **Step 6: Commit**

```bash
git add "server/routers/users/acc-profile.ts" "app/(dashboard)/users/AccProfileSection.tsx" "app/(dashboard)/users/UserProfilePanel.test.tsx"
git commit -m "feat(profile): all-time activity (drop 30-day window)"
```

---

## Final verification

- [ ] **Run the full unit suite + typecheck**

Run: `npx vitest run "app/(dashboard)/users"` then `npx tsc --noEmit`
Expected: all green, tsc exit 0.

- [ ] **Visual check (owner, at rebuild)** — open a synced @hermosillo.com user in the access-analysis right sidebar: avatar photo shows (initials for external/@gmail), a "Cost center" line appears, and the Activity panel reads "N events all-time" with no "last 30 days" anywhere. Rebuild per the project's safe-rebuild recipe (NEXT_DIST_DIR side-dist swap; do not `npm run build` under the running :3000).

---

## Self-review notes

- **Spec coverage:** cost center (Tasks 1,2,4), avatar (Tasks 1,2,3,4), all-time activity (Task 5), coverage caveat (initials fallback — Tasks 3,4), no new fetch (reuses merged data — Task 1), YAGNI/no dept-title-phone (not added). All spec sections mapped.
- **Type consistency:** `photoUrl?: string | null` / `costCenter?: string | null` identical across `BulkAccUser` (Task 1), `AccProfileData` (Task 2), `ProfileAvatar` props (Task 3), and the merge/mapping. `getInitials(name?, email?)` signature identical in helper + ProfileAvatar + tests. `totalCount` is the field used by both resolver return and panel subtitle (Task 5).
- **jsdom caveat** noted where it matters (radix avatar image): tests assert initials, not the `<img>`; real photo verified visually.
