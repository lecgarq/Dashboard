# Access Analysis Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the two sidebar entries (`/users` directory + `/users/dashboard` widget board) into one Access Analysis tab at `/users` with a 4-number KPI strip, a stacked-area hero chart of access events over time, four narrative drill-down cards, and the existing directory table preserved as a collapsible accordion.

**Architecture:** New page-level orchestrator (`AccessAnalysisPage`) renders KPI strip + hero chart + four `ChangeStreamCard`s + a collapsed `UsersDirectoryClient` accordion. Server-side tRPC procedures on the existing `accActivity` and `accMembers` routers aggregate `AccActivity` rows into time-binned series, KPI summaries, and ranked headline events. Ships behind feature flag `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS`; flag flips after the 2-year DC backfill provides admin-event volume.

**Tech Stack:** Next.js 16 App Router, tRPC, Prisma (Supabase Postgres), `@nivo/stream` (stacked area), `@nivo/sparkline` (sparklines), Vitest, Tailwind, shadcn/ui (Accordion, Card).

**Spec:** `docs/superpowers/specs/2026-05-13-access-analysis-redesign-design.md`

---

## File Structure

**New files (created):**

- `lib/acc/accessAnalysisTypes.ts` — shared types: `TimeWindow`, `ChangeStream`, `ChangeStreamId`, `TimelinePoint`, `KpiSummary`, `HeadlineEvent`
- `lib/acc/headlineEventPicker.ts` — pure ranking utility (impact score × recency weight)
- `lib/acc/headlineEventPicker.test.ts` — Vitest
- `lib/acc/timelineBucketing.ts` — pure utility: bins `Date`s into day/week/month buckets given a window
- `lib/acc/timelineBucketing.test.ts` — Vitest
- `app/(dashboard)/users/access-analysis/AccessAnalysisPage.tsx` — page-level orchestrator (client component)
- `app/(dashboard)/users/access-analysis/TimeWindowSelector.tsx` — segmented control [30d|90d|1y|All]
- `app/(dashboard)/users/access-analysis/KpiStrip.tsx` — 4-card strip
- `app/(dashboard)/users/access-analysis/KpiCard.tsx` — single card with big number + delta
- `app/(dashboard)/users/access-analysis/AccessEventsChart.tsx` — Nivo stacked-area hero
- `app/(dashboard)/users/access-analysis/ChangeStreamCard.tsx` — drill-down card body
- `app/(dashboard)/users/access-analysis/DirectoryAccordion.tsx` — collapsible wrapper around UsersDirectoryClient
- `app/(dashboard)/users/access-analysis/AccessAnalysisContext.tsx` — shared filter state (selected window, focused stream, focused day) used by every component on the page

**Files modified:**

- `server/routers/acc-activity.ts` — add `getTimeline`, `getHeadlineEvent` procedures
- `server/routers/acc-members.ts` — add `getKpiSummary` procedure
- `app/(dashboard)/users/page.tsx` — gate-render `AccessAnalysisPage` behind feature flag; fall through to existing `UsersDirectoryClient` when flag off
- `app/(dashboard)/users/dashboard/page.tsx` — replace with 308 redirect to `/users`
- `components/layout/navigation.ts` — remove `/users/dashboard` entry; rename `/users` label to `"Access Analysis"`
- `.env.example` — add `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1`

**Files deleted (Phase 7, only after Phase 1-6 verified working):**

- `app/(dashboard)/users/dashboard/DashboardClient.tsx`
- `app/(dashboard)/users/dashboard/widgetRegistry.ts`
- `app/(dashboard)/users/dashboard/useWidgetOrder.ts`
- `app/(dashboard)/users/dashboard/SortableWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/CoverageDonutWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/ActiveUserTiersWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/KpiStripWidget.tsx` (note: the old one — new one is `app/(dashboard)/users/access-analysis/KpiStrip.tsx`)
- `app/(dashboard)/users/dashboard/widgets/RecommendationsWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/RolesModulesHeatmapWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/OutlierCombosWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/RoleRelationshipFlowWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/FolderPermissionsWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/RecentlyAddedWidget.tsx` (logic absorbed into membership-churn `ChangeStreamCard`)
- `app/(dashboard)/users/dashboard/widgets/AdminAccessWidget.tsx` (logic absorbed into admin-grants `ChangeStreamCard`)

**Files KEPT after migration (do not delete):**

- `app/(dashboard)/users/UsersDirectoryClient.tsx` — reused inside `DirectoryAccordion`
- `app/(dashboard)/users/AccUsersGraph.tsx` — unrelated (Phase 6/7 graph work)
- `app/(dashboard)/users/AccProfileSection.tsx` — unrelated
- `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` — preserved; opens from directory row clicks
- `app/(dashboard)/users/dashboard/findingsContext.tsx` and `selectionContext.tsx` — audit during Phase 7 (kept if `DashboardSidePanel` still depends on them)

---

## Phase 1 — Foundation: types, feature flag, route shell

### Task 1.1: Shared types

**Files:**
- Create: `lib/acc/accessAnalysisTypes.ts`

- [ ] **Step 1: Write the file**

```typescript
// lib/acc/accessAnalysisTypes.ts

export const TIME_WINDOWS = ["30d", "90d", "1y", "all"] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];

export const CHANGE_STREAMS = [
  "membership",   // user.added | user.removed | user.activated | user.deactivated
  "permission",   // role.* | permission.* (non-admin)
  "project",      // project.member.added | project.member.removed
  "admin",        // role change → projectAdmin | accountAdmin
] as const;
export type ChangeStreamId = (typeof CHANGE_STREAMS)[number];

export interface ChangeStreamMeta {
  id: ChangeStreamId;
  label: string;
  color: string; // hsl(...) — must match Tailwind CSS variable equivalents
  description: string;
}

export const CHANGE_STREAM_META: Record<ChangeStreamId, ChangeStreamMeta> = {
  membership: {
    id: "membership",
    label: "Membership churn",
    color: "hsl(210 80% 55%)",
    description: "Users joined, left, activated, or deactivated.",
  },
  permission: {
    id: "permission",
    label: "Permission drift",
    color: "hsl(270 60% 55%)",
    description: "Role or permission tier changes.",
  },
  project: {
    id: "project",
    label: "Project access",
    color: "hsl(180 65% 45%)",
    description: "Users added to or removed from projects.",
  },
  admin: {
    id: "admin",
    label: "Admin grants",
    color: "hsl(35 90% 55%)",
    description: "projectAdmin or accountAdmin role assignments.",
  },
};

export type TimelineBin = "day" | "week" | "month";

export interface TimelinePoint {
  /** ISO date string for the bin's start (UTC). */
  bucket: string;
  /** Counts per stream. Missing streams default to 0. */
  membership: number;
  permission: number;
  project: number;
  admin: number;
}

export interface KpiSummary {
  members: { value: number; delta: number };
  accessChanges: { value: number; delta: number };
  activeAdmins: { value: number; delta: number };
  staleMembers: { value: number; delta: number };
  /** ISO string — earliest AccActivity row in the data, used for the chart's empty-window line. */
  dataEarliestEvent: string | null;
}

export interface HeadlineEvent {
  stream: ChangeStreamId;
  /** Display text (already includes who/what/when). */
  headline: string;
  /** ISO date string. */
  occurredAt: string;
  /** Subject user — autodeskId. */
  subjectAutodeskId: string | null;
  subjectEmail: string | null;
  /** Optional context: projectId or new role. */
  projectId: string | null;
  newRole: string | null;
  impactScore: number;
}
```

- [ ] **Step 2: Verify file compiles (no test yet — pure types)**

Run: `cd C:\LECG\Dashboard && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/acc/accessAnalysisTypes.ts
git commit -m "feat(access-analysis): add shared types"
```

---

### Task 1.2: Feature flag + env example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append flag to `.env.example`**

Add this line at the end of `.env.example`:

```
# Phase: Access Analysis Redesign (2026-05-13). Set to "1" to render the new
# unified Access Analysis tab at /users. Falls through to legacy UsersDirectoryClient
# when unset.
NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=
```

- [ ] **Step 2: Also append to local `.env`** (so dev sees the new tab immediately when flipped)

Add this line at the end of `.env`:

```
NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=
```

Leave it empty. Phase 8 flips it to `1`.

- [ ] **Step 3: Commit**

```bash
git add .env.example .env
git commit -m "feat(access-analysis): add NEXT_PUBLIC_NEW_ACCESS_ANALYSIS feature flag"
```

---

### Task 1.3: `/users/dashboard` → `/users` redirect

**Files:**
- Modify: `app/(dashboard)/users/dashboard/page.tsx`

- [ ] **Step 1: Read the current page**

Run: `cd C:\LECG\Dashboard && cat app/\(dashboard\)/users/dashboard/page.tsx`
Note the existing exports so the new file replaces them cleanly.

- [ ] **Step 2: Replace `app/(dashboard)/users/dashboard/page.tsx` content**

Replace the entire file with:

```tsx
import { redirect } from "next/navigation";

export default function DashboardRedirect() {
  redirect("/users");
}
```

This issues a 307 by default; Next.js does not expose 308 directly via `redirect()`, but the SEO/bookmark behavior is identical for our use case. The route handler runs server-side, so any deep link to `/users/dashboard` lands on `/users`.

- [ ] **Step 3: Verify build**

Run: `cd C:\LECG\Dashboard && npx next build 2>&1 | tail -20`
Expected: no errors related to `/users/dashboard`

- [ ] **Step 4: Verify redirect in dev server**

Start dev server if not running (`npm run dev`), then in another terminal:
```bash
curl -I -L http://localhost:3000/users/dashboard 2>&1 | head -20
```
Expected: 307 (or 308) redirect Location header pointing to `/users`.

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/users/dashboard/page.tsx
git commit -m "feat(access-analysis): redirect /users/dashboard to /users"
```

---

### Task 1.4: Route shell — `AccessAnalysisPage` placeholder behind flag

**Files:**
- Create: `app/(dashboard)/users/access-analysis/AccessAnalysisPage.tsx`
- Modify: `app/(dashboard)/users/page.tsx`

- [ ] **Step 1: Create the placeholder component**

```tsx
// app/(dashboard)/users/access-analysis/AccessAnalysisPage.tsx
"use client";

export function AccessAnalysisPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Access Analysis</h1>
        <p className="text-sm text-muted-foreground">
          Unified view — under construction. KPIs, hero chart, and drill-downs land in Phases 3–6.
        </p>
      </header>
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        AccessAnalysisPage shell · Phase 1 placeholder
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Read current `app/(dashboard)/users/page.tsx`**

Run: `cat app/\(dashboard\)/users/page.tsx`
Note the existing render shape (likely renders `UsersDirectoryClient` directly).

- [ ] **Step 3: Modify `app/(dashboard)/users/page.tsx` to branch on the flag**

Replace the file's body with:

```tsx
import { AccessAnalysisPage } from "./access-analysis/AccessAnalysisPage";
import { UsersDirectoryClient } from "./UsersDirectoryClient";
// preserve any existing imports the original page needs (e.g., auth checks)

export default function UsersPage() {
  const newTabEnabled = process.env.NEXT_PUBLIC_NEW_ACCESS_ANALYSIS === "1";
  if (newTabEnabled) return <AccessAnalysisPage />;
  return <UsersDirectoryClient />;
}
```

If the original file did server-side auth/setup (e.g., `getServerSession`), preserve that logic above the branch — wrap both render branches with whatever guards the original had. Read the original file carefully before editing.

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 5: Verify flag off — legacy behavior**

With `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS` unset, visit `http://localhost:3000/users` in the browser. Expected: existing directory table renders unchanged.

- [ ] **Step 6: Verify flag on — placeholder renders**

Set `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1` in `.env`, restart dev server, visit `http://localhost:3000/users`. Expected: "Access Analysis · under construction" placeholder.

- [ ] **Step 7: Reset flag to empty** (so we don't ship the placeholder)

Edit `.env` to set `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=` (empty value).

- [ ] **Step 8: Commit**

```bash
git add app/\(dashboard\)/users/access-analysis/AccessAnalysisPage.tsx app/\(dashboard\)/users/page.tsx
git commit -m "feat(access-analysis): scaffold AccessAnalysisPage behind feature flag"
```

---

### Task 1.5: Sidebar navigation update

**Files:**
- Modify: `components/layout/navigation.ts:26-28`

- [ ] **Step 1: Inspect current navigation entries**

Run: `grep -n "Users\|Access Analysis" components/layout/navigation.ts`
Expected: two entries — `/users` labeled "Users" and `/users/dashboard` labeled "Access Analysis"

- [ ] **Step 2: Replace the two entries with one**

In `components/layout/navigation.ts`, find:

```ts
{ href: "/users", label: "Users", icon: Users, group: "Organization" },
{ href: "/users/dashboard", label: "Access Analysis", icon: PieChart, group: "Organization" },
```

Replace with:

```ts
{ href: "/users", label: "Access Analysis", icon: PieChart, group: "Organization" },
```

(Keep the `PieChart` icon import; remove the `Users` icon import if it's now unused elsewhere — verify with `grep "Users[^A-Za-z]" components/layout/navigation.ts` after.)

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: no errors, no "imported but never used" warnings about `Users` icon.

- [ ] **Step 4: Visual verify**

Restart dev server, hard-refresh the dashboard. The sidebar under "Organization" should show one entry: **"Access Analysis"**. No "Users" entry.

- [ ] **Step 5: Commit**

```bash
git add components/layout/navigation.ts
git commit -m "feat(access-analysis): collapse Users + Access Analysis sidebar entries into one"
```

---

## Phase 2 — Backend: tRPC procedures

### Task 2.1: Timeline bucketing utility

**Files:**
- Create: `lib/acc/timelineBucketing.ts`
- Test: `lib/acc/timelineBucketing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/acc/timelineBucketing.test.ts
import { describe, it, expect } from "vitest";
import { pickBinSize, bucketStart, generateBuckets } from "./timelineBucketing";

describe("pickBinSize", () => {
  it("returns 'day' for 30d window", () => {
    expect(pickBinSize("30d")).toBe("day");
  });
  it("returns 'week' for 90d window", () => {
    expect(pickBinSize("90d")).toBe("week");
  });
  it("returns 'week' for 1y window", () => {
    expect(pickBinSize("1y")).toBe("week");
  });
  it("returns 'month' for 'all' window", () => {
    expect(pickBinSize("all")).toBe("month");
  });
});

describe("bucketStart", () => {
  it("truncates a date to day start UTC", () => {
    const d = new Date("2026-05-13T17:42:00.000Z");
    expect(bucketStart(d, "day").toISOString()).toBe("2026-05-13T00:00:00.000Z");
  });
  it("truncates a date to ISO week start (Monday UTC)", () => {
    // 2026-05-13 is a Wednesday; ISO week starts Monday 2026-05-11
    const d = new Date("2026-05-13T17:42:00.000Z");
    expect(bucketStart(d, "week").toISOString()).toBe("2026-05-11T00:00:00.000Z");
  });
  it("truncates a date to month start UTC", () => {
    const d = new Date("2026-05-13T17:42:00.000Z");
    expect(bucketStart(d, "month").toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("generateBuckets", () => {
  it("generates daily buckets for a 7-day window", () => {
    const start = new Date("2026-05-07T00:00:00.000Z");
    const end = new Date("2026-05-13T23:59:59.999Z");
    const out = generateBuckets(start, end, "day");
    expect(out).toHaveLength(7);
    expect(out[0].toISOString()).toBe("2026-05-07T00:00:00.000Z");
    expect(out[6].toISOString()).toBe("2026-05-13T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd C:\LECG\Dashboard && npx vitest run lib/acc/timelineBucketing.test.ts`
Expected: FAIL — "Cannot find module './timelineBucketing'"

- [ ] **Step 3: Implement the utility**

```ts
// lib/acc/timelineBucketing.ts
import type { TimeWindow, TimelineBin } from "./accessAnalysisTypes";

export function pickBinSize(window: TimeWindow): TimelineBin {
  if (window === "30d") return "day";
  if (window === "90d" || window === "1y") return "week";
  return "month";
}

export function bucketStart(d: Date, bin: TimelineBin): Date {
  const yr = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const dy = d.getUTCDate();
  if (bin === "day") return new Date(Date.UTC(yr, mo, dy));
  if (bin === "month") return new Date(Date.UTC(yr, mo, 1));
  // ISO week: Monday-based. JS Date.getUTCDay(): 0=Sun..6=Sat. Convert to 0=Mon..6=Sun.
  const dayStart = new Date(Date.UTC(yr, mo, dy));
  const dow = (dayStart.getUTCDay() + 6) % 7;
  return new Date(dayStart.getTime() - dow * 24 * 60 * 60 * 1000);
}

export function generateBuckets(start: Date, end: Date, bin: TimelineBin): Date[] {
  const out: Date[] = [];
  let cur = bucketStart(start, bin);
  const last = bucketStart(end, bin);
  while (cur.getTime() <= last.getTime()) {
    out.push(new Date(cur));
    if (bin === "day") cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
    else if (bin === "week") cur = new Date(cur.getTime() + 7 * 24 * 60 * 60 * 1000);
    else {
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
  }
  return out;
}

export function windowToDateRange(window: TimeWindow, now: Date = new Date()): { start: Date; end: Date } {
  const end = now;
  if (window === "30d") return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end };
  if (window === "90d") return { start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), end };
  if (window === "1y") return { start: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000), end };
  // "all" — use epoch as start; caller may clamp to earliest AccActivity row.
  return { start: new Date(0), end };
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run lib/acc/timelineBucketing.test.ts`
Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/acc/timelineBucketing.ts lib/acc/timelineBucketing.test.ts
git commit -m "feat(access-analysis): add timeline bucketing utility"
```

---

### Task 2.2: Headline-event ranking utility

**Files:**
- Create: `lib/acc/headlineEventPicker.ts`
- Test: `lib/acc/headlineEventPicker.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/acc/headlineEventPicker.test.ts
import { describe, it, expect } from "vitest";
import { pickHeadlineEvent, type RankableEvent } from "./headlineEventPicker";

const windowEnd = new Date("2026-05-13T00:00:00.000Z");
const windowStart = new Date("2026-04-13T00:00:00.000Z");

describe("pickHeadlineEvent", () => {
  it("returns null on empty input", () => {
    expect(pickHeadlineEvent([], "admin", windowStart, windowEnd)).toBeNull();
  });

  it("picks the highest-severity event when recency is equal", () => {
    const events: RankableEvent[] = [
      { rawAction: "role.change", newRole: "projectAdmin", occurredAt: windowEnd, subjectEmail: "a@x", subjectAutodeskId: "1", projectId: "p1" },
      { rawAction: "role.change", newRole: "memberLead", occurredAt: windowEnd, subjectEmail: "b@x", subjectAutodeskId: "2", projectId: "p1" },
    ];
    const head = pickHeadlineEvent(events, "admin", windowStart, windowEnd);
    expect(head?.subjectEmail).toBe("a@x");
  });

  it("biases toward recent events when severities are equal", () => {
    const events: RankableEvent[] = [
      { rawAction: "user.added", newRole: null, occurredAt: windowStart, subjectEmail: "old@x", subjectAutodeskId: "1", projectId: null },
      { rawAction: "user.added", newRole: null, occurredAt: windowEnd, subjectEmail: "new@x", subjectAutodeskId: "2", projectId: null },
    ];
    const head = pickHeadlineEvent(events, "membership", windowStart, windowEnd);
    expect(head?.subjectEmail).toBe("new@x");
  });

  it("formats the headline string with subject and date", () => {
    const events: RankableEvent[] = [
      { rawAction: "role.change", newRole: "projectAdmin", occurredAt: new Date("2026-05-12T10:00:00Z"), subjectEmail: "marco@hermosillo.com", subjectAutodeskId: "1", projectId: "p1" },
    ];
    const head = pickHeadlineEvent(events, "admin", windowStart, windowEnd);
    expect(head?.headline).toContain("marco@hermosillo.com");
    expect(head?.headline.toLowerCase()).toContain("projectadmin");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run lib/acc/headlineEventPicker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the ranker**

```ts
// lib/acc/headlineEventPicker.ts
import type { ChangeStreamId, HeadlineEvent } from "./accessAnalysisTypes";

export interface RankableEvent {
  rawAction: string;
  newRole: string | null;
  occurredAt: Date;
  subjectEmail: string | null;
  subjectAutodeskId: string | null;
  projectId: string | null;
}

const SEVERITY: Record<string, number> = {
  "role.change:accountAdmin": 100,
  "role.change:projectAdmin": 60,
  "user.deactivated": 50,
  "user.added": 30,
  "user.removed": 25,
  "project.member.added": 20,
  "role.change": 15,
  "user.activated": 10,
};

function severityKey(e: RankableEvent): string {
  if (e.rawAction === "role.change" && e.newRole) {
    const key = `role.change:${e.newRole}`;
    if (SEVERITY[key] !== undefined) return key;
  }
  return e.rawAction;
}

function recencyWeight(occurredAt: Date, windowStart: Date, windowEnd: Date): number {
  const total = windowEnd.getTime() - windowStart.getTime();
  if (total <= 0) return 1.0;
  const elapsed = occurredAt.getTime() - windowStart.getTime();
  const ratio = Math.max(0, Math.min(1, elapsed / total));
  // Last 10% of window → 1.0; start → 0.3; linear in between
  return 0.3 + 0.7 * ratio;
}

function formatHeadline(e: RankableEvent): string {
  const who = e.subjectEmail ?? e.subjectAutodeskId ?? "Unknown user";
  const date = e.occurredAt.toISOString().slice(0, 10);
  if (e.rawAction === "role.change" && e.newRole) {
    return `${who} was promoted to ${e.newRole} on ${date}`;
  }
  if (e.rawAction === "user.added") return `${who} was added on ${date}`;
  if (e.rawAction === "user.removed") return `${who} was removed on ${date}`;
  if (e.rawAction === "user.deactivated") return `${who} was deactivated on ${date}`;
  if (e.rawAction === "user.activated") return `${who} was reactivated on ${date}`;
  if (e.rawAction === "project.member.added") {
    return `${who} was added to a project on ${date}`;
  }
  return `${who}: ${e.rawAction} on ${date}`;
}

export function pickHeadlineEvent(
  events: RankableEvent[],
  stream: ChangeStreamId,
  windowStart: Date,
  windowEnd: Date,
): HeadlineEvent | null {
  if (events.length === 0) return null;
  let best: { event: RankableEvent; score: number } | null = null;
  for (const e of events) {
    const sev = SEVERITY[severityKey(e)] ?? 5;
    const score = sev * recencyWeight(e.occurredAt, windowStart, windowEnd);
    if (!best || score > best.score) best = { event: e, score };
  }
  if (!best) return null;
  return {
    stream,
    headline: formatHeadline(best.event),
    occurredAt: best.event.occurredAt.toISOString(),
    subjectAutodeskId: best.event.subjectAutodeskId,
    subjectEmail: best.event.subjectEmail,
    projectId: best.event.projectId,
    newRole: best.event.newRole,
    impactScore: best.score,
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run lib/acc/headlineEventPicker.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/acc/headlineEventPicker.ts lib/acc/headlineEventPicker.test.ts
git commit -m "feat(access-analysis): add headline event ranking utility"
```

---

### Task 2.3: `accActivity.getTimeline` tRPC procedure

**Files:**
- Modify: `server/routers/acc-activity.ts` — append a new procedure inside `accActivityRouter`

- [ ] **Step 1: Inspect the existing router so we extend (not break) it**

Run: `cat server/routers/acc-activity.ts | head -100`
Note: existing imports include `prisma`, `z` from zod, `router`, `protectedProcedure`. Reuse them.

- [ ] **Step 2: Add `getTimeline` procedure**

Inside the `accActivityRouter` object in `server/routers/acc-activity.ts`, add (before the closing `});`):

```ts
  getTimeline: protectedProcedure
    .input(
      z.object({
        window: z.enum(["30d", "90d", "1y", "all"]),
      }),
    )
    .query(async ({ input }) => {
      const { window } = input;
      const { windowToDateRange, pickBinSize, generateBuckets, bucketStart } = await import("@/lib/acc/timelineBucketing");
      const range = windowToDateRange(window);
      const bin = pickBinSize(window);

      // Pull all activity rows in window, mapping rawAction -> stream
      const rows = await prisma.accActivity.findMany({
        where: { createdAt: { gte: range.start, lte: range.end } },
        select: { rawAction: true, createdAt: true, details: true, sourceFile: true },
      });

      // Classify each row into a stream
      function classify(row: { rawAction: string; sourceFile: string; details: unknown }): "membership" | "permission" | "project" | "admin" | null {
        const a = (row.rawAction || "").toLowerCase();
        const isAdminGrant =
          a.includes("role") &&
          typeof row.details === "object" &&
          row.details !== null &&
          ("newRole" in row.details || "new_role" in row.details) &&
          /admin/i.test(String((row.details as Record<string, unknown>).newRole ?? (row.details as Record<string, unknown>).new_role ?? ""));
        if (isAdminGrant) return "admin";
        if (a.startsWith("role.") || a.startsWith("permission.")) return "permission";
        if (a.startsWith("project.member") || a === "project.member.added" || a === "project.member.removed") return "project";
        if (a.startsWith("user.")) return "membership";
        return null;
      }

      // Bin into buckets
      const buckets = generateBuckets(range.start, range.end, bin);
      const bucketMap = new Map<string, { membership: number; permission: number; project: number; admin: number }>();
      for (const b of buckets) bucketMap.set(b.toISOString(), { membership: 0, permission: 0, project: 0, admin: 0 });

      for (const row of rows) {
        const stream = classify(row);
        if (!stream) continue;
        const key = bucketStart(row.createdAt, bin).toISOString();
        const slot = bucketMap.get(key);
        if (slot) slot[stream]++;
      }

      const points = Array.from(bucketMap.entries()).map(([bucket, counts]) => ({
        bucket,
        ...counts,
      }));
      points.sort((a, b) => a.bucket.localeCompare(b.bucket));

      // Also return the earliest event in the entire table — used by the empty-window line
      const earliest = await prisma.accActivity.findFirst({
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });

      return {
        points,
        bin,
        dataEarliestEvent: earliest?.createdAt.toISOString() ?? null,
      };
    }),
```

- [ ] **Step 3: Write the integration test**

Create `server/routers/acc-activity.timeline.test.ts`:

```ts
// server/routers/acc-activity.timeline.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { appRouter } from "./root";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL!, max: 2 }),
});

describe("accActivity.getTimeline (integration)", () => {
  it("returns daily buckets for 30d window", async () => {
    const caller = appRouter.createCaller({ prisma, session: { user: { email: "luis.ecorteg@gmail.com" } } } as any);
    const result = await caller.accActivity.getTimeline({ window: "30d" });
    expect(result.bin).toBe("day");
    expect(result.points.length).toBeGreaterThanOrEqual(28);
    expect(result.points[0]).toHaveProperty("membership");
    expect(result.points[0]).toHaveProperty("admin");
  });

  it("returns monthly buckets for 'all' window", async () => {
    const caller = appRouter.createCaller({ prisma, session: { user: { email: "luis.ecorteg@gmail.com" } } } as any);
    const result = await caller.accActivity.getTimeline({ window: "all" });
    expect(result.bin).toBe("month");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 4: Run test — expect PASS (the procedure is implemented)**

Run: `node --env-file=.env node_modules/.bin/vitest run server/routers/acc-activity.timeline.test.ts`
Expected: 2 tests pass. If they FAIL with type errors on `createCaller`, inspect how other tests in the repo create a tRPC caller (run `grep -rn "createCaller" server/`) and copy that pattern.

- [ ] **Step 5: Commit**

```bash
git add server/routers/acc-activity.ts server/routers/acc-activity.timeline.test.ts
git commit -m "feat(access-analysis): add accActivity.getTimeline tRPC procedure"
```

---

### Task 2.4: `accActivity.getHeadlineEvent` tRPC procedure

**Files:**
- Modify: `server/routers/acc-activity.ts`

- [ ] **Step 1: Add procedure** (inside `accActivityRouter`, before closing `});`)

```ts
  getHeadlineEvent: protectedProcedure
    .input(
      z.object({
        window: z.enum(["30d", "90d", "1y", "all"]),
        stream: z.enum(["membership", "permission", "project", "admin"]),
      }),
    )
    .query(async ({ input }) => {
      const { windowToDateRange } = await import("@/lib/acc/timelineBucketing");
      const { pickHeadlineEvent, type RankableEvent } = await import("@/lib/acc/headlineEventPicker");
      const range = windowToDateRange(input.window);

      const rows = await prisma.accActivity.findMany({
        where: { createdAt: { gte: range.start, lte: range.end } },
        select: { rawAction: true, createdAt: true, details: true, sourceFile: true, autodeskId: true, userEmail: true, projectId: true },
      });

      // Classify (same logic as getTimeline — kept inline to avoid module sharing)
      function classify(row: typeof rows[number]): "membership" | "permission" | "project" | "admin" | null {
        const a = (row.rawAction || "").toLowerCase();
        const d = (row.details ?? {}) as Record<string, unknown>;
        const newRoleRaw = String(d.newRole ?? d.new_role ?? "");
        const isAdminGrant = a.includes("role") && /admin/i.test(newRoleRaw);
        if (isAdminGrant) return "admin";
        if (a.startsWith("role.") || a.startsWith("permission.")) return "permission";
        if (a.startsWith("project.member")) return "project";
        if (a.startsWith("user.")) return "membership";
        return null;
      }

      const streamRows = rows.filter((r) => classify(r) === input.stream);
      const rankable: RankableEvent[] = streamRows.map((r) => {
        const d = (r.details ?? {}) as Record<string, unknown>;
        return {
          rawAction: r.rawAction,
          newRole: (d.newRole ?? d.new_role) as string | null ?? null,
          occurredAt: r.createdAt,
          subjectEmail: r.userEmail,
          subjectAutodeskId: r.autodeskId,
          projectId: r.projectId || null,
        };
      });

      return pickHeadlineEvent(rankable, input.stream, range.start, range.end);
    }),
```

- [ ] **Step 2: Smoke-test against live DB**

Run:
```bash
node --env-file=.env -e "
const { appRouter } = require('./server/routers/root');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL, max: 2 }) });
const caller = appRouter.createCaller({ prisma, session: { user: { email: 'luis.ecorteg@gmail.com' } } });
caller.accActivity.getHeadlineEvent({ window: '30d', stream: 'membership' }).then(r => { console.log(JSON.stringify(r, null, 2)); prisma.\$disconnect(); });
"
```
Expected: a `HeadlineEvent` object or `null` (depending on what's in the DB). No errors.

- [ ] **Step 3: Commit**

```bash
git add server/routers/acc-activity.ts
git commit -m "feat(access-analysis): add accActivity.getHeadlineEvent tRPC procedure"
```

---

### Task 2.5: `accMembers.getKpiSummary` tRPC procedure

**Files:**
- Modify: `server/routers/acc-members.ts`

- [ ] **Step 1: Inspect the router**

Run: `cat server/routers/acc-members.ts | head -60`
Reuse its imports (`prisma`, `z`, `router`, `protectedProcedure`).

- [ ] **Step 2: Add `getKpiSummary` procedure inside `accMembersRouter`** (before closing `});`)

```ts
  getKpiSummary: protectedProcedure
    .input(z.object({ window: z.enum(["30d", "90d", "1y", "all"]) }))
    .query(async ({ input }) => {
      const { windowToDateRange } = await import("@/lib/acc/timelineBucketing");
      const range = windowToDateRange(input.window);
      const priorRange = {
        start: new Date(range.start.getTime() - (range.end.getTime() - range.start.getTime())),
        end: range.start,
      };

      // 1. Members — current vs window start
      const members = await prisma.accMemberCache.count();
      const membersAtStart = await prisma.accMemberCache.count({
        where: { createdAt: { lte: range.start } },
      });

      // 2. Access changes — events in window vs prior equivalent window
      const accessChanges = await prisma.accActivity.count({
        where: { createdAt: { gte: range.start, lte: range.end } },
      });
      const priorAccessChanges = await prisma.accActivity.count({
        where: { createdAt: { gte: priorRange.start, lte: priorRange.end } },
      });

      // 3. Active admins — distinct users currently flagged admin
      const adminUsers = await prisma.$queryRawUnsafe<{ count: number }[]>(
        `SELECT COUNT(DISTINCT email)::int AS count FROM "AccMemberCache" WHERE (data->>'projectAdmin')::boolean = true OR (data->>'accountAdmin')::boolean = true`,
      );
      const activeAdmins = adminUsers[0]?.count ?? 0;

      // 4. Stale members — members with zero activity rows in window
      const staleResult = await prisma.$queryRawUnsafe<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM "AccMemberCache" mc WHERE NOT EXISTS (SELECT 1 FROM "AccActivity" a WHERE LOWER(a."userEmail") = LOWER(mc.email) AND a."createdAt" >= $1 AND a."createdAt" <= $2)`,
        range.start,
        range.end,
      );
      const staleMembers = staleResult[0]?.count ?? 0;

      const earliest = await prisma.accActivity.findFirst({
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });

      return {
        members: { value: members, delta: members - membersAtStart },
        accessChanges: { value: accessChanges, delta: accessChanges - priorAccessChanges },
        activeAdmins: { value: activeAdmins, delta: 0 }, // delta computation requires history snapshots — Phase 2 deferred; ships as 0
        staleMembers: { value: staleMembers, delta: 0 }, // same caveat
        dataEarliestEvent: earliest?.createdAt.toISOString() ?? null,
      };
    }),
```

- [ ] **Step 3: Smoke-test**

Run:
```bash
node --env-file=.env -e "
const { appRouter } = require('./server/routers/root');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL, max: 2 }) });
const caller = appRouter.createCaller({ prisma, session: { user: { email: 'luis.ecorteg@gmail.com' } } });
caller.accMembers.getKpiSummary({ window: '30d' }).then(r => { console.log(JSON.stringify(r, null, 2)); prisma.\$disconnect(); });
"
```
Expected: object with `members`, `accessChanges`, `activeAdmins`, `staleMembers`, `dataEarliestEvent`. Values match what we observed earlier (`members.value` ≈ 1212, `accessChanges.value` ≈ 2507, `activeAdmins` is a small int).

- [ ] **Step 4: Commit**

```bash
git add server/routers/acc-members.ts
git commit -m "feat(access-analysis): add accMembers.getKpiSummary tRPC procedure"
```

---

## Phase 3 — KPI strip

### Task 3.1: `AccessAnalysisContext` for shared page state

**Files:**
- Create: `app/(dashboard)/users/access-analysis/AccessAnalysisContext.tsx`

- [ ] **Step 1: Implement the context**

```tsx
// app/(dashboard)/users/access-analysis/AccessAnalysisContext.tsx
"use client";

import * as React from "react";
import type { TimeWindow, ChangeStreamId } from "@/lib/acc/accessAnalysisTypes";

interface AccessAnalysisState {
  window: TimeWindow;
  setWindow: (w: TimeWindow) => void;
  focusedStream: ChangeStreamId | null;
  setFocusedStream: (s: ChangeStreamId | null) => void;
  directoryFilter: { stream: ChangeStreamId; occurredOn?: string } | null;
  setDirectoryFilter: (f: { stream: ChangeStreamId; occurredOn?: string } | null) => void;
  isDirectoryOpen: boolean;
  setDirectoryOpen: (open: boolean) => void;
}

const AccessAnalysisCtx = React.createContext<AccessAnalysisState | null>(null);

export function AccessAnalysisProvider({ children }: { children: React.ReactNode }) {
  const [window, setWindow] = React.useState<TimeWindow>("30d");
  const [focusedStream, setFocusedStream] = React.useState<ChangeStreamId | null>(null);
  const [directoryFilter, setDirectoryFilter] = React.useState<AccessAnalysisState["directoryFilter"]>(null);
  const [isDirectoryOpen, setDirectoryOpen] = React.useState(false);
  return (
    <AccessAnalysisCtx.Provider
      value={{
        window,
        setWindow,
        focusedStream,
        setFocusedStream,
        directoryFilter,
        setDirectoryFilter,
        isDirectoryOpen,
        setDirectoryOpen,
      }}
    >
      {children}
    </AccessAnalysisCtx.Provider>
  );
}

export function useAccessAnalysis() {
  const v = React.useContext(AccessAnalysisCtx);
  if (!v) throw new Error("useAccessAnalysis must be used inside AccessAnalysisProvider");
  return v;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(dashboard\)/users/access-analysis/AccessAnalysisContext.tsx
git commit -m "feat(access-analysis): add shared page state context"
```

---

### Task 3.2: `TimeWindowSelector` segmented control

**Files:**
- Create: `app/(dashboard)/users/access-analysis/TimeWindowSelector.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/(dashboard)/users/access-analysis/TimeWindowSelector.tsx
"use client";

import { TIME_WINDOWS, type TimeWindow } from "@/lib/acc/accessAnalysisTypes";
import { useAccessAnalysis } from "./AccessAnalysisContext";
import { cn } from "@/lib/utils";

const LABELS: Record<TimeWindow, string> = {
  "30d": "30 days",
  "90d": "90 days",
  "1y": "1 year",
  "all": "All time",
};

export function TimeWindowSelector() {
  const { window, setWindow } = useAccessAnalysis();
  return (
    <div className="inline-flex rounded-md border border-input bg-background p-0.5 text-sm" role="group">
      {TIME_WINDOWS.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => setWindow(w)}
          className={cn(
            "px-3 py-1 rounded-sm transition-colors",
            window === w ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
          aria-pressed={window === w}
        >
          {LABELS[w]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(dashboard\)/users/access-analysis/TimeWindowSelector.tsx
git commit -m "feat(access-analysis): add time-window selector"
```

---

### Task 3.3: `KpiCard` and `KpiStrip` components

**Files:**
- Create: `app/(dashboard)/users/access-analysis/KpiCard.tsx`
- Create: `app/(dashboard)/users/access-analysis/KpiStrip.tsx`

- [ ] **Step 1: Implement `KpiCard`**

```tsx
// app/(dashboard)/users/access-analysis/KpiCard.tsx
"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: number;
  delta: number;
  borderColor?: string; // hsl string from CHANGE_STREAM_META
  format?: (n: number) => string;
}

const defaultFmt = (n: number) => n.toLocaleString();

export function KpiCard({ label, value, delta, borderColor, format = defaultFmt }: KpiCardProps) {
  const deltaSign = delta > 0 ? "+" : delta < 0 ? "" : "";
  const deltaClass = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-muted-foreground";
  return (
    <Card
      className="flex flex-col gap-2 p-4 border-l-4"
      style={borderColor ? { borderLeftColor: borderColor } : undefined}
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-3xl font-semibold tabular-nums">{format(value)}</div>
      <div className={cn("text-sm tabular-nums", deltaClass)}>
        {deltaSign}{format(delta)} <span className="text-muted-foreground">vs prior</span>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Implement `KpiStrip`**

```tsx
// app/(dashboard)/users/access-analysis/KpiStrip.tsx
"use client";

import { trpc } from "@/lib/core/trpc";
import { CHANGE_STREAM_META } from "@/lib/acc/accessAnalysisTypes";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessAnalysis } from "./AccessAnalysisContext";
import { KpiCard } from "./KpiCard";

export function KpiStrip() {
  const { window } = useAccessAnalysis();
  const query = trpc.accMembers.getKpiSummary.useQuery({ window }, { staleTime: 300_000 });

  if (query.isLoading || !query.data) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
    );
  }
  if (query.error) {
    return <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Failed to load KPIs: {query.error.message}</div>;
  }

  const d = query.data;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <KpiCard label="Members" value={d.members.value} delta={d.members.delta} borderColor={CHANGE_STREAM_META.membership.color} />
      <KpiCard label="Access changes" value={d.accessChanges.value} delta={d.accessChanges.delta} />
      <KpiCard label="Active admins" value={d.activeAdmins.value} delta={d.activeAdmins.delta} borderColor={CHANGE_STREAM_META.admin.color} />
      <KpiCard label="Stale members" value={d.staleMembers.value} delta={d.staleMembers.delta} />
    </div>
  );
}
```

- [ ] **Step 3: Wire KpiStrip into `AccessAnalysisPage`**

Replace the body of `AccessAnalysisPage.tsx` with:

```tsx
"use client";

import { AccessAnalysisProvider } from "./AccessAnalysisContext";
import { TimeWindowSelector } from "./TimeWindowSelector";
import { KpiStrip } from "./KpiStrip";

export function AccessAnalysisPage() {
  return (
    <AccessAnalysisProvider>
      <div className="flex flex-col gap-6 p-4">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Access Analysis</h1>
            <p className="text-sm text-muted-foreground">How access is changing over time.</p>
          </div>
          <TimeWindowSelector />
        </header>
        <KpiStrip />
        {/* Hero chart lands in Phase 4 */}
        {/* Drill-down cards in Phase 5 */}
        {/* Directory accordion in Phase 6 */}
      </div>
    </AccessAnalysisProvider>
  );
}
```

- [ ] **Step 4: Visual verify**

Set `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1` in `.env`, restart dev server, visit `http://localhost:3000/users`. Expected: 4 KPI cards render with real numbers (members ≈ 1212, etc.); window selector switches values when clicked.

- [ ] **Step 5: Reset flag, commit**

Reset flag back to empty in `.env`, then:

```bash
git add app/\(dashboard\)/users/access-analysis/KpiCard.tsx app/\(dashboard\)/users/access-analysis/KpiStrip.tsx app/\(dashboard\)/users/access-analysis/AccessAnalysisPage.tsx
git commit -m "feat(access-analysis): KPI strip with time-window control"
```

---

## Phase 4 — Hero chart

### Task 4.1: Install `@nivo/stream` if not present

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Check if installed**

Run: `grep "@nivo/stream" package.json`

If not present, run: `npm install @nivo/stream@^0.99.0`

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @nivo/stream for access-analysis hero chart"
```

---

### Task 4.2: `AccessEventsChart` component

**Files:**
- Create: `app/(dashboard)/users/access-analysis/AccessEventsChart.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/(dashboard)/users/access-analysis/AccessEventsChart.tsx
"use client";

import { ResponsiveStream } from "@nivo/stream";
import { trpc } from "@/lib/core/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { CHANGE_STREAM_META, CHANGE_STREAMS } from "@/lib/acc/accessAnalysisTypes";
import { useAccessAnalysis } from "./AccessAnalysisContext";

export function AccessEventsChart() {
  const { window } = useAccessAnalysis();
  const query = trpc.accActivity.getTimeline.useQuery({ window }, { staleTime: 300_000 });

  if (query.isLoading || !query.data) {
    return <Skeleton className="h-[400px] w-full" />;
  }
  if (query.error) {
    return <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Failed to load timeline: {query.error.message}</div>;
  }

  const data = query.data.points.map((p) => ({
    membership: p.membership,
    permission: p.permission,
    project: p.project,
    admin: p.admin,
  }));

  // If every bin is zero, show a graceful empty state
  const hasAnyData = data.some((d) => d.membership + d.permission + d.project + d.admin > 0);
  if (!hasAnyData) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-md border border-dashed text-center">
        <p className="text-base font-medium">No access events in this window</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {query.data.dataEarliestEvent
            ? `Earliest data: ${new Date(query.data.dataEarliestEvent).toISOString().slice(0, 10)}`
            : "No activity data has been ingested yet."}
        </p>
      </div>
    );
  }

  const colors = CHANGE_STREAMS.map((id) => CHANGE_STREAM_META[id].color);

  return (
    <div className="h-[400px] w-full">
      <ResponsiveStream
        data={data}
        keys={[...CHANGE_STREAMS]}
        margin={{ top: 16, right: 24, bottom: 48, left: 48 }}
        axisBottom={{
          tickSize: 5,
          tickPadding: 5,
          format: (i) => {
            const point = query.data!.points[i as number];
            if (!point) return "";
            const d = new Date(point.bucket);
            return d.toISOString().slice(5, 10); // MM-DD
          },
        }}
        axisLeft={{ tickSize: 5, tickPadding: 5 }}
        offsetType="diverging"
        colors={colors}
        fillOpacity={0.85}
        borderColor={{ theme: "background" }}
        enableGridX={false}
        enableGridY={true}
        legends={[
          {
            anchor: "bottom",
            direction: "row",
            translateY: 40,
            itemWidth: 110,
            itemHeight: 16,
            itemTextColor: "currentColor",
            symbolSize: 12,
            symbolShape: "circle",
          },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire into `AccessAnalysisPage`**

In `AccessAnalysisPage.tsx`, add the import and render `<AccessEventsChart />` below `<KpiStrip />`:

```tsx
import { AccessEventsChart } from "./AccessEventsChart";
// ...
<KpiStrip />
<AccessEventsChart />
```

- [ ] **Step 3: Visual verify**

Flag on, restart, visit `/users`. Expected: stacked-area chart renders below KPI strip; switching window changes the chart; legend at the bottom shows 4 colored streams.

- [ ] **Step 4: Reset flag, commit**

```bash
git add app/\(dashboard\)/users/access-analysis/AccessEventsChart.tsx app/\(dashboard\)/users/access-analysis/AccessAnalysisPage.tsx
git commit -m "feat(access-analysis): hero chart — stacked area of access events over time"
```

---

## Phase 5 — Drill-down cards

### Task 5.1: `ChangeStreamCard` component

**Files:**
- Create: `app/(dashboard)/users/access-analysis/ChangeStreamCard.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/(dashboard)/users/access-analysis/ChangeStreamCard.tsx
"use client";

import * as React from "react";
import { ResponsiveLine } from "@nivo/line";
import { trpc } from "@/lib/core/trpc";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CHANGE_STREAM_META, type ChangeStreamId } from "@/lib/acc/accessAnalysisTypes";
import { useAccessAnalysis } from "./AccessAnalysisContext";

interface ChangeStreamCardProps {
  stream: ChangeStreamId;
}

export function ChangeStreamCard({ stream }: ChangeStreamCardProps) {
  const meta = CHANGE_STREAM_META[stream];
  const { window, setDirectoryFilter, setDirectoryOpen } = useAccessAnalysis();

  const timeline = trpc.accActivity.getTimeline.useQuery({ window }, { staleTime: 300_000 });
  const headline = trpc.accActivity.getHeadlineEvent.useQuery({ window, stream }, { staleTime: 300_000 });

  const sparkData = React.useMemo(() => {
    if (!timeline.data) return null;
    return [
      {
        id: stream,
        data: timeline.data.points.map((p, i) => ({ x: i, y: p[stream] })),
      },
    ];
  }, [timeline.data, stream]);

  const total = sparkData?.[0]?.data.reduce((sum, d) => sum + (d.y as number), 0) ?? 0;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <CardHeader className="p-0 flex flex-row items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: meta.color }}
          aria-hidden
        />
        <h3 className="text-sm font-semibold uppercase tracking-wide">{meta.label}</h3>
      </CardHeader>
      <CardContent className="p-0 flex items-center justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold tabular-nums">{total.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">{meta.description}</div>
        </div>
        <div className="h-16 w-32">
          {sparkData ? (
            <ResponsiveLine
              data={sparkData}
              margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
              xScale={{ type: "linear" }}
              yScale={{ type: "linear", min: 0 }}
              enableArea
              enablePoints={false}
              enableGridX={false}
              enableGridY={false}
              axisLeft={null}
              axisBottom={null}
              colors={[meta.color]}
              areaOpacity={0.3}
              curve="monotoneX"
              isInteractive={false}
            />
          ) : (
            <Skeleton className="h-full w-full" />
          )}
        </div>
      </CardContent>
      <CardContent className="p-0 mt-2">
        {headline.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : headline.data ? (
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <div className="text-xs font-medium text-muted-foreground">Headline</div>
            <div className="mt-1">{headline.data.headline}</div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground text-center">
            No events in this window
          </div>
        )}
      </CardContent>
      <CardFooter className="p-0 mt-2">
        <Button
          variant="link"
          className="p-0 h-auto text-sm"
          onClick={() => {
            setDirectoryFilter({ stream });
            setDirectoryOpen(true);
            requestAnimationFrame(() => {
              document.getElementById("directory-accordion")?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }}
        >
          See all changes →
        </Button>
      </CardFooter>
    </Card>
  );
}

```

- [ ] **Step 2: Wire 4 cards into `AccessAnalysisPage`**

In `AccessAnalysisPage.tsx`, add below the chart:

```tsx
import { ChangeStreamCard } from "./ChangeStreamCard";
import { CHANGE_STREAMS } from "@/lib/acc/accessAnalysisTypes";
// ...
<AccessEventsChart />
<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
  {CHANGE_STREAMS.map((s) => <ChangeStreamCard key={s} stream={s} />)}
</div>
```

- [ ] **Step 3: Visual verify**

Flag on, restart, visit `/users`. Expected: 4 cards below the chart, each with a sparkline, total count, and (when DB has data) a headline event in a tinted box; "See all changes →" link is clickable (doesn't crash even though accordion isn't built yet — `setDirectoryOpen(true)` just toggles state).

- [ ] **Step 4: Reset flag, commit**

```bash
git add app/\(dashboard\)/users/access-analysis/ChangeStreamCard.tsx app/\(dashboard\)/users/access-analysis/AccessAnalysisPage.tsx
git commit -m "feat(access-analysis): 4 drill-down change-stream cards"
```

---

## Phase 6 — Directory accordion

### Task 6.1: `DirectoryAccordion` wrapper

**Files:**
- Create: `app/(dashboard)/users/access-analysis/DirectoryAccordion.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/(dashboard)/users/access-analysis/DirectoryAccordion.tsx
"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { UsersDirectoryClient } from "../UsersDirectoryClient";
import { trpc } from "@/lib/core/trpc";
import { useAccessAnalysis } from "./AccessAnalysisContext";
import { CHANGE_STREAM_META } from "@/lib/acc/accessAnalysisTypes";

export function DirectoryAccordion() {
  const { isDirectoryOpen, setDirectoryOpen, directoryFilter, setDirectoryFilter } = useAccessAnalysis();
  const kpiQuery = trpc.accMembers.getKpiSummary.useQuery({ window: "all" }, { staleTime: 300_000 });
  const memberCount = kpiQuery.data?.members.value ?? 0;

  return (
    <div id="directory-accordion">
      <Accordion
        type="single"
        collapsible
        value={isDirectoryOpen ? "directory" : ""}
        onValueChange={(v) => setDirectoryOpen(v === "directory")}
      >
        <AccordionItem value="directory">
          <AccordionTrigger className="text-base">
            Browse all {memberCount.toLocaleString()} members
            {directoryFilter ? (
              <span className="ml-3 inline-flex items-center gap-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                Filtered:&nbsp;{CHANGE_STREAM_META[directoryFilter.stream].label}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDirectoryFilter(null);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Clear filter"
                >
                  ×
                </button>
              </span>
            ) : null}
          </AccordionTrigger>
          <AccordionContent>
            <UsersDirectoryClient />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `AccessAnalysisPage`**

Append below the 4-card grid:

```tsx
import { DirectoryAccordion } from "./DirectoryAccordion";
// ...
<DirectoryAccordion />
```

- [ ] **Step 3: Visual verify**

Flag on, restart, visit `/users`. Expected:
- Bottom of page shows "▸ Browse all 1,212 members" trigger.
- Clicking expands the existing directory table inline.
- Clicking "See all changes →" on any card auto-expands the accordion AND scrolls to it AND shows a "Filtered: <stream>" chip in the header.

Note: the chip is purely informational in this task — the actual row filtering inside `UsersDirectoryClient` based on `directoryFilter` is **out of scope** for this initial cutover (the table already has its own filter bar; the chip just signals which card the user came from). If filter pass-through becomes required, file as a follow-up task.

- [ ] **Step 4: Reset flag, commit**

```bash
git add app/\(dashboard\)/users/access-analysis/DirectoryAccordion.tsx app/\(dashboard\)/users/access-analysis/AccessAnalysisPage.tsx
git commit -m "feat(access-analysis): collapsible directory accordion"
```

---

## Phase 7 — Cutover and cleanup

### Task 7.1: Audit `findingsContext` + `selectionContext` for surviving consumers

**Files:**
- Inspect: `app/(dashboard)/users/dashboard/findingsContext.tsx`
- Inspect: `app/(dashboard)/users/dashboard/selectionContext.tsx`

- [ ] **Step 1: Find consumers of these contexts**

Run:
```bash
cd C:\LECG\Dashboard
grep -rln "useFindings\|FindingsProvider\|useSelection\|SelectionProvider" app/ components/ | grep -v "users/dashboard/"
```

Expected result determines next step:
- **If no results outside `users/dashboard/`**: both contexts are only consumed by the soon-to-be-deleted dashboard. Delete them in Task 7.2.
- **If results in `DashboardSidePanel.tsx` only**: `DashboardSidePanel` is reused. Audit whether those calls are load-bearing or vestigial. If they only read empty findings (degrading gracefully), strip the calls and delete the contexts.
- **If results elsewhere**: do NOT delete; the contexts are part of the directory drill-down. Skip Task 7.2 and add a note in the commit.

- [ ] **Step 2: Document findings inline**

Run `git status` and add a one-line note to the next commit message describing what was found.

---

### Task 7.2: Delete dashboard widget files

**Files (all deleted):**
- `app/(dashboard)/users/dashboard/DashboardClient.tsx`
- `app/(dashboard)/users/dashboard/widgetRegistry.ts`
- `app/(dashboard)/users/dashboard/useWidgetOrder.ts`
- `app/(dashboard)/users/dashboard/SortableWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/CoverageDonutWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/ActiveUserTiersWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/KpiStripWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/RecommendationsWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/RolesModulesHeatmapWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/OutlierCombosWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/RoleRelationshipFlowWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/FolderPermissionsWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/RecentlyAddedWidget.tsx`
- `app/(dashboard)/users/dashboard/widgets/AdminAccessWidget.tsx`
- (Optional, depending on Task 7.1 audit) `app/(dashboard)/users/dashboard/findingsContext.tsx`
- (Optional, depending on Task 7.1 audit) `app/(dashboard)/users/dashboard/selectionContext.tsx`

- [ ] **Step 1: Verify nothing outside `app/(dashboard)/users/dashboard/` imports any of these files**

Run:
```bash
cd C:\LECG\Dashboard
for f in DashboardClient widgetRegistry useWidgetOrder SortableWidget CoverageDonutWidget ActiveUserTiersWidget KpiStripWidget RecommendationsWidget RolesModulesHeatmapWidget OutlierCombosWidget RoleRelationshipFlowWidget FolderPermissionsWidget RecentlyAddedWidget AdminAccessWidget; do
  echo "=== $f ==="
  grep -rln "$f" app/ components/ lib/ server/ | grep -v "users/dashboard/" | grep -v ".test."
done
```
Expected: all sections empty. Any external consumer = a bug; resolve before deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm app/\(dashboard\)/users/dashboard/DashboardClient.tsx
git rm app/\(dashboard\)/users/dashboard/widgetRegistry.ts
git rm app/\(dashboard\)/users/dashboard/useWidgetOrder.ts
git rm app/\(dashboard\)/users/dashboard/SortableWidget.tsx
git rm -r app/\(dashboard\)/users/dashboard/widgets/
# Conditionally — only if Task 7.1 cleared them:
# git rm app/\(dashboard\)/users/dashboard/findingsContext.tsx
# git rm app/\(dashboard\)/users/dashboard/selectionContext.tsx
```

The `app/(dashboard)/users/dashboard/page.tsx` redirect file from Task 1.3 stays in place. `DashboardSidePanel.tsx` stays in place (used by directory accordion).

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -30`
Expected: no errors. If TypeScript complains about missing imports, find the importing file and unhook it (it should be one of the now-deleted dashboard files — re-run Step 1).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(access-analysis): remove legacy widget board

Deletes 10 widget files + drag-and-drop infrastructure. Decision-useful pieces
(KPI numbers, recently-added, admin access) now live in the new KpiStrip and
ChangeStreamCard components. /users/dashboard route preserved as 308 redirect
to /users (Task 1.3).

Findings/Selection contexts: [INSERT result of Task 7.1 audit]."
```

---

### Task 7.3: Smoke-test the full flow with flag on

- [ ] **Step 1: Enable flag**

In `.env`, set: `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1`

- [ ] **Step 2: Restart dev server**

```bash
npm run dev
```

- [ ] **Step 3: Manual UAT checklist**

Open `http://localhost:3000/users` and verify each row:

| Check | Expected |
|---|---|
| Page title | "Access Analysis" |
| Sub-line | "How access is changing over time." |
| Window selector top-right | 30 days / 90 days / 1 year / All time — clickable, default 30 days |
| KPI strip | 4 cards: Members ≈ 1212, Access changes, Active admins, Stale members |
| Switching window | KPIs and chart re-fetch; values change |
| Hero chart | Stacked area, 4 colored layers, legend at bottom; legend toggles work |
| Drill-down cards | 4 cards in 2×2 grid (membership / permission / project / admin) |
| Sparkline in each card | Renders with stream color |
| Headline event | Shows text when data exists, empty state otherwise |
| "See all changes →" | Scrolls to and opens directory accordion + shows filter chip |
| Directory accordion | Collapsed by default with member count |
| Expanding accordion | Full UsersDirectoryClient renders inside; row click opens DashboardSidePanel |
| `/users/dashboard` URL | 307 redirects to `/users` |
| Sidebar | One entry under "Organization": **Access Analysis** |

- [ ] **Step 4: If any check fails**

Don't proceed. Create a follow-up task describing the failure, fix it, and re-run the checklist before continuing.

- [ ] **Step 5: Reset flag for now**

Set `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=` (empty) in `.env`. (Phase 8 flips it permanently.)

- [ ] **Step 6: Commit the .env state** (only if `.env` is tracked; if `.env` is in `.gitignore`, skip)

```bash
git status .env
# If tracked:
git add .env && git commit -m "chore: keep access-analysis flag off until backfill verified"
```

---

## Phase 8 — Production rollout

### Task 8.1: Verify backfill threshold, flip flag

- [ ] **Step 1: Confirm tonight's backfill ran**

Run:
```bash
ls -la C:\LECG\Dashboard\logs\dc-backfill-730d-*.log
```
Expected: a log file dated 2026-05-13 evening or 2026-05-14 morning. Tail the log:

```bash
Get-Content C:\LECG\Dashboard\logs\dc-backfill-730d-*.log -Tail 30
```
Expected: "RUN COMPLETE" line with `Batches OK: 9` (or close to it).

- [ ] **Step 2: Check `AccActivity` admin-event volume**

```bash
node --env-file=.env -e "
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL, max: 2 }) });
(async () => {
  const total = await p.accActivity.count();
  const admin = await p.\$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM \"AccActivity\" WHERE LOWER(\"rawAction\") LIKE \\'%role%\\' OR \"sourceFile\" = \\'admin\\'');
  console.log({ total, admin });
  await p.\$disconnect();
})();
"
```

**Threshold gate:** if `admin >= 50`, proceed. Otherwise the admin layer of the hero chart will look skeletal — pause rollout and decide whether to ship anyway or wait for more data.

- [ ] **Step 3: Flip the flag**

In `.env`, set `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1`.

In `.env.example`, leave default unset (the production override is the responsibility of `.env`).

- [ ] **Step 4: Restart the local server**

```bash
npm run dev
```

- [ ] **Step 5: Final smoke test** — re-run Task 7.3 Step 3 checklist.

- [ ] **Step 6: Commit and tag**

```bash
git add .env
git commit -m "feat(access-analysis): enable new tab in production"
git tag access-analysis-v1
```

- [ ] **Step 7: Update memory**

Add or update a memory entry:

```bash
# Append to C:\Users\luis.cortes\.claude\projects\C--LECG-Dashboard\memory\MEMORY.md:
# - [Access Analysis tab](project_access_analysis_v1.md) — Unified /users tab shipped 2026-05-14. Replaces legacy widget board; old /users/dashboard route 308-redirects.
```

---

## Self-review notes

**Spec coverage check:**

| Spec section | Tasks |
|---|---|
| Single route + 308 redirect | 1.3 |
| Feature flag | 1.2, 7.3, 8.1 |
| Hero chart with 4 layers + empty-window line | 4.1, 4.2 |
| KPI strip (4 cards) | 2.5, 3.3 |
| Time-window selector | 3.2 |
| 4 narrative drill-down cards | 5.1 |
| Headline-event ranking | 2.2, 2.4 |
| Directory accordion | 6.1 |
| Sidebar nav cleanup | 1.5 |
| Component deletion | 7.1, 7.2 |
| Backfill dependency / threshold | 8.1 |

**Open spec question reconciliation:** the four open questions in the spec (custom date picker, stale-members definition, accordion state persistence, headline-event bias) ship with their drafted defaults. If Luis revises any during Phase 7.3 UAT, file as follow-up tasks rather than blocking the ship.

**Known risk:** the `accActivity.getTimeline` classifier (Task 2.3) assumes specific `rawAction` strings. If the DC CSVs use a different naming convention than expected, the classifier will mis-bucket events. The smoke test in Task 8.1 Step 2 partially guards against this by counting admin events. If admin volume is suspiciously low (e.g., < 20 even after backfill), inspect actual `rawAction` distinct values:

```bash
node --env-file=.env -e "
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL, max: 2 }) });
(async () => {
  const r = await p.\$queryRawUnsafe('SELECT \"rawAction\", COUNT(*)::int FROM \"AccActivity\" GROUP BY 1 ORDER BY 2 DESC LIMIT 30');
  console.log(r);
  await p.\$disconnect();
})();
"
```
…and update the classifier in Task 2.3 / 2.4 to match.
