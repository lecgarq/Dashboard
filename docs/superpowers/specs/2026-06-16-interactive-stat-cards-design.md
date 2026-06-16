# Interactive profile stat cards — design

**Date:** 2026-06-16
**Status:** Approved (owner)
**Branch:** feat/access-analysis-redesign

## Goal

Make the user-profile stat cards (`AccProfileFull` in `app/(dashboard)/users/AccProfileSection.tsx`)
interactive: clicking **Admin**, **Roles**, or **Modules** reveals detail inline,
right below the card row.

- **Admin** → the list of projects where this user is an admin.
- **Roles** → a compact donut of role distribution.
- **Modules** → a compact donut of module distribution.

## Scope (locked)

- **In:** Admin, Roles, Modules become clickable + open an inline detail panel.
- **Static (unchanged):** Projects, Active — Projects already has the full
  searchable list below; Active is just a count.
- **No new server calls.** All detail is derived client-side from the profile's
  already-loaded `projects: ProjectData[]` (`{id, name, status, isAdmin, roles[], modules[]}`).
- **No heavy chart chrome** (no top-N slider / fold controls like the dashboard
  `RolesPieChart`) — keep the profile donuts compact.

## Interaction

- One detail panel open at a time, rendered **directly below the 5-card grid** and
  above the search/projects list, pushing content down.
- Clicking a card toggles it: open if closed, close if it's already the active one;
  clicking a different card switches.
- The active card gets a highlight (ring/border + subtle bg).
- **Zero-count cards are disabled** (not clickable, slightly dimmed): Admin=0,
  Roles=0, or Modules=0.
- State: a single `activeCard: "admin" | "roles" | "modules" | null` in `AccProfileFull`.

## Components & data flow

### 1. `app/(dashboard)/users/statCardDetails.ts` — pure aggregation (new)

No I/O. Given `projects: ProjectData[]`:
- `adminProjects(projects)` → `ProjectData[]` filtered to `isAdmin`, sorted active-first then by name.
- `roleCounts(projects)` → `{ name: string; value: number }[]` — one entry per distinct
  role, `value` = number of projects carrying that role, sorted by value desc then name.
- `moduleCounts(projects)` → `{ name: string; value: number }[]` — one entry per distinct
  module **key**, mapped to a friendly display name via the existing `ALL_MODULES`
  table (`documentManagement` → "Forma Data Management"; unknown keys pass through),
  `value` = number of projects using it, sorted by value desc then name.

### 2. `app/(dashboard)/users/StatCardDetail.tsx` — the inline panel (new)

Props: `{ kind: "admin" | "roles" | "modules"; projects: ProjectData[] }`.
- `admin` → a compact list: project name + active/inactive badge + the user's role(s)
  in that project (reusing the existing badge styles).
- `roles` / `modules` → a compact **donut** built on the existing `EChart` wrapper
  (`app/(dashboard)/access-analysis/components/EChart.tsx`), height ~220px, theme-aware
  colors (reuse a palette like `RolesPieChart`'s), plus a small ranked legend row list
  (color swatch · name · count). No slider/top-N controls.

### 3. `AccProfileFull` wiring (`AccProfileSection.tsx`)

- Add `activeCard` state.
- `StatCard` gains optional `onClick` + `active` + `disabled` props (keeps its current
  look when those are absent, so nothing else regresses). Clickable cards render as a
  `button`; static ones stay a `div`.
- Render `<StatCardDetail>` below the grid when `activeCard` is set.

## Donut details

- Reuse `EChart` (`option`, `height`, `onEvents`). Compact donut (`radius: ["55%","80%"]`),
  center total label = distinct count, theme-aware slice/border colors via `useTheme`.
- Legend: a simple `<ul>` of `swatch · name · count` (no hide/expand controls).
- Clicking a slice/legend row is **not** required (read-only); tooltip on hover is enough.

## Empty / edge cases

- 0-count card → disabled, no panel.
- A user with projects but no roles/modules on any → that card shows 0 → disabled.
- Long role/module lists → the legend scrolls within the panel (`max-h` + overflow).

## Testing

- **`statCardDetails.ts` unit tests:** `adminProjects` filters + sorts; `roleCounts`
  counts per-project occurrence + sorts; `moduleCounts` maps keys to friendly names +
  counts; empty input → empty arrays.
- **Render test:** clicking Admin opens the admin list; clicking Roles opens a donut
  container; clicking the active card again closes it; a 0-count card is disabled and
  opens nothing.

## Non-goals

- No interactivity on Projects/Active.
- No server-side aggregation or new tRPC procedures.
- No cross-filtering or drill-through from the donut into other panels.
