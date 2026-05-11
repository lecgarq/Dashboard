# Phase 4: ACC Access Analysis Dashboard - Research

**Researched:** 2026-05-08
**Domain:** Single-page analytics dashboard (charts + diagrams + tables) over ACC snapshot data and Google Workspace directory
**Confidence:** HIGH (stack/integration), MEDIUM (Workspace scope flow), HIGH (existing-code reuse)

> **Phase scope was REPLACED.** Original ANAL-01..ANAL-04 (graph-overlay duplicate flagging, on-graph inconsistent-access highlight, PNG export of graph view, CSV export from graph filter state) are NOT delivered here. Per CONTEXT.md, this phase ships an ACC Access Analysis Dashboard (working name `DASH-*` requirement family). REQUIREMENTS.md needs reconciliation during planning.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Junk-role criteria (tiered):**
- HIGH/MEDIUM/LOW priority based on count of signals fired (3/2/1)
- Signals: (1) zero members assigned, (2) zero modules granted, (3) all members inactive >90d
- "Inactive" = `lastSignIn` older than 90 days for every member of the role (`lastSignIn` already plumbed via Phase 2.5, commit `6cb648c`)

**Duplicate-role criteria:**
- Trigger requires BOTH identical module entitlements AND similar role names
- Name similarity: normalized + token-overlap ≥ 80%
  - Normalize: lowercase, strip punctuation, split on whitespace/dashes
  - Compare token sets (handles "BIM Coordinator" ≈ "Coordinator BIM"; catches typos like "Architect" vs "Architecto")
- Surface as ranked pairs by overlap %

**Unusual module combinations:**
- Statistical outlier = module sets held by <5% of members
- No manual rule curation — fully data-driven

**Active user tiers:**
- Tiered display: 7d / 30d / 90d / >90d buckets, plus separate "Never signed in" tier for null `lastSignIn`
- Stacked bar visualization

**Recently-added widget:**
- Configurable timeframe toggle: 7d / 30d / 90d (default 30d)
- Based on member-creation date or ACC join date (researcher must confirm field availability — see Open Questions)

**Admin-access widget:**
- ACC account-level admins ONLY (the explicit ACC Admin API role flag)
- Excludes project admins and shadow admins

**ACC coverage (Workspace ↔ ACC overlap):**
- Master list source: Google Workspace directory via Admin SDK
- Comparison key: email
- Three-segment donut: `In both` / `In Workspace, missing from ACC` / `In ACC, missing from Workspace`
- "Missing from ACC" segment is the actionable to-do list

**Finding scope:**
- Default lens: account-level (across whole org)
- Drill-down: clicking a finding scopes view to affected projects in side panel

**Page layout:**
- Dashboard grid with drag-and-drop widget reordering
- Above-the-fold: Coverage donut + Active-user tier breakdown (population context, not action items)
- Default order:
  1. Coverage donut + Active-user tiers
  2. KPI strip (totals + finding counts) — full-width
  3. Recommendations widget (junk/duplicate findings)
  4. Roles × Modules entitlement matrix — full-width
  5. Outlier module combinations
  6. Project drill-down / per-project view
  7. Recently-added members
  8. Admin-access list
- Density: 2-column at 1280px, generous whitespace, half-width charts; matrix + KPI strip full-width

**Decision-support surface:**
- BOTH a recommendations widget AND inline severity badges across other charts
- Drill-down on click: side panel slides from right (members affected, modules involved, projects impacted, suggested action, raw data table) — no nav away from dashboard
- READ-ONLY: no ack/ignore/done state, no DB schema for tracking; recommendations refresh every load

**Export:** CSV per widget (every chart/table has a Download CSV button). Recommendations widget exports `Type, Severity, Roles, Members, Modules, SuggestedAction`. NO PDF (deferred).

**Library allocation (LOCKED):**
- **Nivo** — Coverage donut + Active-user tier breakdown (above-the-fold; aesthetics)
- **ECharts** (`echarts-for-react`) — Roles × Modules entitlement heatmap (large/dense data; built-in zoom + tooltip)
- **React Flow** (`@xyflow/react`) — Role-relationship / consolidation-suggestion diagram (interactive node-edge with overlap edges, custom styling, drag/zoom)
- **shadcn Table + Card** — Recommendations widget, missing-users list, KPI tiles, recently-added list

### Claude's Discretion

- Drag/drop library: `react-grid-layout` vs `dnd-kit` (RECOMMEND: **`@dnd-kit/sortable` already in `package.json` v10.0.0** — no new dep; see Standard Stack)
- Persistence layer for widget order: localStorage vs DB (RECOMMEND: **localStorage** unless cross-device sync is essential; user said default to localStorage)
- Severity color palette (HIGH / MEDIUM / LOW)
- Side-panel animation/transition (project already has `framer-motion@12` and shadcn `sheet`)
- Empty-state design per widget
- Loading-skeleton design (project has `components/ui/skeleton.tsx` and `page-skeleton.tsx`)
- Tooltip styling and content depth on Nivo / ECharts charts
- Refresh cadence: cron vs manual button vs on-mount (RECOMMEND: on-mount + manual "Refresh" button, mirror existing AccAnalysisPanel pattern)
- Error states (Workspace API down, ACC stale, etc.)

### Deferred Ideas (OUT OF SCOPE)

- Acting on recommendations from the dashboard (delete role, bulk-reassign) — would be separate "remediation" phase requiring write-side ACC API + audit log
- Recommendation tracking state (ack / ignore / done with persistence)
- PDF report export
- Per-user widget-order sync across devices
- Mobile / narrow-screen layout (desktop-first)
- **Original Phase 4 scope (ANAL-01..04)**: graph-overlay duplicate flagging, on-graph inconsistent-access highlighting, PNG export of graph view
</user_constraints>

<phase_requirements>
## Phase Requirements

> Original ANAL-01..ANAL-04 are deferred. Proposed `DASH-*` IDs are listed below; planner should propose final IDs to add to REQUIREMENTS.md and mark ANAL-01..04 as Deferred (or rewritten).

| Proposed ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Coverage donut shows three-segment overlap of Google Workspace directory vs ACC members by email | Google directory.readonly scope ALREADY granted at sign-in (oauth.ts line 11). Need server router + Nivo Pie. See "Workspace Integration" pattern. |
| DASH-02 | Active-user tier stacked bar — 7d/30d/90d/>90d/Never buckets driven by `lastSignIn` | `lastSignIn` already on `BulkAccUser` (acc-types.ts:25; Phase 2.5 commit `6cb648c`). Pure date math + Nivo Bar. |
| DASH-03 | Junk-role tiered findings (HIGH/MEDIUM/LOW priority) per locked criteria | Existing `analyzeCompactionCandidates` (lib/acc/compactionAnalysis.ts) detects junk-roles but with binary threshold + different signals. Must be REWRITTEN per criteria, not extended. |
| DASH-04 | Duplicate-role detection by identical-modules + ≥80% token-overlap name similarity | Existing detector uses different criteria (same role across multiple projects). Need new pure module + Vitest tests. |
| DASH-05 | Unusual module combinations — sets held by <5% of members | New analytic; pure data transform from `BulkAccUser.allModules`. |
| DASH-06 | Recently-added widget with 7d/30d/90d toggle | Researcher confirms field: see Open Q1 (`syncedAt` on `BulkAccUser` is sync timestamp, NOT ACC join date — need Admin API field). |
| DASH-07 | Admin-access list of ACC account-level admins only | NOT YET PLUMBED in `BulkAccUser`. Only `projectAdmin` flag exists (acc-admin.ts:241). Wave 0 must extend ACC ingest pipeline. |
| DASH-08 | Roles × Modules entitlement heatmap | ECharts heatmap; data derived from `BulkAccUser.projects[].roles/modules`. |
| DASH-09 | Recommendations widget combining DASH-03 + DASH-04 findings with severity badges | shadcn Card + Table. Drives both the widget and inline badges in other charts via shared `findings` slice. |
| DASH-10 | Side panel drill-down (members/modules/projects/suggested action) | Reuse pattern from `AccUserSidePanel.tsx`; shadcn `sheet` + framer-motion. |
| DASH-11 | Drag-reorderable widget grid with localStorage persistence | `@dnd-kit/sortable@10.0.0` already installed. |
| DASH-12 | Per-widget CSV export (Download CSV button) | Use `xlsx@0.20.3` (already installed) `XLSX.utils.json_to_sheet` + `sheet_to_csv` OR plain `Blob` + RFC4180 escape. |
| DASH-13 | Recommendations CSV with `Type, Severity, Roles, Members, Modules, SuggestedAction` | Same export plumbing as DASH-12. |

**Original ANAL IDs status:** ANAL-01..ANAL-04 should be marked Deferred in REQUIREMENTS.md (planner to confirm).
</phase_requirements>

## Summary

This is a single-page analytics dashboard built on top of an already-mature ACC data layer. The `BulkAccUser[]` aggregate (server `users.bulkAccSummary` query, populated from `accMemberCache` table) already supplies `allRoles`, `allModules`, `projects[].roles/modules`, `projectAdmin` flag, `companyRole`, and `lastSignIn`. Two pieces are NOT plumbed and require Wave 0 data work: **ACC account-level admin flag** (DASH-07) and **member creation/join date** (DASH-06). Everything else is presentation-layer transformation of data that already exists.

The locked library allocation is well-supported: Nivo `0.99.0`, `echarts-for-react@3.0.6` (React 19 compatible), `@xyflow/react@12.10.2` (React 19 compatible), and shadcn primitives all coexist cleanly. `@dnd-kit/sortable@10.0.0` is already in `package.json` and is the standard solution for drag-reorderable card grids — no need for `react-grid-layout` (which targets a different problem: free-form 2D resize-and-drag layouts; `dnd-kit/sortable` is correct for ordered card lists in flex/grid).

Workspace integration is dramatically simpler than CONTEXT.md anticipated: the project's NextAuth Google provider already requests `https://www.googleapis.com/auth/directory.readonly` (`lib/google/oauth.ts:11`) — the People API directory scope, NOT the Admin SDK. This scope works for any Workspace user and lists colleagues in their domain, no admin consent flow needed. Use the People API `people.listDirectoryPeople` endpoint with `readMask=emailAddresses,names`. If domain-wide enumeration is needed (e.g., for a tenant with the user not in directory), the Admin SDK path requires separate consent — but for "compare ACC vs my Workspace contacts" the People API is sufficient.

**Primary recommendation:** Build a new top-level dashboard route at `app/(dashboard)/users/dashboard/page.tsx` (or a new tab next to `AccAnalysisPanel`); add three new server tRPC procedures (`getWorkspaceDirectory`, `getRecentMembers`, `getAccountAdmins`) and one rewrite of `analyzeCompactionCandidates` into a new `lib/acc/dashboardAnalytics.ts` containing pure functions covering DASH-03/04/05; compose widgets via `@dnd-kit/sortable` with localStorage-persisted order; route findings through a single shared store so inline badges and the recommendations widget consume one source of truth.

## Standard Stack

### Core (locked by user)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nivo/core` + `@nivo/pie` + `@nivo/bar` | `0.99.0` | Coverage donut + active-user tier stacked bar | Locked by user — aesthetics for above-the-fold; React 19 compatible |
| `echarts-for-react` | `^3.0.6` | Roles × Modules heatmap (dense interactive matrix) | Locked by user; React 16-19 supported; built-in zoom/tooltip; published 4 months ago (active) |
| `@xyflow/react` | `^12.10.2` | Role-relationship / consolidation diagram | Locked by user; React 19 native (Oct 2025 release); replaces deprecated `reactflow` package name |
| `@dnd-kit/sortable` | `^10.0.0` (already installed) | Drag-reorder of widget grid | Already in `package.json`; idiomatic ordered-list reordering on top of `@dnd-kit/core` |

### Supporting (already installed — no new deps)

| Library | Version | Purpose | Use Case |
|---------|---------|---------|----------|
| `framer-motion` | `^12.35.0` | Side-panel slide animation | Wrap `Sheet` content for entrance |
| `radix-ui` (via shadcn) | `^1.4.3` | `Sheet`, `Card`, `Table`, `Badge`, `Tabs`, `Dialog` | All present in `components/ui/`; reuse |
| `lucide-react` | `^0.575.0` | Icons (severity, drag handles, download) | Already used throughout app |
| `xlsx` | `0.20.3` | CSV/XLSX export | `XLSX.utils.json_to_sheet` + `sheet_to_csv` for DASH-12/13 |
| `googleapis` | `^171.4.0` | Google People API client for Workspace directory | Already installed for Gmail/Chat/Calendar |
| `zod` | `^4.3.6` | tRPC input validation for new procedures | Project standard |
| `@tanstack/react-query` | `^5.90.21` (via tRPC) | Client cache for dashboard queries | Used everywhere in app |
| `vitest` | `^4.1.5` | Unit tests for analytics pure modules | `accGraphFilters.test.ts` and `cosmosUtils.test.ts` precedent |
| `date-fns` | `^4.1.0` | Active-user tier bucketing (`differenceInDays`) | Already installed |

**Installation needed:**
```bash
npm install @nivo/core@0.99.0 @nivo/pie@0.99.0 @nivo/bar@0.99.0 echarts echarts-for-react@3.0.6 @xyflow/react@12.10.2
```

### Alternatives Considered (and rejected)

| Instead of | Could Use | Why Rejected |
|------------|-----------|----------|
| `@dnd-kit/sortable` | `react-grid-layout` | RGL solves free-form 2D draggable + resizable grids (Trello/Notion-style canvas). The user's spec is an ordered card list with two-column flow — `dnd-kit/sortable` is the right fit and is already installed. RGL would add ~80KB and introduce its own coordinate system. |
| Per-user DB widget order | localStorage | User explicitly preferred localStorage; no schema/migration cost; matches existing `acc-graph-view` pattern (Phase 1 P03). |
| New CSV utility | Plain `Blob` + manual escape | Project already includes `xlsx`; cheap to use and handles RFC4180 escapes, BOM for Excel. |
| Admin SDK Directory API | People API `directory.readonly` | Already-granted scope. Admin SDK requires Workspace admin consent + domain-wide delegation — heavy. |

## Architecture Patterns

### Recommended File Structure

```
app/(dashboard)/users/
├── dashboard/                       # NEW — Phase 4 surface
│   ├── page.tsx                     # Server component shell, auth, layout
│   ├── DashboardClient.tsx          # Client root: dnd-kit context + widget grid + side panel
│   ├── widgets/
│   │   ├── CoverageDonutWidget.tsx          # Nivo Pie (DASH-01)
│   │   ├── ActiveUserTiersWidget.tsx        # Nivo Bar stacked (DASH-02)
│   │   ├── KpiStripWidget.tsx               # shadcn Cards (DASH-09 totals)
│   │   ├── RecommendationsWidget.tsx        # shadcn Table + Badge (DASH-03/04/09)
│   │   ├── RolesModulesHeatmapWidget.tsx    # ECharts (DASH-08)
│   │   ├── OutlierCombosWidget.tsx          # ECharts or shadcn Table (DASH-05)
│   │   ├── RoleRelationshipFlowWidget.tsx   # @xyflow/react (DASH-04 visualization)
│   │   ├── RecentlyAddedWidget.tsx          # shadcn Table (DASH-06)
│   │   └── AdminAccessWidget.tsx            # shadcn Table (DASH-07)
│   ├── DashboardSidePanel.tsx       # Drill-down sheet (DASH-10)
│   ├── widgetRegistry.ts            # id → component map + default order
│   └── useWidgetOrder.ts            # localStorage hook (DASH-11)
│
lib/acc/
├── dashboardAnalytics.ts            # NEW — pure functions for DASH-03/04/05
├── dashboardAnalytics.test.ts       # Vitest coverage (Wave 0)
├── nameSimilarity.ts                # NEW — token-overlap normalize+compare
├── nameSimilarity.test.ts
├── activeUserTiers.ts               # NEW — date bucketing
└── csvExport.ts                     # NEW — shared CSV download helper

server/routers/users.ts              # ADD: getAccountAdmins, getRecentMembers
server/routers/workspace.ts          # NEW — getWorkspaceDirectory (People API)
```

### Pattern 1: Pure-Function Analytics Module (Vitest-Testable)

**What:** All findings logic lives in `lib/acc/*.ts` as pure synchronous functions over `BulkAccUser[]`. The widget renders the result; the function is unit-testable. Mirrors precedent in `lib/acc/compactionAnalysis.ts` and `app/(dashboard)/users/accGraphFilters.ts`.

**When to use:** All four DASH analytics (junk roles, duplicate roles, outlier combos, active tiers).

**Example (signature pattern, mirroring `analyzeCompactionCandidates`):**
```typescript
// lib/acc/dashboardAnalytics.ts
import type { BulkAccUser } from "./acc-types";

export type Severity = "HIGH" | "MEDIUM" | "LOW";

export interface JunkRoleFinding {
  role: string;
  severity: Severity;        // HIGH=3 signals, MEDIUM=2, LOW=1
  signals: {
    zeroMembers: boolean;
    zeroModules: boolean;
    allInactive90d: boolean;
  };
  affectedMembers: string[]; // emails
  affectedProjects: string[];
}

export interface DuplicateRoleFinding {
  roleA: string;
  roleB: string;
  moduleOverlap: 1.0;        // by spec: identical modules required
  nameOverlap: number;       // >= 0.80 by spec
  affectedMembers: string[];
  affectedProjects: string[];
}

export function findJunkRoles(users: BulkAccUser[], now: Date): JunkRoleFinding[] { /* ... */ }
export function findDuplicateRoles(users: BulkAccUser[]): DuplicateRoleFinding[] { /* ... */ }
export function findOutlierModuleCombos(users: BulkAccUser[], thresholdPct = 0.05): OutlierFinding[] { /* ... */ }
```

### Pattern 2: dnd-kit Sortable Widget Grid

**What:** Use `<DndContext>` + `<SortableContext strategy={rectSortingStrategy}>`. Each widget wraps its card in `useSortable({ id })` and applies `transform`/`transition` to its style.

**When to use:** Top-level layout grid (DASH-11).

**Example:**
```typescript
// DashboardClient.tsx
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableWidget({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

export function DashboardClient() {
  const [order, setOrder] = useWidgetOrder(); // localStorage-backed
  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={(e) => {
        if (e.over && e.active.id !== e.over.id) {
          setOrder(arrayMove(order, order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id))));
        }
      }}
    >
      <SortableContext items={order} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {order.map((id) => <SortableWidget key={id} id={id}>{renderWidget(id)}</SortableWidget>)}
        </div>
      </SortableContext>
    </DndContext>
  );
}
```

### Pattern 3: Shared Findings Store → Inline Badges + Widget

**What:** Compute findings ONCE at the page level, pass via React context (or prop drill) into both the `RecommendationsWidget` AND every widget that renders inline severity badges (heatmap cells, role-flow nodes, etc.). Single source of truth prevents drift.

**Why:** User wants both surfaces (recommendations + inline badges). Computing twice risks divergence.

```typescript
// lib/acc/dashboardAnalytics.ts
export interface DashboardFindings {
  junkRoles: JunkRoleFinding[];
  duplicateRoles: DuplicateRoleFinding[];
  outlierCombos: OutlierFinding[];
  /** Quick lookup: role name → highest severity */
  roleSeverityIndex: Map<string, Severity>;
}
export function computeAllFindings(users: BulkAccUser[], now = new Date()): DashboardFindings { /* ... */ }
```

### Pattern 4: Side Panel Drill-Down (reuse existing)

**What:** A right-side slide-in panel. Project already has `AccUserSidePanel.tsx` (171-line shadcn `Sheet`-based component) — adapt that pattern to `DashboardSidePanel` taking a `selectedFinding` instead of a user.

### Anti-Patterns to Avoid

- **Computing findings inside each widget.** Causes O(N×widgets) work and inevitable drift. Compute once at page level.
- **Storing widget order on `BulkAccUser` or in tRPC.** localStorage is sufficient and matches user direction.
- **Putting all charts on `BulkAccUser` directly without memoization.** Hub has 25k+ nodes; each widget needs `useMemo` over the source array.
- **Hand-rolling string similarity.** Use the simple normalize+token-Jaccard described below; resist temptation to import `string-similarity` or Levenshtein libs (over-engineering for the locked spec).
- **Triggering ACC re-sync from the dashboard.** Dashboard reads cached data only; sync stays on `AccAnalysisPanel`'s "Sync All to ACC" button.
- **Putting `directory.users.list` (Admin SDK) calls in.** The People API scope is what's already granted; using Admin SDK would require new consent flow.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV escaping (commas, quotes, newlines) | Custom string concat | `xlsx` `XLSX.utils.json_to_sheet(rows)` + `XLSX.utils.sheet_to_csv(ws, { FS: ",", RS: "\n" })` | Already installed; handles RFC4180 + Excel BOM |
| Drag-and-drop reordering | Custom HTML5 DnD wiring | `@dnd-kit/sortable` `useSortable` + `arrayMove` | Already installed; handles a11y, keyboard, touch |
| Donut/pie chart rendering | SVG arcs hand-drawn (`AccOverviewTab.tsx` has one — DON'T copy that pattern further) | `@nivo/pie` | Locked; `Pie` provides motion, legends, click handlers, tooltips |
| Heatmap with cell tooltips + zoom | Manual `<canvas>` or SVG matrix | `echarts-for-react` `<ReactECharts>` heatmap series | Locked; built-in dataZoom + visualMap + tooltip |
| Side-panel sheet | Custom drawer | shadcn `Sheet` (`components/ui/sheet.tsx`) | Already in app, used by `AccUserSidePanel.tsx` |
| Date-bucket math (7d/30d/90d) | Manual `Date.getTime() - …` | `date-fns` `differenceInDays(now, parseISO(lastSignIn))` | Already installed; readable; handles invalid dates |
| Workspace user listing | Direct `fetch` against People API | `googleapis` package `google.people('v1').people.listDirectoryPeople` | Already installed; handles auth refresh via existing token plumbing |
| Stacked bar chart | Custom rects | `@nivo/bar` with `keys=[…]` and `groupMode="stacked"` | Locked |

**Key insight:** Every problem in this phase except for the dashboard analytics formulas themselves has a pre-installed library answer. Wave 0 is mostly "wire up libraries" + "two new server endpoints" + "one new pure analytics module."

## Common Pitfalls

### Pitfall 1: Nivo client-only rendering with Next.js App Router
**What goes wrong:** Nivo charts crash during SSR ("ReferenceError: window is not defined").
**Why:** Nivo internally uses `@react-spring` and DOM measurement.
**How to avoid:** All widget files are client components (`"use client"` at top — already mandatory for charts). The `dashboard/page.tsx` server shell renders `<DashboardClient />`; no Nivo import in server scope.
**Warning signs:** Build error during `next build` mentioning `window` or `document` from inside `@nivo/*`.

### Pitfall 2: ECharts container dimensions before mount
**What goes wrong:** ECharts canvas renders 0×0 because parent has no measured height.
**Why:** ECharts measures the DOM container synchronously on mount.
**How to avoid:** Wrap chart in a div with explicit `height` (e.g., `min-height: 360px`); pass `style={{ height: 400 }}` to `<ReactECharts>`. Use `notMerge` + `lazyUpdate` props on data refresh.
**Warning signs:** Heatmap appears blank but DOM shows the canvas; resizing the window makes it appear.

### Pitfall 3: People API `directory.readonly` returns only first-page results
**What goes wrong:** Coverage donut undercounts Workspace users for orgs with >1000 directory members (default page size).
**Why:** People API `listDirectoryPeople` is paginated via `pageToken`.
**How to avoid:** Loop until `nextPageToken` is empty; cap at e.g. 10 pages = 10,000 people for safety. Server-side cache the result with TTL (Redis or in-memory) — this is the same pattern used for ACC bulk sync.
**Warning signs:** "Missing from ACC" segment way smaller than expected.
**Verification needed:** Confirm whether the People API requires `sources=DIRECTORY_SOURCE_DOMAIN_PROFILE` or `DIRECTORY_SOURCE_DOMAIN_CONTACT` — domain profile is the right one for Workspace seats.

### Pitfall 4: `lastSignIn` field is an ISO string OR null OR undefined
**What goes wrong:** Active-user tier bucketing crashes on `parseISO(undefined)` or buckets a stale-cached null user into the wrong tier.
**Why:** Phase 2.5 plumbed it as `string | null | undefined`. Older cache rows synced before 2.5 will have `undefined`. ACC's "no activity" returns `null`.
**How to avoid:** Treat both `null` and `undefined` as "Never signed in" tier. Test fixture must include all three (ISO string, null, undefined).
**Warning signs:** Tier counts don't sum to total user count.
**Reference:** `acc-types.ts` lines 22-26.

### Pitfall 5: Token-overlap name similarity false positives on short tokens
**What goes wrong:** "Architect" and "Admin" tokenize to single tokens; if both roles have identical modules, they get flagged as "duplicate" by 0% Jaccard ÷ but the algorithm short-circuits.
**Why:** Token-overlap on 1-token role names degenerates to "are the strings equal?".
**How to avoid:** Implement Jaccard as `|A ∩ B| / |A ∪ B|`; identical single-token names produce 1.0; non-identical single-token names produce 0.0. The 80% threshold then filters correctly. Add unit test for both single-token-equal and single-token-different cases.
**Warning signs:** Wrong-flagged duplicates in spot check; user sees "Architect ≈ BIM Manager" pair.

### Pitfall 6: ACC account-level admin flag is NOT plumbed
**What goes wrong:** DASH-07 (Admin Access widget) shows project admins instead of account admins because no field exists.
**Why:** `lib/server/acc-admin.ts:241-250` only captures `accessLevels.projectAdmin`; account-admin status lives at the ACC user-level (`accountAdmin: true` in the ACC Admin API user record), not the project level.
**How to avoid:** Wave 0 adds `isAccountAdmin: boolean` to `BulkAccUser` and the cache schema; extends `lib/server/acc-admin.ts` user fetcher to read the account-admin flag. **This is a data-pipeline change, not a UI change.**
**Warning signs:** Verification fails because list contains everyone with any project admin role.

### Pitfall 7: Member creation date is NOT plumbed
**What goes wrong:** DASH-06 (Recently Added) has no source field; `BulkAccUser.syncedAt` is the LAST SYNC time, not the join date.
**Why:** ACC Admin API exposes `addedOn` / `created` on the user record but it's not extracted.
**How to avoid:** Wave 0 adds `addedOn?: string | null` to `BulkAccUser` and the cache schema. If ACC doesn't expose it, fall back to "first time we saw this email in cache" as a proxy (less correct but bounded).
**Warning signs:** Recently-added widget shows everyone (because all `syncedAt` values are recent).
**See Open Q1.**

### Pitfall 8: Drag-handle vs click conflict in widget cards
**What goes wrong:** Clicking a chart inside a sortable widget triggers a drag instead of a click.
**Why:** `@dnd-kit/sortable` listeners on the wrapper intercept pointer events.
**How to avoid:** Apply `{...listeners} {...attributes}` ONLY to a dedicated drag handle (e.g., a `<GripVertical>` icon in the widget header), NOT the whole card.
**Warning signs:** Hovering tooltip never appears; chart hover behavior breaks.
**Reference:** Standard `dnd-kit` pattern — see widget header component design.

### Pitfall 9: localStorage is not in scope during SSR
**What goes wrong:** `useWidgetOrder` hook crashes during Next.js server render.
**Why:** `localStorage` is undefined on the server.
**How to avoid:** Initialize `useState` with default order; only read `localStorage` inside `useEffect`. Standard Next.js client-side-storage pattern.

### Pitfall 10: Memoization across 25k-user hub
**What goes wrong:** Every widget re-runs `findJunkRoles(users)` on every render; UI feels sluggish.
**Why:** No `useMemo` on findings.
**How to avoid:** Compute `findings = useMemo(() => computeAllFindings(users), [users])` ONCE in `DashboardClient` and pass via context. Phase 2 hub is 25,602 nodes — analytics on it is non-trivial.
**Warning signs:** React profiler shows analytics recompute on every state change; widget grid drag re-runs analytics.

## Code Examples

### Widget shell (registry + sortable wrapper)

```typescript
// app/(dashboard)/users/dashboard/widgetRegistry.ts
import { CoverageDonutWidget } from "./widgets/CoverageDonutWidget";
import { ActiveUserTiersWidget } from "./widgets/ActiveUserTiersWidget";
// ... etc

export const WIDGETS = {
  coverage: { component: CoverageDonutWidget, title: "ACC Coverage", span: "col-span-1" },
  tiers: { component: ActiveUserTiersWidget, title: "Active Users", span: "col-span-1" },
  kpi: { component: KpiStripWidget, title: "Overview", span: "col-span-2" },
  recommendations: { component: RecommendationsWidget, title: "Recommendations", span: "col-span-2" },
  heatmap: { component: RolesModulesHeatmapWidget, title: "Roles × Modules", span: "col-span-2" },
  outliers: { component: OutlierCombosWidget, title: "Unusual Access", span: "col-span-1" },
  flow: { component: RoleRelationshipFlowWidget, title: "Role Relationships", span: "col-span-2" },
  recent: { component: RecentlyAddedWidget, title: "Recently Added", span: "col-span-1" },
  admins: { component: AdminAccessWidget, title: "Account Admins", span: "col-span-1" },
} as const;

export const DEFAULT_ORDER = [
  "coverage", "tiers", "kpi", "recommendations", "heatmap", "outliers", "flow", "recent", "admins",
] as const satisfies readonly (keyof typeof WIDGETS)[];
```

### Token-overlap name similarity

```typescript
// lib/acc/nameSimilarity.ts
export function tokenize(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")  // strip punctuation, keep dashes
      .split(/[\s-]+/)
      .filter(Boolean)
  );
}

/** Jaccard token overlap: |A ∩ B| / |A ∪ B|. Returns 1.0 when both are equal, 0.0 when disjoint. */
export function nameTokenOverlap(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1.0;
  if (ta.size === 0 || tb.size === 0) return 0.0;
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return intersection / union;
}

export const DUPLICATE_ROLE_NAME_THRESHOLD = 0.80;
```

### Server-side People API directory list

```typescript
// server/routers/workspace.ts (NEW)
import { google } from "googleapis";
import { router, protectedProcedure } from "../trpc";

export const workspaceRouter = router({
  getDirectory: protectedProcedure.query(async ({ ctx }) => {
    const account = await ctx.db.account.findFirst({
      where: { userId: ctx.session.user.id, provider: "google" },
      select: { refresh_token: true, access_token: true, scope: true },
    });
    if (!account?.refresh_token) {
      throw new Error("workspace_access_required");
    }
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    oauth2.setCredentials({
      refresh_token: account.refresh_token,
      access_token: account.access_token ?? undefined,
    });
    const people = google.people({ version: "v1", auth: oauth2 });

    const emails = new Set<string>();
    let pageToken: string | undefined;
    let pageCount = 0;
    do {
      const res = await people.people.listDirectoryPeople({
        readMask: "emailAddresses,names",
        sources: ["DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE"],
        pageSize: 1000,
        pageToken,
      });
      for (const p of res.data.people ?? []) {
        for (const e of p.emailAddresses ?? []) {
          if (e.value) emails.add(e.value.toLowerCase());
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
      pageCount += 1;
    } while (pageToken && pageCount < 25);
    return { emails: [...emails] };
  }),
});
```
> Source verification needed: confirm exact `sources` enum value at https://developers.google.com/people/api/rest/v1/people/listDirectoryPeople — value above is the documented one but exact string casing should be validated against `googleapis` TS types during planning.

### Coverage donut widget (Nivo)

```typescript
// app/(dashboard)/users/dashboard/widgets/CoverageDonutWidget.tsx
"use client";
import { ResponsivePie } from "@nivo/pie";
import { useMemo } from "react";

export function CoverageDonutWidget({ accEmails, workspaceEmails }: { accEmails: Set<string>; workspaceEmails: Set<string>; }) {
  const data = useMemo(() => {
    const both = [...accEmails].filter((e) => workspaceEmails.has(e)).length;
    const onlyAcc = accEmails.size - both;
    const onlyWorkspace = workspaceEmails.size - both;
    return [
      { id: "in-both", label: "In both", value: both, color: "#22c55e" },
      { id: "missing-acc", label: "In Workspace, missing ACC", value: onlyWorkspace, color: "#f59e0b" },
      { id: "missing-ws", label: "In ACC, missing Workspace", value: onlyAcc, color: "#3b82f6" },
    ];
  }, [accEmails, workspaceEmails]);
  return (
    <div style={{ height: 300 }}>
      <ResponsivePie data={data} innerRadius={0.6} colors={{ datum: "data.color" }} arcLabel={(d) => String(d.value)} />
    </div>
  );
}
```

### Active-user tier stacked bar (Nivo)

```typescript
// app/(dashboard)/users/dashboard/widgets/ActiveUserTiersWidget.tsx
"use client";
import { ResponsiveBar } from "@nivo/bar";
import { differenceInDays, parseISO } from "date-fns";
import type { BulkAccUser } from "@/lib/acc/acc-types";

const TIERS = ["7d", "30d", "90d", ">90d", "Never"] as const;

function bucket(lastSignIn: string | null | undefined, now: Date): typeof TIERS[number] {
  if (!lastSignIn) return "Never";
  const days = differenceInDays(now, parseISO(lastSignIn));
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  if (days <= 90) return "90d";
  return ">90d";
}

export function ActiveUserTiersWidget({ users }: { users: BulkAccUser[] }) {
  const counts: Record<string, number> = { "7d": 0, "30d": 0, "90d": 0, ">90d": 0, Never: 0 };
  const now = new Date();
  for (const u of users) counts[bucket(u.lastSignIn, now)]++;
  const data = [{ category: "Members", ...counts }];
  return (
    <div style={{ height: 200 }}>
      <ResponsiveBar
        data={data}
        keys={[...TIERS]}
        indexBy="category"
        groupMode="stacked"
        layout="horizontal"
        colors={["#22c55e", "#84cc16", "#f59e0b", "#ef4444", "#6b7280"]}
      />
    </div>
  );
}
```

### Roles × Modules heatmap (ECharts)

```typescript
// app/(dashboard)/users/dashboard/widgets/RolesModulesHeatmapWidget.tsx
"use client";
import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { BulkAccUser } from "@/lib/acc/acc-types";

export function RolesModulesHeatmapWidget({ users }: { users: BulkAccUser[] }) {
  const { roles, modules, matrix } = useMemo(() => {
    const r = new Set<string>(); const m = new Set<string>();
    const counts = new Map<string, number>(); // `${role}|${module}` → memberCount
    for (const u of users) {
      for (const p of u.projects) {
        for (const role of p.roles) {
          r.add(role);
          for (const mod of p.modules) {
            m.add(mod);
            const k = `${role}|${mod}`;
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
        }
      }
    }
    const roles = [...r].sort();
    const modules = [...m].sort();
    const matrix: [number, number, number][] = [];
    for (let ri = 0; ri < roles.length; ri++) {
      for (let mi = 0; mi < modules.length; mi++) {
        matrix.push([mi, ri, counts.get(`${roles[ri]}|${modules[mi]}`) ?? 0]);
      }
    }
    return { roles, modules, matrix };
  }, [users]);

  const option = {
    tooltip: { position: "top" },
    grid: { left: 120, right: 30, top: 30, bottom: 80 },
    xAxis: { type: "category", data: modules, splitArea: { show: true }, axisLabel: { rotate: 45 } },
    yAxis: { type: "category", data: roles, splitArea: { show: true } },
    visualMap: { min: 0, max: Math.max(...matrix.map((c) => c[2])), calculable: true, orient: "horizontal", left: "center", bottom: 10 },
    dataZoom: [{ type: "inside" }],
    series: [{ type: "heatmap", data: matrix, label: { show: false } }],
  };
  return <ReactECharts option={option} style={{ height: 500 }} notMerge lazyUpdate />;
}
```

### CSV export helper

```typescript
// lib/acc/csvExport.ts
import * as XLSX from "xlsx";

export function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ",", RS: "\n" });
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `reactflow` (deprecated package name) | `@xyflow/react` | Late 2024 rename | Locked: use `@xyflow/react@12.10.2` (React 19 native, Oct 2025) |
| Hand-rolled SVG donut (see `AccOverviewTab.tsx` `arcPath`) | `@nivo/pie` `<ResponsivePie>` | n/a — locked by user | Drop-in replacement for new widget; existing tab unaffected |
| Admin SDK Directory API for "list users" | People API `listDirectoryPeople` | Recommended for non-admin users since 2020 | No admin consent needed; scope already granted |
| Custom drag/drop coordinate math | `@dnd-kit/sortable` | n/a — already installed | Use `useSortable` hook, not raw DnD events |
| Free-form 2D grid (`react-grid-layout`) | Ordered-list grid (`@dnd-kit/sortable`) | Project decision | Spec calls for ordered list, not free-form canvas |

**Deprecated/outdated:**
- The `reactflow` package — superseded by `@xyflow/react`
- The `@cosmograph/react` wrapper (already noted in REQUIREMENTS.md "Out of Scope")

## Open Questions

1. **Member creation / "added on" field availability in ACC Admin API**
   - What we know: `BulkAccUser.syncedAt` is the LAST SYNC time, not the user's first appearance. The current cache and types don't expose join date.
   - What's unclear: Whether `https://developer.api.autodesk.com/hq/v1/accounts/{accountId}/users` returns a `created_at` / `addedOn` field, and whether it's already stored in the raw cache row but stripped during transform.
   - Recommendation: Wave 0 task includes a 30-min spike — log the raw ACC user payload from one fetch, identify the date field, plumb it through `BulkAccUser` and `accMemberCache.data`. Fallback: use the cache row's first-seen timestamp (less accurate; document the caveat).

2. **People API `sources` enum value casing**
   - What we know: The People API `listDirectoryPeople` requires `sources` parameter; correct value enumerates domain profiles.
   - What's unclear: Exact spelling (`DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE` vs `DIRECTORY_SOURCE_DOMAIN_PROFILE`).
   - Recommendation: Inspect the `googleapis` TS types during the first widget build (`node_modules/googleapis/build/src/apis/people/v1.d.ts`) — TypeScript will refuse the wrong literal. Single-line fix.

3. **"Identical modules" tie-breaking in duplicate-role detection**
   - What we know: Spec says trigger requires identical module entitlements AND ≥80% name overlap.
   - What's unclear: Module sets per role aggregate across projects (a role can have different modules in different projects). Is "identical" defined at the project-instance level or the role-aggregate level?
   - Recommendation: Define at the role-aggregate level (`union of all modules across all projects where this role appears`) for the FIRST pass — matches the user's mental model of "this role grants these modules." If feedback says "but in this project they're different," extend later. Document in `dashboardAnalytics.ts` JSDoc.

4. **Refresh cadence for Workspace directory query**
   - What we know: People API quota is 1500 read req/min/project — generous but not unlimited.
   - What's unclear: How often the dashboard should re-query.
   - Recommendation: Cache server-side for 1 hour (Redis `@upstash/redis` already in deps); add a "Refresh" button on the coverage widget that bypasses cache.

5. **Workspace directory empty result (user not in a Workspace tenant)**
   - What we know: Users may sign in via personal Gmail (not tied to a Workspace tenant). `listDirectoryPeople` returns empty.
   - What's unclear: UX for that case.
   - Recommendation: Treat empty `workspaceEmails` set as a "Workspace integration not available — sign in with a Workspace account to see coverage" inline message in the donut widget. Don't block the rest of the dashboard.

## Validation Architecture

> `.planning/config.json` does NOT contain `workflow.nyquist_validation` (only `workflow.research: true`). Per agent spec: skip if `false` — but since the key is absent, default to **including** a minimal section because the planner explicitly relies on Vitest precedent in this codebase.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest@^4.1.5` |
| Config file | `vitest.config.*` (inferred from `vite-tsconfig-paths` dev dep + `*.test.ts` files in `app/(dashboard)/users/`) |
| Quick run command | `npm run test -- <pattern>` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-02 | `bucket()` correctly assigns 7d/30d/90d/>90d/Never tiers | unit | `npm run test -- activeUserTiers` | ❌ Wave 0 |
| DASH-03 | `findJunkRoles` returns HIGH/MEDIUM/LOW per signal count, handles `lastSignIn` null + undefined + ISO | unit | `npm run test -- dashboardAnalytics` | ❌ Wave 0 |
| DASH-04 | `findDuplicateRoles` flags identical-modules + ≥80% token overlap; rejects single-token-different cases; handles "BIM Coordinator" ↔ "Coordinator BIM" | unit | `npm run test -- dashboardAnalytics` (same file) | ❌ Wave 0 |
| DASH-04 | `nameTokenOverlap` returns 1.0 for identical, 0.0 for disjoint, correct Jaccard for partial | unit | `npm run test -- nameSimilarity` | ❌ Wave 0 |
| DASH-05 | `findOutlierModuleCombos` flags module sets present in <5% of users | unit | `npm run test -- dashboardAnalytics` | ❌ Wave 0 |
| DASH-12/13 | `downloadCsv` produces RFC4180-escaped output with BOM | unit + manual | `npm run test -- csvExport` (programmatic via mock Blob) + manual file-open | ❌ Wave 0 |
| DASH-01 | Coverage donut renders three segments matching set arithmetic | manual | smoke test (open page, count segments) | manual-only — Nivo render |
| DASH-07 | Account-admin list excludes project-only admins | unit | `npm run test -- dashboardAnalytics::isAccountAdmin` | ❌ Wave 0 |
| DASH-11 | Drag reorder persists to localStorage and survives reload | manual + unit | `useWidgetOrder` hook unit test (mock localStorage) + manual reload | ❌ Wave 0 (hook test) |
| DASH-10 | Side panel opens with correct finding payload | manual | smoke test | manual-only |

### Sampling Rate
- **Per task commit:** `npm run test -- <module-under-edit>` (sub-second feedback for analytics)
- **Per wave merge:** `npm run test` (full suite)
- **Phase gate:** Full Vitest suite green + `npm run build` green + manual UAT of dashboard before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `lib/acc/dashboardAnalytics.test.ts` — covers DASH-03, DASH-04, DASH-05, DASH-07
- [ ] `lib/acc/nameSimilarity.test.ts` — covers DASH-04 token-overlap edge cases
- [ ] `lib/acc/activeUserTiers.test.ts` — covers DASH-02 bucket boundaries (7d, 30d, 90d, null, undefined)
- [ ] `lib/acc/csvExport.test.ts` — covers DASH-12 escaping (commas, quotes, newlines, unicode)
- [ ] `app/(dashboard)/users/dashboard/useWidgetOrder.test.ts` — DASH-11 localStorage persistence (jsdom + mock)
- [ ] **Data-pipeline Wave 0:** Plumb `isAccountAdmin: boolean` through `lib/server/acc-admin.ts` user fetcher → `accMemberCache.data` JSON → `BulkAccUser` (DASH-07 prerequisite)
- [ ] **Data-pipeline Wave 0:** Plumb `addedOn: string | null` (or document fallback) (DASH-06 prerequisite — see Open Q1)

## Sources

### Primary (HIGH confidence)
- `app/(dashboard)/users/AccAnalysisPanel.tsx` (170 lines) — existing tab pattern, sub-tab switcher, sync flow, side-panel state model
- `app/(dashboard)/users/AccOverviewTab.tsx` (700 lines) — existing chart-rendering precedent (hand-rolled SVG donut to be replaced)
- `app/(dashboard)/users/AccRolesTab.tsx` (345 lines) — existing role-index aggregation pattern
- `app/(dashboard)/users/AccUserSidePanel.tsx` — existing shadcn Sheet drill-down precedent
- `app/(dashboard)/users/accGraphFilters.ts` + `accGraphFilters.test.ts` — pure-module + Vitest precedent
- `lib/acc/compactionAnalysis.ts` (128 lines) — existing analytics module precedent (criteria differ from new spec; rewrite, don't extend)
- `lib/acc/acc-types.ts` — `BulkAccUser` shape including `companyRole?: string | null`, `lastSignIn?: string | null`
- `lib/server/acc-admin.ts:241-250` — confirms only `projectAdmin` flag is currently captured (DASH-07 gap)
- `lib/google/oauth.ts:11` — confirms `https://www.googleapis.com/auth/directory.readonly` already in default Google scope
- `server/auth.ts:38` — confirms scope is requested at sign-in
- `server/routers/users.ts:904-1007` — `bulkAccSummary` data shape, including `companyRole`/`lastSignIn` already wired through
- `server/routers/gmail.ts` — tRPC + googleapis OAuth credential pattern to mirror for Workspace directory router
- `package.json` — confirms presence of `@dnd-kit/sortable@^10.0.0`, `framer-motion@^12.35.0`, `xlsx@0.20.3`, `googleapis@^171.4.0`, `radix-ui@^1.4.3`, `vitest@^4.1.5`, `react@19.2.3`

### Secondary (MEDIUM confidence)
- [npm: @nivo/bar — 0.99.0](https://www.npmjs.com/package/@nivo/bar) — May 2025
- [echarts-for-react npm](https://www.npmjs.com/package/echarts-for-react) — 3.0.6, React 16-19 supported
- [@xyflow/react npm](https://www.npmjs.com/package/@xyflow/react) — 12.10.2, React 19 release Oct 2025 ([reactflow.dev/whats-new/2025-10-28](https://reactflow.dev/whats-new/2025-10-28))
- [Google People API listDirectoryPeople reference](https://developers.google.com/people/api/rest/v1/people/listDirectoryPeople) — `directory.readonly` scope sufficient
- [OAuth 2.0 Scopes for Google APIs](https://developers.google.com/identity/protocols/oauth2/scopes) — scope catalog
- [Choose Directory API scopes](https://developers.google.com/workspace/admin/directory/v1/guides/authorizing) — confirms `admin.directory.user.readonly` is for Admin SDK (different scope, NOT what's granted)

### Tertiary (LOW confidence — flag for validation during planning)
- Exact `sources` enum value for People API call — verify against `googleapis` TS types in `node_modules` (Open Q2)
- ACC Admin API `addedOn` / `created` field availability for DASH-06 — requires raw-payload spike (Open Q1)
- ACC Admin API account-level admin flag exact name (`accountAdmin`? `isAccountAdmin`?) — verify by inspecting raw user record during Wave 0

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library either locked by user or already in `package.json`; versions verified against npm
- Architecture: HIGH — clear precedent in `AccAnalysisPanel.tsx` family for tab structure, side panel, sync flow; pure-module + Vitest precedent in `accGraphFilters.test.ts`
- Pitfalls: MEDIUM-HIGH — Pitfalls 1-5, 8-10 are general-knowledge framework issues; pitfalls 6-7 (account-admin, addedOn) are concrete Wave 0 items derived from grep evidence
- Workspace integration: MEDIUM — scope IS already granted (HIGH for that fact), but exact People API call shape needs runtime verification (Open Q2)

**Research date:** 2026-05-08
**Valid until:** 2026-06-07 (30 days — stack is stable; revisit if React Flow / Nivo / ECharts ship breaking versions)
