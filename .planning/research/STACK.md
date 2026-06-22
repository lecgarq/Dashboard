# Technology Stack

**Project:** LECG Dashboard — /access-analysis v3.0 (Hub Story & Scenario Explorer)
**Researched:** 2026-06-22 (v3.0 chart-types addendum)
**Scope:** New ECharts series types (sankey, chord, calendar heatmap, treemap, pivot renderer)
**ECharts version:** `^6.1.0` [VERIFIED from package.json — released ~May 2026, includes ECharts 6.0 chord series]
**echarts-for-react version:** `^3.0.6` [VERIFIED from package.json]

> This file is an addendum to the v2.0 STACK.md (2026-06-17). The v2.0 sections (ECharts depth/polish, TanStack Table, Framer Motion, 2.5D CSS, R3F hero accents) remain valid and are appended at the bottom. The new sections (1–8) cover v3.0-specific chart types.

---

## 1. Verified Stack Baseline

These are already in the repo and must not be changed:

| Layer | Package | Version | Role |
|-------|---------|---------|------|
| Chart engine | `echarts` | `^6.1.0` | All chart rendering |
| React wrapper | `echarts-for-react` | `^3.0.6` | `ReactECharts` component |
| Canonical wrapper | `components/ui/EChart.tsx` | repo | Theme injection, key-remount on theme switch |
| Theme injector | `lib/colors/echartsTheme.ts` | repo | `mergeEChartsTheme`, `ECHARTS_DARK`, `ECHARTS_LIGHT` palettes |
| Theme provider | `next-themes` | `^0.4.6` | `resolvedTheme` → `dark: bool` |

**Do NOT add:** `echarts-gl`, `echarts-stat`, or any WebGL-backed charting layer. The no-new-WebGL constraint is a hard product rule (PROJECT.md, owner-approved v2.0).

---

## 2. Sankey — `type: 'sankey'`

**Use for:** Company→Role→Module flows; permission path visualization.

**Data format (exact field names — verified from SankeySeries.ts):**
```typescript
// nodes — `name` is the node identifier AND the label
nodes: Array<{ name: string; [key: string]: unknown }>
// edges — source/target reference node `name` values (not indices)
links: Array<{ source: string; target: string; value: number }>
// aliases: `data` = nodes, `edges` = links — both accepted
```

**Key config fields (defaults from SankeySeries.ts):**
```typescript
{
  type: 'sankey',
  orient: 'horizontal',      // 'vertical' for top-down; default 'horizontal'
  nodeWidth: 20,             // px width of node rect
  nodeGap: 8,                // px gap between sibling nodes
  layoutIterations: 32,      // reduce to 8–16 for >30 nodes (perf)
  draggable: true,           // users can reposition nodes
  roam: false,               // pan + zoom; set true if needed
  nodeAlign: 'justify',      // 'justify'|'left'|'right' — trailing column alignment
  label: { position: 'right' },
  edgeLabel: { show: false },
  emphasis: { focus: 'adjacency' },  // highlights connected nodes+edges on hover
  // Depth-specific styling (depth is 0-indexed from source side):
  levels: [
    { depth: 0, itemStyle: { color: '#6366f1' }, lineStyle: { color: 'source', opacity: 0.4 } },
    { depth: 1, itemStyle: { color: '#8b5cf6' }, lineStyle: { color: 'source', opacity: 0.4 } },
    { depth: 2, itemStyle: { color: '#ec4899' }, lineStyle: { color: 'source', opacity: 0.4 } },
  ],
}
```

**Theme wiring:** `mergeEChartsTheme` injects `tooltip` bg/border and global `textStyle`. Sankey node `itemStyle.color` and `lineStyle.color` are caller-owned — set via `levels[]`. Use `ECHARTS_DARK.chart[]` palette for depth colors. The existing `ActivityTimelineChart.tsx` pattern (lines 44–47) is the correct pattern for extracting palette values:
```typescript
const { resolvedTheme } = useTheme();
const dark = resolvedTheme !== 'light';
import { ECHARTS_DARK, ECHARTS_LIGHT } from '@/lib/colors/echartsTheme';
const p = dark ? ECHARTS_DARK : ECHARTS_LIGHT;
// Then use p.chart[0], p.chart[1], p.chart[2] for level colors
```

**Performance:** No progressive rendering for sankey. Pre-aggregate server-side to ≤50 nodes / ≤200 links for readable layout. Reduce `layoutIterations` to 8 if first render is slow.

**Confidence:** MEDIUM (source: GitHub apache/echarts SankeySeries.ts defaults)

---

## 3. Chord — `type: 'chord'` [ECharts 6.0+, available in ^6.1.0]

**Use for:** Firm collaboration matrix; role co-occurrence; bidirectional flow between named entities.

**Critical version note:** `chord` is a **new series type added in ECharts 6.0** (released July 2025). The repo uses `^6.1.0` — this type is available. It does NOT exist in ECharts 4 or 5. Confirm `ChordSeriesOption` is exported from the top-level `echarts` package at runtime — VERIFY by importing and checking `typeof ChordSeriesOption` in a throwaway test if needed.

**Data format (verified from ChordSeries.ts):**
```typescript
data: Array<{ id?: string; name: string; value?: number }>
edges: Array<{ source: string | number; target: string | number; value?: number }>
// aliases: `nodes` = data, `links` = edges — both accepted
```

**Key config fields (defaults from ChordSeries.ts defaultOption):**
```typescript
{
  type: 'chord',
  center: ['50%', '50%'],
  radius: ['70%', '80%'],      // [inner_radius, outer_radius]
  clockwise: true,
  startAngle: 90,              // 12 o'clock start
  endAngle: 'auto',            // full circle
  padAngle: 3,                 // degrees of gap between node arcs
  minAngle: 0,
  itemStyle: {
    borderRadius: [0, 0, 5, 5],  // bottom corners rounded (default)
  },
  lineStyle: {
    color: 'source',   // 'source'|'target'|hex — gradient from source arc color; looks premium
    opacity: 0.2,      // ribbons are faint at rest; pop on hover via emphasis
  },
  label: { show: true, position: 'outside', distance: 5 },
  emphasis: {
    focus: 'adjacency',          // dims all non-connected ribbons on hover
    lineStyle: { opacity: 0.5 }, // hover ribbons are more visible
  },
}
```

**Theme wiring:** Same as sankey. `mergeEChartsTheme` injects tooltip/textStyle. Arc `itemStyle.color` and ribbon `lineStyle.color` are caller-owned. With `lineStyle.color: 'source'`, ribbons automatically gradient from source arc color — no extra color wiring needed for ribbons. Arc colors from `ECHARTS_DARK.chart[]`.

**Chord vs graph decision rule:** Use `chord` for ≤20 named entities with a flow/co-occurrence matrix. Use `graph` (section 4) when you need force-directed layout, arbitrary topology, or want node size to encode a metric.

**Performance:** No progressive rendering. Cap at ≤20 nodes, ≤100 edges for readable chord layout. Pre-aggregate server-side.

**Confidence:** MEDIUM (source: GitHub apache/echarts ChordSeries.ts + ECharts 6.0 release handbook)

---

## 4. Graph (force / circular network) — `type: 'graph'`

**Use for:** Role co-occurrence network when chord is too dense; general network visualization.

**Data format (verified from GraphSeries.ts):**
```typescript
data: Array<{
  id?: string; name?: string; x?: number; y?: number;
  value?: number; category?: number;  // category = index into categories[]
  symbolSize?: number; fixed?: boolean; draggable?: boolean;
}>
links: Array<{
  source: string | number; target: string | number;
  value?: number;
  lineStyle?: { curveness?: number; color?: string };
  symbol?: string | [string, string]; symbolSize?: number | [number, number];
}>
categories: Array<{ name: string; symbol?: string; itemStyle?: object; label?: object }>
```

**Key config fields (defaults from GraphSeries.ts):**
```typescript
{
  type: 'graph',
  layout: 'circular',          // 'circular'|'force'|'none'
  roam: true,                  // pan + zoom
  edgeSymbol: ['none', 'arrow'],  // arrowhead for directed graphs; ['none','none'] default
  label: { show: false },      // show labels on emphasis only to reduce clutter
  emphasis: { focus: 'adjacency' },
  // Force layout params:
  force: {
    repulsion: 100,            // default [0,50] — increase for node spread
    gravity: 0.1,
    edgeLength: [80, 120],     // target edge length range
    friction: 0.6,
    initLayout: 'circular',    // initial positions before simulation
    layoutAnimation: true,     // spread simulation over animation frames
  },
  // Circular layout: nodes arranged in a ring; good for co-occurrence matrices
  circular: { rotateLabel: true },
}
```

**Confidence:** MEDIUM (source: GitHub apache/echarts GraphSeries.ts defaults)

---

## 5. Calendar Heatmap — `type: 'heatmap'` + `calendar` component

**Use for:** Activity timing calendar; hot days/weeks of ACC activity.

**Requires two top-level components in the option object — this is NOT like other series:**

```typescript
import { ECHARTS_DARK, ECHARTS_LIGHT } from '@/lib/colors/echartsTheme';
const p = dark ? ECHARTS_DARK : ECHARTS_LIGHT;

const option: EChartsOption = {
  // 1. calendar component (a coordinate system, NOT a series)
  calendar: {
    range: 2025,                // int year | 'YYYY-MM' | ['YYYY-MM-DD','YYYY-MM-DD']
    cellSize: ['auto', 18],     // [col_width, row_height]; 'auto' fills available space
    orient: 'horizontal',       // weeks go left→right (default)
    splitLine: { show: true, lineStyle: { color: p.axis } },
    itemStyle: { borderWidth: 1, borderColor: p.axis },
    dayLabel: {
      firstDay: 1,              // 1=Monday
      nameMap: 'en',
      color: p.text,
    },
    monthLabel: { nameMap: 'en', color: p.text },
    yearLabel: { show: true, color: p.text },
  },

  // 2. visualMap — NOT injected by mergeEChartsTheme; caller-owned
  visualMap: {
    min: 0,
    max: 500,                   // set from actual data max
    calculable: true,
    orient: 'horizontal',
    left: 'center',
    bottom: 0,
    inRange: {
      // Dark mode: zinc→indigo→violet gradient
      color: dark ? ['#27272a', '#6366f1', '#c084fc'] : ['#f4f4f5', '#6366f1', '#7c3aed'],
    },
    textStyle: { color: p.text },
  },

  // 3. heatmap series — coordinateSystem MUST be 'calendar'
  series: [{
    type: 'heatmap',
    coordinateSystem: 'calendar',
    data: [
      ['2025-01-01', 12],   // [ISO date string, numeric value]
      ['2025-01-02', 45],
      // ...
    ],
    itemStyle: { borderRadius: 2 },
    emphasis: { itemStyle: { shadowBlur: 10, shadowColor: p.tooltipBg } },
  }],

  tooltip: { trigger: 'item' },
};
```

**Critical:** `mergeEChartsTheme` injects `tooltip` bg/border and `textStyle`, but does NOT touch `calendar`, `visualMap`, or `series[].itemStyle`. You must manually wire `p.text` and `p.axis` into the calendar component (as shown above).

**Practical note on `EChart` wrapper:** The canonical `EChart.tsx` wrapper passes `notMerge` and `lazyUpdate`. For calendar heatmap, set `notMerge={true}` when the year range changes (full re-init needed); `notMerge={false}` when only data values update within the same range.

**Performance:** Calendar with 365 days is 365 data points — trivially small. No special perf handling needed. If showing multi-year ranges, keep `range` to ≤3 years per render.

**Confidence:** MEDIUM–HIGH (source: CalendarModel.d.ts types + HeatmapSeries.ts coordinateSystem options + web docs)

---

## 6. Treemap — `type: 'treemap'`

**Use for:** Folder storage size; permission surface area by folder; data reach by module.

**Data format (verified from TreemapSeries.ts):**
```typescript
data: Array<{
  name: string;
  value: number;            // leaf node size; parent values auto-summed from children
  children?: Array<...>;    // recursive hierarchy
  itemStyle?: { color?: string };
}>
```

**Key config fields (defaults from TreemapSeries.ts defaultOption):**
```typescript
{
  type: 'treemap',
  roam: true,                    // pan + zoom; false to disable
  nodeClick: 'zoomToNode',       // drill into children on click; false to disable
  sort: true,                    // descending sort (default)
  squareRatio: 0.5 * (1 + Math.sqrt(5)),  // golden ratio — default; controls rectangle squareness
  visibleMin: 10,                // px² — hide nodes smaller than this threshold
  childrenVisibleMin: null,      // px² — hide grandchildren when parent is small; set ~20 for dense trees
  leafDepth: null,               // null=show all levels; 1=one level at a time (paginated exploration)
  breadcrumb: {
    show: true,
    height: 22,
    left: 'center',
    emptyItemWidth: 25,
    itemStyle: { textStyle: { color: p.text } },
  },
  label: {
    show: true,
    position: 'inside',
    distance: 0,
    padding: 5,
    formatter: '{b}',           // {b}=name, {c}=value, {d}=percent
    color: '#fff',
    fontSize: 12,
    overflow: 'truncate',
  },
  upperLabel: { show: true, height: 20, color: '#fff' },  // shown on parent node tiles
  // Per-level styling — level 0 = root group, level 1 = first children, etc.:
  levels: [
    {
      itemStyle: { borderWidth: 3, borderColor: p.axis, gapWidth: 3 },
      upperLabel: { show: true },
    },
    {
      colorMappingBy: 'index',   // 'index'|'value'|'id' — how node color is assigned
      itemStyle: { borderWidth: 1, borderColor: p.axis, gapWidth: 1 },
    },
    {
      colorMappingBy: 'index',
      itemStyle: { borderWidth: 0, gapWidth: 1 },
    },
  ],
}
```

**Theme wiring:** `mergeEChartsTheme` injects tooltip/textStyle. `breadcrumb.itemStyle.textStyle.color`, `label.color`, `levels[].itemStyle.borderColor` are caller-owned — use `p.text` and `p.axis` from the palette.

**Performance:** No progressive rendering. For folder trees with thousands of entries: pre-aggregate server-side to ≤3 levels deep with ≤500 leaf nodes. Use `visibleMin: 20` to hide tiny noise tiles. Set `childrenVisibleMin: 30` to hide grandchildren until a parent is drilled.

**Confidence:** MEDIUM (source: GitHub apache/echarts TreemapSeries.ts + DeepWiki treemap doc)

---

## 7. Generic Pivot Renderer — PivotChart Component

**Use for:** Scenario explorer — auto-renders bar/pie/treemap/heatmap/sankey/chord from a `measure × dimension(×dimension)` selection.

### Which config aspects are shared vs. series-specific

| Aspect | bar | pie | treemap | heatmap/cal | sankey | chord |
|--------|-----|-----|---------|-------------|--------|-------|
| `tooltip.trigger` | `'axis'` | `'item'` | `'item'` | `'item'` | `'item'` | `'item'` |
| `mergeEChartsTheme` covers tooltip+text | yes | yes | yes | yes (partial) | yes (partial) | yes (partial) |
| Need manual palette wiring | no | yes | yes | yes (visualMap + calendar) | yes (levels) | yes (itemStyle) |
| `emphasis.focus` type | `'series'` | `'self'` | none | none | `'adjacency'` | `'adjacency'` |
| `notMerge` for smooth updates | `false` | `false` | `false` | `true` (range change) | `true` | `true` |
| Has coordinate axes (xAxis/yAxis) | yes | no | no | no | no | no |

### Recommended implementation

**File:** `app/(dashboard)/access-analysis/components/PivotChart.tsx` (route-owned; scenario logic is access-analysis-specific)

```typescript
type PivotSeriesKind = 'bar' | 'pie' | 'treemap' | 'heatmap' | 'sankey' | 'chord';

// Static rule table — evaluated top-to-bottom, first match wins
const PIVOT_RULES: Array<{
  dim1: string; dim2?: string; kind: PivotSeriesKind;
}> = [
  { dim1: 'activity', dim2: 'date',    kind: 'heatmap' },
  { dim1: 'company',  dim2: 'role',    kind: 'sankey'  },
  { dim1: 'role',     dim2: 'module',  kind: 'sankey'  },
  { dim1: 'company',  dim2: 'company', kind: 'chord'   },
  { dim1: 'role',     dim2: 'role',    kind: 'chord'   },
  { dim1: 'folder',   dim2: 'size',    kind: 'treemap' },
  { dim1: 'role',                      kind: 'pie'     },
  { dim1: 'company',                   kind: 'pie'     },
  // fallback:
  { dim1: '*',                         kind: 'bar'     },
];

function resolvePivotKind(dim1: string, dim2?: string): PivotSeriesKind { /* ... */ }
```

**`notMerge` policy:**
- Set `notMerge={false}` for smooth animated updates within the same series type
- Set `notMerge={true}` (or use `key={kind}`) when the series type changes — the `EChart.tsx` wrapper already accepts this prop
- Calendar heatmap with a changed `range` also needs `notMerge={true}`

**Data interface per kind:**
```typescript
// The tRPC pivot endpoint returns a discriminated union:
type PivotResult =
  | { kind: 'bar';      rows: Array<{ label: string; value: number }> }
  | { kind: 'pie';      slices: Array<{ name: string; value: number }> }
  | { kind: 'sankey';   nodes: Array<{ name: string }>; links: Array<{ source: string; target: string; value: number }> }
  | { kind: 'chord';    data: Array<{ name: string; value?: number }>; edges: Array<{ source: string; target: string; value?: number }> }
  | { kind: 'treemap';  data: Array<{ name: string; value: number; children?: unknown[] }> }
  | { kind: 'heatmap';  range: number | string; points: Array<[string, number]>; max: number }
```

**Confidence:** MEDIUM (architecture recommendation based on verified ECharts API surface)

---

## 8. Theme Wiring — What `mergeEChartsTheme` Covers vs. What Does Not

`mergeEChartsTheme` verified behavior (from `lib/colors/echartsTheme.ts`):

**Injected automatically:**
- `textStyle.color`
- `legend[].textStyle.color`
- `xAxis.axisLabel.color` + `xAxis.splitLine.lineStyle.color`
- `yAxis.axisLabel.color` + `yAxis.splitLine.lineStyle.color`
- `tooltip.backgroundColor` + `tooltip.borderColor`

**NOT covered — must be wired manually in every new chart component:**
- `visualMap` colors (calendar heatmap)
- `calendar` component: `dayLabel.color`, `monthLabel.color`, `yearLabel.color`, `splitLine.lineStyle.color`, `itemStyle.borderColor`
- `series[].itemStyle.color` (all series — intentionally caller-owned)
- `series[].lineStyle.color` (sankey edges, chord ribbons, graph edges)
- `treemap` breadcrumb, level border colors, label color
- `chord` arc and ribbon colors

**Standard pattern for uncovered fields:**
```typescript
import { ECHARTS_DARK, ECHARTS_LIGHT } from '@/lib/colors/echartsTheme';
const { resolvedTheme } = useTheme();
const dark = resolvedTheme !== 'light';
const p = dark ? ECHARTS_DARK : ECHARTS_LIGHT;
// Use p.text, p.axis, p.tooltipBg, p.chart[] in the option object
```

This is already the pattern in `ActivityTimelineChart.tsx` (lines 44–47) and `RolesPieChart.tsx` (lines 142–148). Follow it exactly.

---

## 9. Performance Guidelines

### What has progressive rendering
- `scatter`, `line`, `bar` series: `progressive: 500` + `progressiveThreshold: 3000` apply — set `hoverLayerThreshold` ≤ `progressiveThreshold` to avoid hover restarting render
- `graph` with `layout:'force'`: `layoutAnimation: true` spreads simulation over frames (no explicit progressive needed)

### What does NOT have progressive rendering — preaggregate server-side
| Series | Practical cap | Server-side prep |
|--------|--------------|-----------------|
| sankey | ≤50 nodes, ≤200 links | Aggregate by Company/Role/Module in tRPC router |
| chord | ≤20 entities, ≤100 edges | Aggregate co-occurrence matrix in tRPC router |
| treemap | ≤3 levels, ≤500 leaves | Aggregate folder tree depth server-side |
| calendar heatmap | ≤365 points/year | One `GROUP BY date` query per year |

### Resize + dispose
`echarts-for-react` v3 uses `ResizeObserver` internally — no manual `window.addEventListener('resize', ...)` needed. Dispose on unmount is handled by the library automatically. The `key={resolvedTheme}` on `EChart.tsx` forces a clean canvas remount on theme switch — this is already implemented and correct; do not remove it.

### dataZoom
Copy the `ActivityTimelineChart.tsx` dataZoom pattern for any bar/line chart with a large category axis:
```typescript
dataZoom: [
  { type: 'inside' },
  { type: 'slider', height: 16, bottom: 18, /* theme colors */ },
],
```
Sankey, chord, and treemap use `roam: true` instead of dataZoom.

### Animation budget (match existing charts)
- Initial: `animationDuration: 600–800ms`, `animationEasing: 'elasticOut'`
- Updates: `animationDurationUpdate: 400–550ms`, `animationEasingUpdate: 'cubicInOut'`
- Stagger: `animationDelay: (idx) => idx * 16` (already in `RolesPieChart.tsx`)

---

## 10. ECharts Import Types

```typescript
// All available in echarts@6.1.0:
import type {
  EChartsOption,
  SankeySeriesOption,
  ChordSeriesOption,       // NEW in ECharts 6.0 — VERIFY export exists at runtime
  TreemapSeriesOption,
  HeatmapSeriesOption,
  GraphSeriesOption,
} from 'echarts';
```

VERIFY: If `ChordSeriesOption` is not exported from the top-level `echarts` package in the installed version, use `EChartsOption` with an inline type assertion until confirmed.

---

## 11. Do-Not-Add List

| Package / Pattern | Why Blocked |
|-------------------|------------|
| `echarts-gl` | WebGL — hard constraint, no new WebGL on data surfaces |
| Any `echarts-gl` addon | Same |
| `d3-chord` (manual chord from scratch) | ECharts 6 native `type:'chord'` covers it; avoid dual charting stacks |
| `recharts`, `visx`, `nivo`, `plotly.js` | Not in repo; ECharts is the sole chart engine |
| Custom SVG chord implementation | Unnecessary given ECharts 6 native chord |
| `echarts-stat` | Not needed; server-side aggregation covers statistical prep |
| Additional animation libraries | Framer Motion already installed; no new animation deps |

---

## 12. Sources

- ECharts version: `package.json` line 104 [VERIFIED]
- EChart wrapper behavior: `components/ui/EChart.tsx` [VERIFIED]
- Theme injector exact behavior: `lib/colors/echartsTheme.ts` [VERIFIED]
- Chart pattern reference: `app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx`, `RolesPieChart.tsx` [VERIFIED]
- Sankey defaults: [apache/echarts SankeySeries.ts on GitHub](https://github.com/apache/echarts/blob/master/src/chart/sankey/SankeySeries.ts) [MEDIUM]
- Chord defaults: [apache/echarts ChordSeries.ts on GitHub](https://github.com/apache/echarts/blob/master/src/chart/chord/ChordSeries.ts) [MEDIUM]
- Graph defaults: [apache/echarts GraphSeries.ts on GitHub](https://github.com/apache/echarts/blob/master/src/chart/graph/GraphSeries.ts) [MEDIUM]
- Treemap defaults: [apache/echarts TreemapSeries.ts via DeepWiki](https://deepwiki.com/apache/echarts/4.4-treemap-charts) [MEDIUM]
- Heatmap series: [apache/echarts HeatmapSeries.ts on GitHub](https://github.com/apache/echarts/blob/master/src/chart/heatmap/HeatmapSeries.ts) [MEDIUM]
- Calendar options: [UNPKG echarts@5.0.2 CalendarModel.d.ts](https://app.unpkg.com/echarts@5.0.2/files/types/src/coord/calendar/CalendarModel.d.ts) [MEDIUM — v5 types, v6 compatible]
- ECharts 6.0 chord release: [ECharts 6 Features Handbook](https://echarts.apache.org/handbook/en/basics/release-note/v6-feature/) [MEDIUM — official]
- Performance guide: web search + [mintlify ECharts performance](https://www.mintlify.com/apache/echarts/guides/performance) [MEDIUM]
- echarts-for-react dispose/resize: [npm echarts-for-react](https://www.npmjs.com/package/echarts-for-react) + [GitHub hustcc/echarts-for-react](https://github.com/hustcc/echarts-for-react) [MEDIUM]

---

*Stack research addendum: 2026-06-22 — milestone v3.0 new chart types for /access-analysis*

---

---

# v2.0 Stack Research (2026-06-17) — Preserved Below

*Original research for Premium UI/UX Overhaul milestone. Still valid for existing chart depth/polish, TanStack Table, Framer Motion, 2.5D CSS, and R3F hero accent guidance.*

---

## ECharts 6 Depth and Polish

### Gradient Fills

Use `echarts.graphic.LinearGradient` or `echarts.graphic.RadialGradient` inside `itemStyle.color`. This is the primary tool for making flat bars and donut slices look dimensional.

```typescript
import * as echarts from 'echarts/core';

// Vertical gradient on a bar series
itemStyle: {
  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: '#6366f1' },   // top: vivid
    { offset: 1, color: '#1e1b4b' },   // bottom: deep
  ]),
}

// Radial gradient for donut/pie accent segment
itemStyle: {
  color: new echarts.graphic.RadialGradient(0.5, 0.5, 0.8, [
    { offset: 0, color: 'rgba(99,102,241,0.9)' },
    { offset: 1, color: 'rgba(30,27,75,0.3)' },
  ]),
}
```

Both accept a `colorStops` array with `offset` (0–1) and `color` values. Available on all series types (bar, pie, line area, scatter).

### Shadow / Glow Effects

`itemStyle.shadowBlur`, `itemStyle.shadowColor`, `itemStyle.shadowOffsetX/Y` add a CSS-box-shadow-like glow to elements. Use sparingly — one or two accent series with glow, not all.

```typescript
itemStyle: {
  shadowBlur: 20,
  shadowColor: 'rgba(99,102,241,0.6)',
  shadowOffsetY: 4,
}
```

**Perf warning:** Heavy `shadowBlur` values (>30) on dense series (1000+ points) cause measurable frame drops. Keep to KPI hero numbers or donut accent arcs — not the 16,942-node access graph.

### Rounded Donut Segments (`borderRadius`)

Available since ECharts 5.0, still in 6.x. Apply to `itemStyle.borderRadius` on a `type:'pie'` series:

```typescript
series: [{
  type: 'pie',
  radius: ['45%', '72%'],
  itemStyle: {
    borderRadius: 8,        // uniform; or [outerTL, outerTR, innerBR, innerBL]
    borderColor: 'transparent',
    borderWidth: 2,
  }
}]
```

### Hover Lift / Emphasis

The `emphasis` block controls hover state. Use `emphasis.scale` to make a segment pop forward:

```typescript
emphasis: {
  scale: true,
  scaleSize: 8,
  itemStyle: {
    shadowBlur: 30,
    shadowColor: 'rgba(99,102,241,0.8)',
  },
  label: { fontSize: 16, fontWeight: 700 },
}
```

### Animated Transitions

```typescript
// Initial render:
animationDuration: 800,
animationEasing: 'elasticOut',
animationDelay: (idx) => idx * 40,

// Data updates:
animationDurationUpdate: 500,
animationEasingUpdate: 'cubicInOut',
```

`universalTransition` (ECharts 5.2+, in 6.x) enables morphing between chart types — requires consistent `id` fields in data items.

### ECharts GL — Verdict: Skip

Do not install `echarts-gl`. Use ECharts' 2D charts with gradients/shadows for depth. Reserve actual 3D for Three.js hero accents.

---

## Premium Data Table

**TanStack Table v8 + TanStack Virtual v3** — headless, Tailwind-native, no extra peer deps. Already partially in the stack via `@tanstack/react-query`.

**Why not alternatives:**
- `material-react-table` — MUI/Emotion peer deps conflict with zinc/Tailwind
- `AG Grid` — 200KB+; opinionated DOM; fights Tailwind styling
- `react-window` — low-level; not table-semantic; no sort/filter/pinning

**Install:**
```bash
npm install @tanstack/react-table @tanstack/react-virtual
```

---

## Framer Motion 12 — Tasteful Motion

`framer-motion` 12.x installed. Core patterns: `whileInView` (scroll reveal), `variants` with `staggerChildren` (KPI strip stagger), `layout`/`layoutId` (drill-down expansion), `AnimatePresence` with `mode="wait"` (panel transitions).

**Hard rules:**
- Animate `x`, `y`, `scale`, `rotate`, `opacity` only — not `width`, `height`, `top`, `left`
- `viewport={{ once: true }}` on all scroll reveals
- `useReducedMotion()` guard on all motion components
- Cap stagger lists at 20 items

---

## "2.5D" Depth via Tailwind 4 + CSS

Dark glass card: `bg-zinc-900/60 backdrop-blur-md border border-zinc-700/50 shadow-xl shadow-black/40`

Layered shadow with catch-light:
```css
box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 16px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.25);
```

Ambient background blobs (CSS-only, zero JS cost):
```typescript
<div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />
```

---

## Selective Real-3D Hero Accents

`three@0.184.0` already installed. `@react-three/fiber@9` (React 19 compatible) + `@react-three/drei` add ~60KB marginal cost.

**Rules:** Always `ssr: false` dynamic import. `frameloop="demand"` unless continuous animation required. `dpr={[1, 1.5]}` to cap pixel ratio. `pointer-events: none` on decorative canvases.

**Page assignments:** `/access-analysis` → CSS gradient mesh (no WebGL). `/users` → Three.js particle field (contained). `/forma-proposal` → `MeshDistortMaterial` sphere. `/template-mty` → none needed.

---

*v2.0 stack research: 2026-06-17*
