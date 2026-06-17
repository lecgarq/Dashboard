# Stack Research — Premium UI/UX Techniques

**Domain:** Brownfield Next.js 16 / React 19 BIM dashboard — presentation layer overhaul
**Researched:** 2026-06-17
**Confidence:** MEDIUM (ECharts/Motion/Tailwind techniques); LOW (cross-verified via websearch for cutting-edge ECharts 6 specifics)

> LOCKED STACK: All framework/library decisions below are constrained to the installed stack.
> No new frameworks. Recommend only compatible additions or usage patterns.

---

## 1. ECharts 6 Depth and Polish

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

ECharts 5.3 added 4-value array form for per-corner control. The existing app already uses donut charts; adding `itemStyle.borderRadius: 8` is a one-line premium upgrade.

### Hover Lift / Emphasis

The `emphasis` block controls hover state. Use `emphasis.scale` to make a segment pop forward:

```typescript
emphasis: {
  scale: true,           // enables scale on hover (default true for pie)
  scaleSize: 8,          // pixels of "lift"
  itemStyle: {
    shadowBlur: 30,
    shadowColor: 'rgba(99,102,241,0.8)',
  },
  label: {
    fontSize: 16,
    fontWeight: 700,
  }
}
```

For bar charts, `emphasis.itemStyle.color` can shift to a brighter gradient. Pair with `blur: { itemStyle: { opacity: 0.3 } }` to de-emphasize non-hovered elements — creates strong focus effect.

### Animated Transitions

ECharts has two animation layers:

**Initial render animation:**
```typescript
animation: true,
animationDuration: 800,
animationEasing: 'cubicOut',       // or 'elasticOut' for premium spring feel
animationDelay: (idx) => idx * 40, // stagger by data index
```

**Data-update animation (drill-downs, filter changes):**
```typescript
animationDurationUpdate: 500,
animationEasingUpdate: 'cubicInOut',
```

**`universalTransition`** (added in ECharts 5.2, available in 6.x) enables morphing between chart types — e.g., a pie transforming to a bar on click. Requires consistent `id` fields in data items and explicit import:

```typescript
import { UniversalTransition } from 'echarts/features';
echarts.use([UniversalTransition]);

// Then on series:
universalTransition: { enabled: true }
```

This is the most cinematic effect in the toolkit. Use for drill-down transitions (donut → bar breakdown). **Perf: cheap — it's transform-based.**

### ECharts 6 Segmented Doughnut

ECharts 6 ships `@echarts-x/custom-segmented-doughnut` as an officially maintained custom series. Install separately:

```bash
npm install @echarts-x/custom-segmented-doughnut
```

Use for discrete-progress KPI rings (e.g., "72/100 projects active"). Renders as a segmented arc with gaps — looks substantially more premium than a plain donut. **This is directly applicable to the access-analysis KPI strip.**

### ECharts GL — Verdict: Skip for This Milestone

`echarts-gl` adds `bar3D`, `surface3D`, `scatter3D`. Assessment:
- Separate package, thin documentation, slower update cadence
- Layers WebGL on top of ECharts' 2D canvas architecture (not rearchitected around GPU)
- Adds ~200KB+ to bundle
- The app already has Three.js 0.184 and cosmos.gl for real-3D work

**Decision: Do not install echarts-gl.** Use ECharts' 2D charts with gradients/shadows for "depth feel." Reserve actual 3D for Three.js hero accents (see Section 5).

### ECharts Theming with next-themes

ECharts 6 adds native dynamic theme switching via `chart.setTheme()` without disposing/reinitializing the instance. In the React layer (echarts-for-react wrapper), pass the `theme` prop and change it reactively:

```typescript
import { useTheme } from 'next-themes';

// Existing pattern in the codebase — confirm it follows this:
const { resolvedTheme } = useTheme();
const echartsTheme = resolvedTheme === 'dark' ? zincDarkTheme : zincLightTheme;

<ReactECharts option={option} theme={echartsTheme} />
```

Define `zincDarkTheme` and `zincLightTheme` as objects:

```typescript
const zincDarkTheme = {
  backgroundColor: 'transparent',   // let CSS background show through
  textStyle: { color: '#a1a1aa' },   // zinc-400
  title: { textStyle: { color: '#f4f4f5' } },
  legend: { textStyle: { color: '#a1a1aa' } },
  color: ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444'],
  categoryAxis: { axisLabel: { color: '#71717a' }, splitLine: { lineStyle: { color: '#27272a' } } },
  valueAxis: { axisLabel: { color: '#71717a' }, splitLine: { lineStyle: { color: '#27272a' } } },
};
```

**Codebase note:** MEMORY.md records "ECharts must read `resolvedTheme` via `useTheme` for canvas colors" — this is already the known convention. The theme object approach above makes it systematic.

**Perf:** Changing the `theme` prop triggers a chart re-init in echarts-for-react. Use `key={resolvedTheme}` to force clean remount only on theme change, not on every option change. This is the correct pattern to avoid stale canvas state.

---

## 2. Premium Data Table

### Recommendation: TanStack Table v8 + TanStack Virtual v3

**Already partially in the stack** — `@tanstack/react-query` 5.100.14 is installed; TanStack Table v8 follows the same headless philosophy. This avoids pulling in a new heavy component library.

**Why not alternatives:**
- `material-react-table` — requires MUI + Emotion peer deps; conflicts with the zinc/Tailwind design system
- `AG Grid` — powerful but opinionated; 200KB+ community edition; overkill for this use case and fights Tailwind styling
- `react-window` (already in use for the 2,474-line monolith) — too low-level; not table-semantic; no built-in sort/filter/column pinning

**Install:**
```bash
npm install @tanstack/react-table @tanstack/react-virtual
```

**Core pattern:**
```typescript
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

// 1. Table logic
const table = useReactTable({
  data: users,        // 3,367 user rows
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  state: { sorting },
  onSortingChange: setSorting,
});

// 2. Virtualizer for the tbody
const { rows } = table.getRowModel();
const virtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 56,             // 56px row height
  overscan: 10,
});

// 3. Render
return (
  <div ref={scrollRef} className="h-full overflow-auto">
    <table className="w-full border-separate border-spacing-0">
      <thead className="sticky top-0 z-10 bg-zinc-900/80 backdrop-blur-sm">
        {/* render header groups */}
      </thead>
      <tbody style={{ height: virtualizer.getTotalSize() + 'px', position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const row = rows[virtualRow.index];
          return (
            <tr
              key={row.id}
              style={{ transform: `translateY(${virtualRow.start}px)`, position: 'absolute', width: '100%' }}
              className="cursor-pointer hover:bg-zinc-800/60 transition-colors duration-150"
              onClick={() => onUserClick(row.original)}
            >
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} className="px-4 py-3 text-sm">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);
```

**Depth styling on the table (not flat):**
- `thead`: `bg-zinc-900/80 backdrop-blur-sm` — frosted glass sticky header
- `th`: `border-b border-zinc-800` — subtle separator
- `tr` hover: `bg-zinc-800/60` — subtle lift without border flash
- Row with activity: left `border-l-2 border-indigo-500` accent
- Sort icons: lucide-react `ArrowUpDown`/`ArrowUp`/`ArrowDown` (already installed)

**Perf:** Spacer-based virtualization renders only ~20–30 DOM rows at a time regardless of dataset size. The current 2,474-line monolith loads ~7–15MB via 6+ tRPC calls; the table itself will be fast once those queries are consolidated.

---

## 3. Framer Motion 12 — Tasteful Motion

**Installed:** `framer-motion` 12.38.0 (also callable as `motion/react` — the package was renamed but framer-motion still ships the same API; no migration needed on this codebase).

### Scroll Reveal (Enter Animations)

```typescript
import { motion } from 'framer-motion';

// Card entering viewport
<motion.div
  initial={{ opacity: 0, y: 24 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: '-80px' }}   // fire 80px before fully in view
  transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
>
```

`viewport={{ once: true }}` is mandatory — without it, the animation replays on every scroll, which looks amateurish and wastes GPU.

### Staggered Grid Reveal (KPI strip, chart panels)

```typescript
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } }
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
};

<motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-4 gap-4">
  {kpiCards.map(c => (
    <motion.div key={c.id} variants={item}>
      <KpiCard {...c} />
    </motion.div>
  ))}
</motion.div>
```

Cap stagger at **20 items maximum** — beyond that, the last items animate so late the effect reads as a bug, not design.

### Layout Transitions (Drill-down panels expanding)

```typescript
<motion.div layout layoutId="drillPanel" className="...">
  {isExpanded && <DrillContent />}
</motion.div>
```

`layout` prop auto-animates size/position changes on any structural shift. `layoutId` enables shared element transitions across pages (e.g., a donut segment expanding to a full panel). **Do not animate `height` or `width` directly — use `layout` instead; it uses transforms (GPU-only).**

### AnimatePresence (Mounting/unmounting panels)

```typescript
import { AnimatePresence } from 'framer-motion';

<AnimatePresence mode="wait">
  {activePanel && (
    <motion.div
      key={activePanel}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25 }}
    >
      <DrillPanel />
    </motion.div>
  )}
</AnimatePresence>
```

`mode="wait"` ensures the exit animation completes before the enter animation starts — prevents two panels stacking.

### Micro-interactions (buttons, table rows)

```typescript
<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
>
```

Spring transitions feel tactile. Stiffness 300–500 / damping 15–20 gives a snappy, premium feel without oscillation.

### Performance Rules (Hard constraints)

| Do | Don't |
|----|-------|
| Animate `x`, `y`, `scale`, `rotate`, `opacity` | Animate `width`, `height`, `top`, `left`, `padding` |
| `viewport={{ once: true }}` on all scroll reveals | Trigger animations on every scroll re-entry |
| Cap stagger lists at 20 items | Stagger 100+ table rows |
| Use `useReducedMotion()` guard | Ignore `prefers-reduced-motion` |
| `will-change: transform` via Tailwind `will-change-transform` on key surfaces | Apply `will-change` globally |

```typescript
import { useReducedMotion } from 'framer-motion';
const prefersReduced = useReducedMotion();
const transition = prefersReduced ? { duration: 0 } : { duration: 0.4 };
```

---

## 4. "2.5D" Depth via Tailwind 4 + CSS

### Glassmorphism Card System (Light + Dark)

Tailwind 4 (installed: 4.3.0) ships `backdrop-blur-*` utilities natively. The technique requires a colorful or textured backdrop to be visible — on pure zinc `#09090B`, add a subtle gradient background layer first.

**Dark mode glass card (primary pattern):**
```
bg-zinc-900/60 backdrop-blur-md border border-zinc-700/50 shadow-xl shadow-black/40
```

**Light mode glass card:**
```
bg-white/70 backdrop-blur-md border border-zinc-200/80 shadow-lg shadow-zinc-200/60
```

**With dark: prefix (Tailwind 4 variant):**
```
bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-700/50
shadow-lg shadow-zinc-200/50 dark:shadow-black/40
```

### Layered Shadow System (Depth Without 3D)

Use multiple shadows at different offsets to create "lifted" cards that read as premium:

```css
/* Tailwind 4 arbitrary value */
shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset,0_4px_16px_0_rgba(0,0,0,0.4),0_1px_4px_0_rgba(0,0,0,0.3)]
```

Or in `globals.css` as a utility class applied via Tailwind's `@utility`:

```css
@utility card-lifted {
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),   /* top edge highlight */
    0 4px 16px rgba(0,0,0,0.35),             /* ambient lift */
    0 1px 4px rgba(0,0,0,0.25);             /* contact shadow */
}
```

The `inset 0 1px 0 rgba(255,255,255,0.06)` line adds a subtle "catch-light" on the top edge — this single line makes cards read as physical objects.

### Gradient Borders (Premium Accent)

Gradient borders are not natively in Tailwind but achievable with a pseudo-element trick or `border-image`:

```typescript
// Component approach using a wrapper div
<div className="p-px rounded-xl bg-gradient-to-br from-indigo-500/40 via-transparent to-purple-500/20">
  <div className="rounded-xl bg-zinc-900 p-4">
    {children}
  </div>
</div>
```

The outer div has the gradient background; the inner div covers it except for 1px (`p-px` = 1px padding). This creates a gradient "border" visible only at the edge. On hover, animate the outer gradient opacity with Framer Motion for a glow-on-hover effect.

### Background Depth Layer

Pure zinc `#09090B` with no texture reads flat. Add a subtle gradient or noise texture behind all content:

```typescript
// app/layout.tsx or page root
<div className="min-h-screen bg-zinc-950 relative overflow-hidden">
  {/* Ambient color blobs — position:absolute, pointer-events:none, no interaction cost */}
  <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />
  <div className="absolute bottom-1/4 right-0 w-[400px] h-[300px] bg-violet-900/15 rounded-full blur-3xl pointer-events-none" />
  {children}
</div>
```

These blurred blobs are CSS-only (no JS, no canvas) and give glassmorphism cards a visible backdrop to blur against. **Perf: pure CSS, zero runtime cost.**

### Typography Depth

- Use `text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400` for hero headline text — the gradient makes white text feel three-dimensional
- Section labels: `text-zinc-500 uppercase tracking-widest text-xs` — recede into background, create hierarchy
- Active/selected states: `text-indigo-400` vs rest `text-zinc-400` — color alone creates depth

---

## 5. Selective Real-3D Hero Accents

### When It's Worth It vs. Faking Depth

The "fake 3D" via CSS (Section 4) covers 95% of the premium feel at near-zero perf cost. Real WebGL is worth adding for **one or two moments that genuinely cannot be faked** — a rotating globe on the access-analysis hero, a particle mesh on the `/users` header, a morphing blob on `/forma-proposal`.

**Rule:** If the same effect can be achieved with CSS gradients + Framer Motion blur, skip Three.js for that surface.

### The Lightest-Weight Approach: Raw Three.js (Already Installed)

The app already ships `three@0.184.0`. Adding `@react-three/fiber@9` (R3F) adds ~60KB gzip on top of the existing Three.js bundle. Since Three.js is already loaded for `cosmos.gl`, the **marginal cost of R3F is small**.

**Installation:**
```bash
npm install @react-three/fiber@9 @react-three/drei
```

**React 19 compatibility:** `@react-three/fiber@9` explicitly targets React 19 (v8 does not work with React 19). Use `@react-three/fiber@rc` if v9 is not yet stable by the time of implementation.

**Drei** (`@react-three/drei`) provides pre-built helpers — `Float`, `MeshDistortMaterial`, `Sphere`, `Environment`, `Text3D`, `Html` — that turn a 3D hero accent from 100 lines into 10.

**Lazy-load pattern (critical for perf):**

```typescript
// components/HeroGlobe.tsx
'use client';
import { Canvas } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial } from '@react-three/drei';

export default function HeroGlobe() {
  return (
    <Canvas camera={{ position: [0, 0, 3] }} className="absolute inset-0 pointer-events-none">
      <ambientLight intensity={0.4} />
      <pointLight position={[2, 2, 2]} intensity={1.2} color="#6366f1" />
      <Sphere args={[1, 64, 64]}>
        <MeshDistortMaterial
          color="#1e1b4b"
          distort={0.25}
          speed={1.5}
          roughness={0.1}
          metalness={0.8}
        />
      </Sphere>
    </Canvas>
  );
}

// In page component — dynamic import prevents SSR crash + defers bundle:
const HeroGlobe = dynamic(() => import('@/components/HeroGlobe'), { ssr: false });
```

**Perf rules for WebGL accents:**
- Always `ssr: false` dynamic import — Three.js requires `window`
- Set `frameloop="demand"` on `<Canvas>` unless continuous animation is needed — renders only on camera/prop changes
- `dpr={[1, 1.5]}` to cap pixel ratio (retina screens at 2x cost 4x pixels)
- Keep `<Canvas>` to a contained region (`w-64 h-64`), not full-viewport — the access-analysis graph already owns the main canvas
- `pointer-events: none` on decorative canvases — they should never capture clicks

### What NOT to do

- **Do not** put a full-viewport Three.js canvas on the data pages — that's the spatial-graph project's scope, explicitly deferred
- **Do not** animate geometry in `useFrame` every tick unless motion is the purpose — use `frameloop="demand"` with state triggers instead
- **Do not** install echarts-gl — it adds WebGL overhead without the quality of a dedicated Three.js scene

### Specific Hero Accent Recommendations per Page

| Page | Hero Accent | Implementation | Cost |
|------|------------|----------------|------|
| `/access-analysis` | Animated gradient mesh behind KPI strip | CSS `@keyframes` gradient-shift — no WebGL | Zero |
| `/users` | Frosted glass header with subtle particle field | Three.js `Points` with 200 particles, `frameloop="demand"` | ~8KB scene |
| `/template-mty` | None needed — data density is the premium | CSS glassmorphism cards | Zero |
| `/forma-proposal` | Distorted sphere background blob | `MeshDistortMaterial` sphere, `ssr:false` | ~12KB scene |

---

## 6. Compatibility and Versioning

| Package | Version (installed) | Notes |
|---------|---------------------|-------|
| echarts | 6.1.0 | `borderRadius`, `universalTransition`, `dynamic theme` all confirmed present |
| framer-motion | 12.38.0 | `layout`, `layoutId`, `whileInView`, `AnimatePresence` all stable; React 19 fixes confirmed in 12.39.0 — update to 12.39+ |
| @tanstack/react-table | NOT installed | Install v8 latest |
| @tanstack/react-virtual | NOT installed | Install v3 latest |
| @react-three/fiber | NOT installed | Install v9 (React 19 required) |
| @react-three/drei | NOT installed | Install latest (peer dep: three@0.184) |
| @echarts-x/custom-segmented-doughnut | NOT installed | Optional — install only for KPI ring segments |
| tailwindcss | 4.3.0 | `backdrop-blur-*`, `bg-*/NN` alpha syntax, `dark:` variant all available |
| next-themes | 0.4.6 | `useTheme().resolvedTheme` is the correct hook |

**Update framer-motion to 12.39.0+** before execution: version 12.39.0 fixed "Preserve in-flight motion value animations across React 19 reorder unmount/remount" — without this, layout animations on the users table re-render will flicker.

---

## 7. Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Data table | TanStack Table v8 + Virtual v3 | material-react-table v3 | Brings MUI/Emotion peer deps; conflicts with zinc/Tailwind design system |
| Data table | TanStack Table v8 + Virtual v3 | AG Grid Community | 200KB+; highly opinionated DOM structure; fights Tailwind class-based styling |
| Data table | TanStack Table v8 + Virtual v3 | react-window (current) | Low-level; not table-semantic; no sort/filter/pinning; harder to style for premium look |
| 3D accents | R3F v9 + drei | echarts-gl | echarts-gl adds WebGL overhead with worse 3D quality; Three.js already in bundle |
| 3D accents | R3F v9 + drei | Raw Three.js imperative | React declarative model integrates cleaner with Next.js RSC + concurrent rendering |
| Glass depth | CSS backdrop-blur + Tailwind | react-spring parallax | Unnecessary dep; Framer Motion already installed for the same outcome |
| Donut premium | itemStyle.borderRadius + segmented-doughnut | Replacing ECharts | ECharts 6 is already capable; replacement would be a rewrite of all chart components |

---

## 8. What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| echarts-gl | Thin maintenance, WebGL-on-canvas architecture, large bundle, conflicts with three.js scope | Three.js R3F for real-3D accents; ECharts 2D with gradients for chart depth |
| AG Grid | Opinionated DOM, 200KB+ community edition, fights Tailwind | TanStack Table v8 (headless, Tailwind-native) |
| material-react-table | MUI/Emotion peer deps conflict with zinc design system | TanStack Table v8 (same underlying engine, no extra deps) |
| react-spring | Redundant with Framer Motion 12; two animation systems conflict | Framer Motion 12 (already installed) |
| Animating `width`/`height`/`top`/`left` in Framer Motion | Triggers layout reflow on every frame; janky on lower-end machines | `layout` prop (transform-based, GPU-composited) |
| `viewport={{ once: false }}` | Animations replay on every scroll; reads as unfinished/buggy | `viewport={{ once: true }}` |
| Full-viewport Three.js canvas on data pages | Competes with ECharts canvases; the spatial-graph page is a separate project | Contained `<Canvas>` in a fixed-size region with `pointer-events:none` |
| `staggerChildren` on >20 items | Last items animate so late the effect reads as a loading bug | Cap at 20 items or use grouping |
| Tailwind `shadow-*` alone for depth | Flat single-offset shadows read as dated (2018 Material era) | Layered multi-shadow with inset catch-light highlight |

---

## Sources

- [ECharts 6 Features](https://echarts.apache.org/handbook/en/basics/release-note/v6-feature/) — confirmed feature list (confidence: MEDIUM)
- [ECharts 5.2 Release Notes](https://echarts.apache.org/handbook/en/basics/release-note/5-2-0/) — universalTransition confirmed (confidence: MEDIUM)
- [ECharts Doughnut Handbook](https://apache.github.io/echarts-handbook/en/how-to/chart-types/pie/doughnut/) — donut radius config (confidence: MEDIUM)
- [ECharts Dynamic Theme PR #20705](https://github.com/apache/echarts/pull/20705) — v6 setTheme without reinit (confidence: MEDIUM)
- [ECharts borderRadius roundup via web search](https://echarts.apache.org/handbook/en/basics/release-note/5-3-0/) — confirmed 4-value array (confidence: LOW)
- [TanStack Table v8 virtualized rows](https://medium.com/@ashwinrishipj/building-a-high-performance-virtualized-table-with-tanstack-react-table-ced0bffb79b5) — spacer-based pattern (confidence: LOW)
- [TanStack Virtual v3 introduction](https://tanstack.com/virtual/latest/docs/introduction) — useVirtualizer API (confidence: MEDIUM)
- [Framer Motion performance pitfalls](https://dev.to/whoffagents/framer-motion-animations-that-dont-kill-performance-patterns-and-pitfalls-5cki) — safe vs unsafe properties (confidence: LOW)
- [Motion v12 changelog](https://motion.dev/changelog) — React 19 fixes, axis-locked layout, new color spaces (confidence: MEDIUM)
- [React Three Fiber v9 / React 19](https://r3f.docs.pmnd.rs/getting-started/installation) — v9 required for React 19 (confidence: MEDIUM)
- [Glassmorphism with Tailwind — Epic Web](https://www.epicweb.dev/tips/creating-glassmorphism-effects-with-tailwind-css) — class recipes (confidence: LOW)
- [FlyonUI Glassmorphism guide](https://flyonui.com/blog/glassmorphism-with-tailwind-css/) — blur class table (confidence: LOW)
- [echarts-x/custom-segmented-doughnut npm](https://www.npmjs.com/package/@echarts-x/custom-segmented-doughnut) — ECharts 6 custom series (confidence: LOW)

---

*Stack research for: LECG Dashboard Premium UI/UX Overhaul*
*Researched: 2026-06-17*
