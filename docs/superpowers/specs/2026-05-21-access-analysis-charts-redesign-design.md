# Access Analysis — Charts UI/UX Redesign

**Date:** 2026-05-21
**Route:** `/access-analysis` → `AccessAnalysisPage` → `DeferredAnalyticsSection` → `HybridAnalyticsSurface`
**Status:** Design approved; ready for implementation planning

## Problem

The `/access-analysis` page renders `HybridAnalyticsSurface`, a long, fairly uniform
grid of many chart widgets (KPI strip, 4 donuts, 2 distributions, a heatmap, 3
histograms, plus access-events / compliance / permission-risk panels). It works,
but it reads as generic and unrefined:

- **Color sprawl.** Each panel hardcodes its own vivid hex palette (`#8b5cf6`,
  `#06b6d4`, `#84cc16`, four separate donut palettes, six distinct KPI accents).
  The result is a rainbow that fights the calm, restrained look we want.
- **Weak hierarchy.** Nearly everything is the same `rounded-lg border bg-card p-4
  shadow-sm` panel at the same visual weight. There is no clear executive headline
  zone, and the page is a long scroll without grouping or rhythm.
- **The "so what" is buried.** `buildExecutiveFindings` already produces good
  plain-English takeaways, but they render as tiny muted `text-xs` lines inside
  panel headers rather than leading.
- **Interactivity is invisible.** Charts are click/brush crossfilterable (Mosaic
  `Selection`) and donuts/bars open drill-downs, but nothing signals this and there
  is no way to see or clear an active filter.
- **Two render paths drift.** A DuckDB-Wasm "ready" path (vgplot/Mosaic) and a CSS
  "fallback" path render the same data with different-looking chrome.

## Goals

A **refined, enterprise-BI dashboard** optimized for an **executive overview**
audience. Improvements span all four areas the owner asked for: visual polish,
interactivity, clarity/insight, and layout/flow.

Non-goals (explicit scope boundaries):

- The cosmos / spatial graph (`/users/spatial-graph`, separate milestone) is **not**
  touched.
- **No** changes to data queries, sync, or which metrics exist. This is purely a
  presentation, information-architecture, and interaction layer over existing data.
- Compliance / Permission-risk / Access-events panels get the shared chrome and
  tokens but **no functional change**.

## Approach

Approach A (approved): a **thin shared foundation first**, then redesign panels in
**executive-first priority order**, shipping reviewable chunks. This guarantees the
consistency the "refined" look needs while delivering visible wins where the
audience looks first, with incremental approval.

## Design

### 1. Shared foundation

**`ChartPanel` component** — a single card primitive that every chart sits in,
replacing the 5+ hand-rolled `<section className="rounded-lg border bg-card p-4
shadow-sm">` wrappers in `HybridAnalyticsSurface`, `DonutPanel`,
`DistributionPanel`, `HistogramPanel`, `HeatmapPanel`, and `FallbackBarPanel`.

Props (shape, not final API):

- `title: string`
- `subtitle?: string`
- `insight?: { text: string; severity?: "good" | "watch" | "risk" | "info" }`
  — the promoted finding line, rendered at readable size with a small severity dot.
- `affordance?: "drag-to-filter" | "click-to-filter"` — top-right hint.
- `onClick?` / children for the chart body.

Visual: consistent padding (`p-5`), `--radius-lg`, `--shadow-soft-sm`, calmer
border. One header layout used everywhere.

**Color system — adopt existing tokens, retire the rainbow.** `globals.css` already
ships a curated 5-color chart sequence (`--chart-1..5`) and semantic status tokens
(`--success`, `--warning`, `--info`, `--danger-bg`, plus `--muted-foreground`).

- Neutral / ranking charts (top projects, roles, companies; distributions): use the
  `--chart-1..5` sequence.
- Meaning-bearing charts (status, recency, admin, permission risk): use semantic
  tokens so the language is consistent everywhere — **green = good/active, amber =
  watch, red = risk, neutral = informational.**
- Remove the per-panel hardcoded hex constants (`ACCENTS`, `STATUS_COLORS`,
  `RECENCY_COLORS`, `PERM_TIER_COLORS`, `ADMIN_MIX_COLORS`, the six KPI accents) in
  favor of a small shared color-map module that resolves to tokens.

### 2. Executive summary zone (top of page)

- **KPI strip (`KpiHeroStrip`):** same six metrics, but accents reduced to *meaning*
  (stale = red/`--danger`, active = green/`--success`, the rest neutral/primary)
  instead of six competing colors. Keep the existing mini sparklines.
- **New "Headline insights" band** directly under the KPIs: 3–4 plain-English
  takeaways promoted from the existing `buildExecutiveFindings` output (active
  members, stale members, admin concentration, project breadth, permission tiers).
  Severity-colored, each **clickable** to open the matching existing drill-down
  (`setDetailFilter`) or apply the matching crossfilter. This is the executive
  payoff — the "so what" leads instead of hiding.

### 3. Access posture (the four donuts)

User status, activity recency, admin composition, permission tiers → onto
`ChartPanel` with semantic token colors and the finding shown on the shared insight
line. Keep click-to-drilldown. Group under one "Access posture" section header.

### 4. Distributions, rankings & visible interactivity

- Distribution / histogram / heatmap panels → `ChartPanel` + token colors.
- **New active-filters bar:** subscribes to the Mosaic `Selection` objects
  (`usersSelection`, `projectsSelection`) and renders the current crossfilter
  clauses as removable chips ("projects: 4–10 ✕") with a **Clear all** control, so
  the filtering that is invisible today becomes obvious and reversible.
- Consistent "drag to filter" / "click to filter" affordance on every interactive
  chart (via `ChartPanel.affordance`).

### 5. Page flow / information architecture

Reorder `HybridAnalyticsSurface` into labeled sections with breathing room,
executive content first:

1. **Executive summary** — KPIs + Headline insights band
2. **Access posture** — the four donuts
3. **Access breadth** — distributions (projects per user, admin grants per user)
4. **Rankings** — top projects / roles / companies
5. **Activity & risk** — Access events, Compliance scan, Permission risk

Both render paths (DuckDB ready *and* CSS fallback) route through `ChartPanel` so the
page looks identical regardless of browser capability.

## Components touched

- New: `ChartPanel.tsx`, headline-insights band component, active-filters-bar
  component, shared chart color-map module.
- Modified: `HybridAnalyticsSurface.tsx` (IA/sectioning, wiring), `KpiHeroStrip.tsx`,
  `DonutPanel.tsx`, `DistributionPanel.tsx`, `HistogramPanel.tsx`, `HeatmapPanel.tsx`
  (adopt `ChartPanel` + tokens). Fallback panels routed through `ChartPanel`.

## Testing

- Existing tests to keep green: `DonutPanel.test.tsx`, `VgplotFacetChart.test.tsx`,
  `HybridAnalyticsSurface.fallback.test.tsx`, `AccessAnalysisPage.test.tsx`,
  `page.test.tsx`.
- New unit coverage: `ChartPanel` rendering (title/subtitle/insight/affordance),
  color-map token resolution (semantic vs sequence), active-filters-bar chip
  derivation from a Mosaic `Selection` (including empty → renders nothing, and
  Clear all resets the selection).
- Manual/visual: both DuckDB and fallback paths render consistent chrome; drill-down
  modal still opens from donut/insight clicks; crossfilter chips appear and clear.

## Risks / open questions

- **Active-filters bar feasibility:** reading and clearing Mosaic `Selection`
  clauses needs care (subscribe to clause changes; clear via selection reset). To be
  pinned down in planning; if the API is awkward, fall back to surfacing only the
  React-level `detailFilter` state plus a simpler "filtering active — reset" control.
- **Surgical staging:** the branch carries large uncommitted WIP. All commits stage
  by explicit path only (never `-A`/`.`).
