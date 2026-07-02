# Stack Research

**Domain:** New ECharts chart panels on an existing internal BIM/VDC dashboard (`/access-analysis`, `/template-mty`) — v2.3 "New Graphs" milestone
**Researched:** 2026-07-02
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

**Verdict: zero new dependencies.** The installed stack already covers every series type
the 9 candidate panels need.

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `echarts` | `^6.1.0` (installed, `package.json:104`) | Chart rendering engine | [VERIFIED] `node_modules/echarts/package.json` reports `"version": "6.1.0"`. ECharts 6 ships `series-treemap`, `series-heatmap` (+ `visualMap` component), `series-funnel`, `series-themeRiver`, and the `calendar` coordinate component as built-in series/components — no plugin packages required for any of them. [CITED: echarts.apache.org v6 upgrade guide + v6 feature docs] |
| `echarts-for-react` | `^3.0.6` (installed, `package.json:105`) | React wrapper around the `echarts` instance | [VERIFIED] Its `peerDependencies` (`node_modules/echarts-for-react/package.json`) explicitly list `"echarts": "^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0"` — echarts 6.1.0 is an in-range peer, not a mismatch. |
| `components/ui/EChart.tsx` | n/a (in-repo) | Canonical theme-aware wrapper (`useTheme` + `mergeEChartsTheme` + `key={resolvedTheme}` remount) | [VERIFIED, read in full] This is the established integration point every new panel must render through — it already handles dark/light remount and injects `textStyle`/`legend`/`xAxis`/`yAxis`/`tooltip` colors. New series types render through the SAME wrapper (`option` prop), no fork needed. |

### Supporting Libraries (already installed, reusable as-is)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` | `^4.1.0` | Date bucketing/formatting | Issue timeline (month buckets, same pattern as `lib/acc/timelineBucketing.ts`), dormancy recency bucketing (`lastSignIn`) |
| `d3-hierarchy` | `^3.1.2` (+ `@types/d3-hierarchy`) | Hierarchical layout primitives | NOT needed for the treemap panel — ECharts' `series-treemap` computes its own squarified layout internally from flat/nested `data`. Only reach for `d3-hierarchy` if a future panel needs a layout ECharts doesn't already do (e.g. a custom radial pack) — none of the 9 seeds need that. |
| `app/(dashboard)/access-analysis/roleColors.ts` | n/a (in-repo) | Per-role color assignment, pinned by `roleColors.test.ts` | Reuse directly for the permission-footprint-by-role bar/treemap and the tier×depth heatmap's role dimension — keeps role → color mapping consistent with the existing donuts instead of inventing a second palette |
| `lib/colors/echartsTheme.ts` (`ECHARTS_DARK`/`ECHARTS_LIGHT`, `mergeEChartsTheme`) | n/a (in-repo) | Pure theme-chrome injector | See "Integration Gap" below — covers axis/legend/tooltip/text chrome for all series types, but does NOT touch `visualMap`, `calendar`, or per-series `itemStyle`/`data` colors. New panels must supply those manually, same as existing donuts already do for `series.itemStyle.color`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `npx tsc --noEmit` | Type-safety gate before any rebuild | `EChartsOption` types for `treemap`/`heatmap`/`funnel`/`calendar` series ship in the same `echarts` package already installed — no `@types/echarts` needed (echarts is TS-native since v5). |
| Vitest | Unit-test the pure `*Counts.ts` transforms per panel | Follow the existing `lib/acc/timelineBucketing.test.ts` / `roleColors.test.ts` precedent — co-located `__tests__/`, pure functions, no ECharts instance in the test. |

## Installation

```bash
# No installation needed — echarts@6.1.0 and echarts-for-react@3.0.6 are
# already in package.json and node_modules. Do not add:
#   npm install echarts-for-treemap   (does not exist / not needed — built-in)
#   npm install echarts-gl            (only for 3D/WebGL series — forbidden on data surfaces)
#   npm install d3-scale / visx / nivo / recharts (would fork the chart stack)
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| ECharts `series-treemap` (built-in) for the folder-storage treemap | `d3-hierarchy` (`d3.treemap()`) + custom SVG | Only if the treemap needed layout ECharts can't express (e.g. non-rectangular icicle, custom animation choreography). Not the case here — ECharts treemap already supports drill-down (`click`→zoom), `visualMap`-driven size/color, and breadcrumb, which is exactly the "folder storage by size" ask. Using `d3-hierarchy` here would mean hand-rolling tooltip/theme/click behavior the wrapper already gives for free. |
| ECharts `calendar` coordinate + `heatmap`/`scatter` series for any true day-grid ("GitHub contribution graph") style view | Custom CSS grid | None of the 9 seeds explicitly ask for a day-by-day calendar heatmap (the "tier × folder-depth heatmap" seed is a 2-axis categorical heatmap, not a calendar). Keep `calendar` component in reserve if the dormancy-recency chart evolves toward a day-grid; a bucketed bar/line (using `date-fns`, matching the existing activity-timeline pattern) is the more consistent default for that seed. |
| Reusing `mergeEChartsTheme` + manual `visualMap`/`itemStyle` color wiring per panel | Extending `mergeEChartsTheme` itself to auto-theme `visualMap`/`calendar` | Only worth doing if 2+ of the new panels need `visualMap` (the heatmap panel does; the treemap panel optionally does for size-encoded color). If both land in the same milestone, add a small, additive `visualMap`/`calendar` branch to `mergeEChartsTheme` (same pattern as the existing `xAxis`/`yAxis` branches) rather than duplicating the zinc gradient stops in two components. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Any new charting library (Recharts, Nivo, Visx, Chart.js, Plotly) for the funnel/treemap/heatmap panels | Would fork the chart stack — two theming systems, two dark-mode remount strategies, and breaks the "follow the established registration pattern" constraint in PROJECT.md/ROADMAP.md. ECharts 6.1.0 already implements all 4 series types natively. | `components/ui/EChart.tsx` with the relevant `EChartsOption` series type |
| ECharts 6's new built-in "auto dark mode" (system `prefers-color-scheme` listener, one of the 12 headline v6 features) | [CITED: echarts.apache.org v6 feature notes] This feature drives the chart theme from the OS media query. The Dashboard already owns explicit theme control via `next-themes` (`useTheme()` in `EChart.tsx`) with a `key={resolvedTheme}` remount — wiring ECharts' own auto-dark listener would create two competing theme-switch mechanisms and risk a flash/mismatch when they disagree. | Keep the existing `next-themes` + `mergeEChartsTheme` + `key={resolvedTheme}` pattern; do not touch the new v6 auto-dark-mode API. |
| `echarts-gl` / any WebGL ECharts extension | PROJECT.md constraint: "Do not introduce new WebGL on data surfaces." None of the 9 seeds need 3D/WebGL rendering — all are 2D categorical/time-series/hierarchical views. | 2D series only (`bar`, `line`, `pie`/`funnel`, `treemap`, `heatmap`) |
| `d3-hierarchy`-driven custom treemap/pack layouts for the new panels | Duplicates what ECharts' built-in `treemap` series already computes; adds a second layout-math surface to maintain and test | ECharts `series-treemap` with `data` shaped as folder/child nodes |

## Stack Patterns by Variant

**If the panel is a funnel/bar/donut-style categorical chart** (issue funnel, permission-footprint bars, coverage donut, dormancy bars, activity verb/object bars, provisioned-vs-active coverage):
- Use `series: [{ type: 'funnel' | 'bar' | 'pie' }]` inside `EChartsOption`, colors from `option.color` / per-datum `itemStyle.color` (reuse `roleColors.ts` where the dimension is role-keyed)
- Because this is the exact pattern already proven by the existing donut/bar panels (`DonutPanel.tsx`, `FolderActivityByRole.tsx`) — zero new theming work beyond what `mergeEChartsTheme` already injects

**If the panel is the folder-storage treemap:**
- Use `series: [{ type: 'treemap', data: [...] }]`, with `visualMap` OFF by default (flat category colors via `itemStyle.color`, same palette as everything else) unless a size-encoded gradient is explicitly wanted
- Because a flat-color treemap needs no `visualMap` theming work at all — start there, add `visualMap` only if the "reach by role/bytes" story needs a continuous color scale

**If the panel is the tier×depth heatmap:**
- Use `series: [{ type: 'heatmap' }]` + `xAxis`/`yAxis` category axes (both already themed by `mergeEChartsTheme`) + a `visualMap` component with an explicit zinc-dark-safe gradient (e.g. `zinc-800 → indigo-500 → amber-400`, NOT ECharts' default blue-white ramp, which reads badly on `#09090B`)
- Because `visualMap` is the one component `mergeEChartsTheme` does not theme today — this is the single genuine integration gap for the whole milestone (see "Alternatives Considered" — extend `mergeEChartsTheme` only if this pattern repeats)

**If the panel is the ingest-freshness/throughput panel:**
- Use `bar`/`line` (throughput over `AccDcIngestRun.startedAt`), NOT a calendar heatmap unless the milestone explicitly wants a day-grid view
- Because the existing activity-timeline chart already proves the bar/line + `dataFloor` caption pattern (Phase 11, TRUTH-02) — reuse it rather than introducing a new visual idiom for one panel

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `echarts@6.1.0` | `echarts-for-react@3.0.6` | [VERIFIED] peer range `^6.0.0` explicitly includes 6.1.0; no upgrade needed on either side |
| `echarts@6.1.0` | `next-themes@0.4.6` + `components/ui/EChart.tsx` | [VERIFIED, read in full] existing wrapper pattern (`key={resolvedTheme}` remount) works unmodified for any new series type — the remount strategy is series-agnostic |
| `echarts@6.1.0` default theme | Dashboard's zinc dark theme | [CITED] v6 changed the *default* (unthemed) legend position (now bottom) and default color palette vs v5 — irrelevant here because `mergeEChartsTheme` already overrides legend/axis/tooltip/text chrome explicitly per-option; new panels inherit this and are unaffected by the v6 stock-theme change. VERIFY: explicitly set `legend.top`/`legend.bottom` per new panel rather than relying on ECharts' v6 default position, to match the existing panels' layout conventions. |
| TypeScript `^6.0.3` | `echarts@6.1.0` `EChartsOption` types | [VERIFIED via package.json] echarts ships its own `.d.ts`; no separate `@types/echarts` package exists or is needed |

## Sources

- `C:\LECG\Dashboard\package.json` — installed `echarts@^6.1.0`, `echarts-for-react@^3.0.6`, `date-fns@^4.1.0`, `d3-hierarchy@^3.1.2` [VERIFIED]
- `C:\LECG\Dashboard\node_modules\echarts\package.json` — exact resolved version `6.1.0` [VERIFIED]
- `C:\LECG\Dashboard\node_modules\echarts-for-react\package.json` — peerDependencies range includes `^6.0.0` [VERIFIED]
- `C:\LECG\Dashboard\components\ui\EChart.tsx` — canonical wrapper, read in full [VERIFIED]
- `C:\LECG\Dashboard\lib\colors\echartsTheme.ts` — `mergeEChartsTheme` pure function, read in full; confirms `visualMap`/`calendar`/series-data colors are NOT auto-themed [VERIFIED]
- `C:\LECG\Dashboard\app\(dashboard)\access-analysis\roleColors.ts` (+ `roleColors.test.ts`) — existing per-role color precedent [VERIFIED, existence confirmed via Grep]
- `C:\LECG\Dashboard\app\(dashboard)\users\access-analysis\HeatmapPanel.tsx` — confirmed this is a Mosaic/`vg.cell` heatmap on the unrelated `/users/access-analysis` DuckDB surface, NOT an ECharts heatmap and NOT on the target pages — no precedent conflict [VERIFIED]
- https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/ — v6 breaking changes (default theme/legend position, rich-text inheritance, tooltip.valueFormatter param change); no breaking changes documented for treemap/heatmap/funnel/calendar/themeRiver [CITED]
- https://echarts.apache.org/handbook/en/basics/release-note/v6-feature/ — v6 new features (built-in system-driven dark mode, matrix coordinate system); confirms no functional changes to treemap/heatmap/funnel/calendar in the v6 feature set [CITED]
- .planning/PROJECT.md — "no new WebGL on data surfaces" constraint; zinc theme constraint [VERIFIED]
- .planning/ROADMAP.md "v2.3 Candidates (Seeds)" — 9 candidate panels + established registration pattern (`lib/server/<name>View.ts` → `*Counts.ts` → `components/<Name>Chart.tsx` → `AccessAnalysisCharts.tsx`) [VERIFIED]

---
*Stack research for: new ECharts panels on `/access-analysis` + `/template-mty` (v2.3 New Graphs)*
*Researched: 2026-07-02*
