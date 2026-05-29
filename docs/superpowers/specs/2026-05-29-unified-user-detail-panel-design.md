# Unified, instant user-detail panel — design

**Date:** 2026-05-29
**Branch:** `feat/access-analysis-redesign`
**Status:** Draft for review

## Goal

Three coupled user-facing outcomes:

1. **Latest data for every user** — the users directory shows each user's most recent synced data, uniformly.
2. **Instant open** — clicking a user opens the detail panel immediately, with no multi-second wait.
3. **Graph parity** — clicking a node on the access-analysis graph opens the *same* detail tab that `/users` shows when you click a user.

## Background: what's there today

### The `/users` detail tab (the "tab")
Clicking a user on `/users` opens a dialog (`OrgPersonCard`) containing
`AccProfileSection` (`app/(dashboard)/users/AccProfileSection.tsx`). That component:

- Fires `trpc.users.getAccProfile({ email, forceRefresh })`.
- `getAccProfile` (`server/routers/users.ts:814`) checks the `accMemberCache` DB
  row; **if the cache is cold or older than `ACC_CACHE_TTL_MS` (1h), it makes a
  live, multi-second Autodesk Admin API round-trip** (`fetchAccUserByEmail` →
  projects → roles → products), then upserts the cache.
- While that runs, `AccLoadingProgress` shows a *simulated* "Connecting to
  Autodesk… 40%…" bar — it exists purely to mask the live-fetch latency.
- On success it renders: status/company/role header, added-on + last-sign-in,
  five stat cards, per-project cards (roles + module toggles), and three
  collapsible sub-panels — **Activity** (`getAccUserActivity`), **Folder access**
  (`getAccUserFolderAccess`), **Recent additions** (derived from project dates).

**This is the root cause of the slow open: a live Autodesk call on the click path.**

### The access-analysis graph node click (the "graph")
The access-analysis page (`/access-analysis` and `/users/access-analysis` →
`AccessAnalysisShell` → `HybridAnalyticsSurface`, a DuckDB/cosmos stack) renders
a right rail via `RightPanelStack` (`app/(dashboard)/users/access-analysis/RightPanelStack.tsx`).
On node click it shows `UserDetailPanel` (`RightPanelStack.tsx:67`) — a *thin*
panel (DuckDB-fetched projects/roles only). This is **not** the `/users` tab.

A clicked node exposes `isolatedNodeIndex`, which indexes
`features: NodeFeatureSnapshot[]`; each snapshot carries `emailLower`
(`interactionTypes.ts:30`). So the clicked user's **email is available** as the
join key.

### Where the data already lives
`getCachedBulkAccSummary` (`lib/server/acc-hot-cache.ts:637`) returns a complete
`BulkAccUser` for **every** registered user + every `accMemberCache` row in two
queries — including `projects` (with `roles`/`modules`/`status`/`isAdmin`),
`lastSignIn`, `addedOn`, `companyRole`, `isAccountAdmin`, and a per-user
`syncedAt`. It is exposed as `trpc.users.bulkAccSummary`, refreshed by the daily
auto-sync, and **already prefetched into the browser on the `/users` page**.

**Implication:** the freshest synced snapshot for the whole user base is already
in memory. The per-click live Autodesk call is redundant for the common case.

## Design

### Decisions (confirmed with the user)
- **Tab = the `/users` ACC profile panel** (status/company/sign-in header, stat
  cards, per-project cards, Activity / Folder-access / Recent-additions panels).
- **Freshness = instant from latest sync.** Read the most recent synced snapshot
  on open; no live Autodesk call on the click path. A manual **Refresh** stays as
  the only on-demand path to a live fetch.
- **Data source on open = in-memory bulk** (`bulkAccSummary` already loaded on the
  page) — look up the clicked email; **zero network on open**.
- **Target graph = the access-analysis graph** (`RightPanelStack`).
- **Graph panel fit = identical content, laid out to fit the `w-96` rail** (scrolls
  if needed).

### Component A — shared `UserProfilePanel`
Extract the rendering of `AccProfileFull` / `AccProfileSection` into a
self-contained, presentational component:

```
UserProfilePanel({
  user: BulkAccUser,        // the resolved, in-memory synced snapshot
  email: string,            // join key for the lazy sub-panel queries
  onClose?: () => void,     // shown when mounted as an overlay/rail
  variant?: "dialog" | "rail",  // layout density only — same content
})
```

- **Core profile** (header, stat cards, per-project cards) renders **synchronously
  from `user`** — no query, no loading bar.
- **Sub-panels** (Activity, Folder access, Recent additions) stay exactly as today:
  each fires its own lazy, email-keyed query (`getAccUserActivity`,
  `getAccUserFolderAccess`) with React Query caching; they are collapsible and do
  not block the core.
- `variant` only adjusts layout (column widths / padding) to fit the dialog vs the
  `w-96` rail; **content is identical**.

The old `AccLoadingProgress` simulated bar is no longer on the open path (kept only
if a live Refresh is in flight).

### Component B — wiring `/users`
`OrgPersonCard` already has the merged bulk users in scope (the directory loads
`bulkAccSummary` + merges `enrichedUsers`). Resolve the `BulkAccUser` for
`person.email` from that in-memory list and pass it to `UserProfilePanel`
(`variant="dialog"`). No `getAccProfile` call on open; the Refresh button performs
the live fetch on demand and updates the panel.

### Component C — wiring the access-analysis graph
- The access-analysis page loads `trpc.users.bulkAccSummary` (one cached query,
  usually already warm from `/users`) and builds an `email → BulkAccUser` map. For
  field parity it also loads `accMembers.enrichedUsers` (supplies `companyName` /
  `aggregatedStatus`), mirroring how the directory merges them.
- In `RightPanelStack`, when `isolatedNodeIndex !== null`, render
  `UserProfilePanel` keyed by `features[isolatedNodeIndex].emailLower`
  (`variant="rail"`) instead of `UserDetailPanel`. Preserve the existing
  close→sliders behavior and the **pinned `w-96` width** (P0 camera-stability
  invariant — the rail must never resize the graph's flex area).
- If the clicked email is not present in the bulk map (e.g. a DC-only node with no
  ACC profile yet), render a graceful "not synced yet" state (same as today's
  `found:false`).

`UserDetailPanel` becomes legacy (left in place or removed in a follow-up). Note:
`RightPanelStack` / `UserDetailPanel` are flagged "forbidden casual edit" in the
repo guardrails; this change is intentional and in-scope per the user's explicit
goal, and is kept surgical (RightPanelStack swap only).

### Part 1 — "every user has the last data"
Satisfied by construction: the panel reads `bulkAccSummary`, which covers the
entire user base and is refreshed by the daily sync, and surfaces each user's
`syncedAt` ("Last synced …"). Every user shows their latest synced data uniformly
and instantly. **Verification step during build:** confirm `accMemberCache`
coverage; if a meaningful set of users has no synced row (`found:false`), flag it
as a sync/backfill follow-up — it is a pipeline gap, not a UI gap, and out of scope
for this change.

## Field-availability notes (for implementation)
`BulkAccUser` → profile-view mapping. Always present: `name`, `projects[]`
(`status`/`isAdmin`/`roles`/`modules`), `lastSignIn`, `addedOn`, `syncedAt`,
`isAccountAdmin`. Populated only after `enrichedUsers` merge: `companyName`,
`aggregatedStatus`, `projectAdmin`, `executive`. Map header `status` from
`aggregatedStatus` (fallback: derive from project statuses); header role badge from
`isAccountAdmin`/`projectAdmin`/`executive`. Per-project `addedOn` may be absent in
bulk; the Recent-additions panel degrades to "no dates available" exactly as today.

## Testing
- **Unit (vitest):** `UserProfilePanel` renders core profile from a `BulkAccUser`
  fixture with **no network call** (assert no `getAccProfile`); renders the
  `found:false` empty state; both `variant`s render the same sections.
- **e2e (`NEXT_PUBLIC_ACC_GRAPH_TEST` harness):** (a) directory user click opens the
  panel and fires **no** `getAccProfile` on open; (b) access-analysis graph node
  click opens `UserProfilePanel` for the node's email with the expected sections.
- Keep the existing access-analysis e2e green (camera stability: rail width
  unchanged at `w-96`).

## Out of scope
- Rebuilding or re-scheduling the ACC/DC sync pipeline (only *reading* the freshest
  snapshot; backfill gaps surfaced, not fixed here).
- The standalone `/users/spatial-graph` page (`AccUsersGraph` + `SidePanel`) — the
  user chose the access-analysis graph; the spatial-graph panel is unchanged.
- Removing `UserDetailPanel` / `SidePanel` (legacy cleanup is a later follow-up).

## Risks
- **Field parity on the graph surface** if `enrichedUsers` isn't merged there →
  blank company/status. Mitigation: load `enrichedUsers` on the access-analysis
  page (Component C).
- **Camera reframe** if the rail width changes. Mitigation: keep `w-96`; the
  `variant="rail"` layout must fit that width.
- **"Forbidden casual edit" guardrail** on `RightPanelStack`. Mitigation:
  intentional, user-directed, surgical; verify git scope after edits.
