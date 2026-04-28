# Stack Research

**Domain:** WebGL graph rendering module for Next.js 16 / React 19 AEC dashboard
**Researched:** 2026-04-28
**Confidence:** MEDIUM — core package facts verified via npm/GitHub search; React 19 peer-dep status for @cosmograph/react is LOW confidence (no official compatibility statement found)

---

## Scope

This file covers ONLY the net-new additions for the Cosmos.gl ACC Users Graph module.
The existing validated stack (Next.js 16, React 19, tRPC 11, Prisma 7, TypeScript 6, Tailwind 4, Vitest) is NOT repeated here.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@cosmos.gl/graph` | `^2.6.4` | GPU-accelerated WebGL force-graph engine | The only WebGL-native graph lib that handles 500+ nodes at 60fps via typed-array GPU textures. Framework-agnostic (no React peer dep). OpenJS Foundation project. The older `@cosmograph/cosmos` is the same library — it migrated to this package name. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@cosmograph/react` | `^1.4.2` | React component wrapper for `@cosmograph/cosmos` | **Avoid for now — see "What NOT to Use".** Listed here for awareness only. |
| No additional typed-array utility lib needed | — | `Float32Array` is native JS | Cosmos.gl's `setPointPositions()` and `setLinks()` accept raw `Float32Array` directly. No third-party flatten/pack utility is needed for the AEC user-graph scale (< 10k nodes). |
| No additional WebGL context lib needed | — | Cosmos.gl manages its own WebGL context | It creates and owns the WebGL canvas internally when given a `<div>` ref. Do not manually create a `<canvas>`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Existing Vitest harness | Unit-test typed-array data transformation (node/edge builders) | Test the data-mapping layer (APS → Float32Array) with Vitest; don't try to render the WebGL canvas in tests — use mocks. |
| TypeScript (already in stack) | `@cosmos.gl/graph` ships its own `.d.ts` types | No `@types/*` package needed. |

---

## Installation

```bash
# Only new production dependency
npm install @cosmos.gl/graph
```

No dev dependencies need to be added for the renderer itself.

---

## SSR / Hydration Strategy

Cosmos.gl requires a real browser WebGL context. It CANNOT run server-side. The correct Next.js App Router pattern is a two-layer wrapper:

**Layer 1 — Client Component (owns the graph instance)**

```tsx
// components/acc-users-graph/CosmosGraph.tsx
'use client'
import { useEffect, useRef } from 'react'
import { Graph } from '@cosmos.gl/graph'

export function CosmosGraph({ pointPositions, links, config }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    graphRef.current = new Graph(containerRef.current, config)
    graphRef.current.setPointPositions(pointPositions)
    graphRef.current.setLinks(links)
    graphRef.current.start()
    return () => graphRef.current?.pause()
  }, [])

  // Update data separately to avoid re-creating the GPU context
  useEffect(() => {
    graphRef.current?.setPointPositions(pointPositions)
    graphRef.current?.setLinks(links)
    graphRef.current?.restart()
  }, [pointPositions, links])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
```

**Layer 2 — Dynamic wrapper disables SSR**

```tsx
// components/acc-users-graph/CosmosGraphDynamic.tsx
import dynamic from 'next/dynamic'

export const CosmosGraphDynamic = dynamic(
  () => import('./CosmosGraph').then(m => m.CosmosGraph),
  { ssr: false, loading: () => <div>Loading graph...</div> }
)
```

**Why this two-layer pattern:**
- `dynamic(..., { ssr: false })` cannot be used inside a Server Component directly — it must be called inside a Client Component or a plain module file. The wrapper file is that module.
- The `'use client'` directive on `CosmosGraph.tsx` ensures React hooks (`useRef`, `useEffect`) are available.
- The `ssr: false` ensures no attempt is made to call `new Graph()` on the server where `WebGLRenderingContext` is undefined.

**Page usage (Server Component is fine):**

```tsx
// app/(dashboard)/acc-users-graph/page.tsx
import { CosmosGraphDynamic } from '@/components/acc-users-graph/CosmosGraphDynamic'

export default function AccUsersGraphPage() {
  return <CosmosGraphDynamic />
}
```

---

## Data Processing Pattern (Typed Arrays)

Cosmos.gl v2 accepts `Float32Array` directly — no parsing overhead. Transform APS user/role data in a tRPC route output transformer before passing to the component:

```ts
// Interleaved x,y per point: [x0, y0, x1, y1, ...]
const pointPositions = new Float32Array(users.length * 2)
users.forEach((u, i) => {
  pointPositions[i * 2]     = u.x   // or 0 for initial layout
  pointPositions[i * 2 + 1] = u.y
})

// Interleaved source,target per link: [s0, t0, s1, t1, ...]
const links = new Float32Array(edges.length * 2)
edges.forEach((e, i) => {
  links[i * 2]     = e.sourceIndex
  links[i * 2 + 1] = e.targetIndex
})
```

Colors and sizes follow the same pattern (`Float32Array` of RGBA values). Do this transformation client-side in a `useMemo` to avoid re-running on every render.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@cosmos.gl/graph` | `sigma.js` + `graphology` | If you need SVG labels, rich interactive UX (click/hover), and max node count is < 50k. Sigma.js is more ergonomic but tops out at ~100k nodes with its WebGL renderer. For this project's 500-node requirement, either works — but Cosmos.gl is mandated by PROJECT.md. |
| `@cosmos.gl/graph` | `react-force-graph` (d3-force) | Only for graphs < ~300 nodes where SVG is acceptable. d3-force degrades severely at scale. |
| `@cosmos.gl/graph` | `@cosmograph/react` wrapper | The React wrapper is last published 7 months ago (v1.4.2) with no explicit React 19 peer-dep declaration. Use the plain `@cosmos.gl/graph` with `useRef` pattern above instead — it gives direct API control and avoids version conflicts. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@cosmograph/react` | Last published 7 months ago; no declared React 19 compatibility. Wraps `@cosmograph/cosmos` (old package name). Adds a dependency layer with no benefit when the plain `useRef` pattern is just as simple and gives direct access to all Graph APIs. | Plain `@cosmos.gl/graph` with `useRef` + `useEffect` |
| `@cosmograph/cosmos` | Deprecated — migrated to `@cosmos.gl/graph`. Same code, old package name. | `@cosmos.gl/graph` |
| `d3` (for force layout) | Cosmos.gl handles force simulation entirely on the GPU. Adding d3-force creates two competing physics engines and breaks layout. D3 as a data utility (scales, color interpolation) is fine but NOT d3-force. | Cosmos.gl's built-in simulation config (`simulationFriction`, `simulationGravity`, etc.) |
| `cytoscape` / `react-cytoscapejs` | SVG/Canvas hybrid, degrades at 10k nodes, un-React-like API. Not a WebGL renderer. | `@cosmos.gl/graph` |
| `three.js` / `babylon.js` | 3D engines for 2D graph is massive overkill. Brings GLSL shader complexity and large bundle size. | `@cosmos.gl/graph` |
| Creating a `<canvas>` element manually | Cosmos.gl creates and manages its own WebGL canvas inside the `<div>` you provide. Passing it a `<canvas>` instead of a `<div>` is not the documented API and may break across versions. | Pass a `<div ref>` as shown in the SSR pattern above |
| `@cosmos.gl/graph` v3.x beta | Version 3.0.0-beta.6 introduces a new luma.gl rendering engine with breaking API changes (async constructor). Use stable `^2.6.4` for production. | `^2.6.4` stable |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@cosmos.gl/graph@^2.6.4` | React 19 (no peer dep on React) | Framework-agnostic — no React peer dependency declared. Safe to install alongside React 19 without `--legacy-peer-deps`. |
| `@cosmos.gl/graph@^2.6.4` | Next.js 16 App Router | Compatible when wrapped with `dynamic(..., { ssr: false })`. Not SSR-safe on its own. |
| `@cosmos.gl/graph@^2.6.4` | TypeScript 6 | Ships its own `.d.ts`. No `@types` package needed. |
| `@cosmos.gl/graph@^2.6.4` | Node.js (server) | NOT compatible — requires `window`, `WebGLRenderingContext`. Never import at module scope in a Server Component or API route. |

---

## Stack Patterns by Variant

**If graph data is static (loaded once per page visit):**
- Fetch via tRPC `useQuery` → transform to `Float32Array` in `useMemo` → pass to `CosmosGraph`
- No streaming or polling needed for v1.0

**If graph needs real-time updates (future milestone):**
- Replace tRPC `useQuery` with `useSubscription` or a polling interval
- Call `graph.setPointPositions()` + `graph.setLinks()` + `graph.restart()` incrementally — do NOT reconstruct the `Graph` instance on data change

**If the graph canvas needs to share space with Tailwind-styled UI (filters, legend):**
- Keep the `<div ref>` fixed-size with an explicit pixel height (e.g., `h-[600px]`)
- Cosmos.gl reads the container dimensions at init — percentage heights require the parent to have a resolved height first

---

## Sources

- [cosmosgl/graph GitHub repository](https://github.com/cosmosgl/graph) — package structure, API (MEDIUM confidence — verified via search results referencing README and releases)
- [@cosmos.gl/graph on npm](https://www.npmjs.com/package/@cosmos.gl/graph) — version 2.6.4, 13 dependencies, last published April 2026 (MEDIUM confidence)
- [OpenJS Foundation announcement](https://openjsf.org/blog/introducing-cosmos-gl) — framework-agnostic design confirmed (MEDIUM confidence)
- [Next.js lazy loading docs](https://nextjs.org/docs/app/guides/lazy-loading) — `dynamic()` + `ssr: false` pattern (HIGH confidence — official docs)
- [The ssr:false trap in Next.js App Router — Medium](https://medium.com/@joshisagarm3/the-ssr-false-trap-in-next-js-app-router-and-how-i-escaped-it-74816bc7a778) — two-layer wrapper requirement (MEDIUM confidence)
- [@cosmograph/react on npm](https://www.npmjs.com/package/@cosmograph/react) — v1.4.2, last published 7 months ago (MEDIUM confidence — avoid recommendation)
- WebSearch results: cosmos.gl typed-array API (Float32Array setPointPositions/setLinks) — MEDIUM confidence

---
*Stack research for: Cosmos.gl ACC Users Graph module — LECG Dashboard*
*Researched: 2026-04-28*
