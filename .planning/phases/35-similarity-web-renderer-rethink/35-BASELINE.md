# Phase 35 Renderer Candidate Measurements

**Measured:** 2026-07-20
**Harness:** isolated webpack production build on `:3100`, Chromium 1600×1000,
`NEXT_PUBLIC_ACC_GRAPH_TEST=1`, full authenticated live snapshot, controller reset to
Tier 0, 3-second warm-up, then a continuous >=10-second rAF sample.

## Current full-data input

- Nodes: **22,279**.
- Mapped similarity links: **18,000** (the current server cap maps fully; this resolves
  the CONTEXT `VERIFY:` and supersedes the historical ~14.2k observation).
- Historical Phase-33 reference: **41.33 fps** after ambient-only redraw throttling;
  causal A/B attributed approximately **40 ms/frame** to main-thread Canvas2D raster.

## Comparable candidate results

| Candidate | Drawn ambient links | FPS / elapsed | Tier result | Result |
|---|---:|---:|---|---|
| Current main-thread Canvas2D | 18,000 | **39.79 / 10.003s** | **0 → 2**; 22,279 → 0 animated | Control; fails the renderer ceiling |
| Cosmos-native curved GPU links | 18,000 | **60.03 / 10.012s** | **0 → 0**; 22,279 animated | Winner |
| OffscreenCanvas worker, 10 Hz raster | 18,000 | **60.01 / 10.015s** | **0 → 0**; 22,279 animated | Viable but more machinery |
| Deterministic Canvas decimation, 10 Hz | 4,500 (stable 1-in-4) | **60.19 / 10.019s** | **0 → 0**; 22,279 animated | Viable fallback; unnecessary thinning |

All three alternatives remove the main-thread raster ceiling in this sample. The native
and worker candidates keep the complete ambient edge set; decimation measured a stable
ambient subset only and did not alter the authoritative 18,000-link data count.

## Prototype details and visual evidence

### Canvas2D control

Used the shipped `SimilarityWebOverlay.tsx` path unchanged. The existing
`phase32-ambient.spec.ts` gate produced:

`fps=39.7897`, `before tier=0`, `after tier=2`, `lastWindowFps=37.4996`,
`nodeCount=22279`, `edgeCount=18000`.

### Cosmos-native curved links

Disposable seam used installed `@cosmos.gl/graph` 3.3.0 only:

- full `[source,target]` buffer;
- current per-edge palette RGBA and exact 0.65/1.05/1.55 strength widths;
- `curvedLinks:true` with `curvedLinkControlPointDistance:0.14`;
- one atomic queued links/colors/widths update followed by `render()`.

Visual inspection of machine-local screenshots
`scratch/phase35-canvas-control.png` and `scratch/phase35-cosmos-native.png` confirmed
the complete colored web renders over the intact node map. The Cosmos curve is visibly
close but not pixel-identical to the old quadratic Path2D bow, matching the owner's
explicit acceptance. An earlier invalid native sample was discarded: a premature
`create()` consumed update flags against the old zero-link state and rendered no links;
the screenshot caught it before evidence was accepted.

### OffscreenCanvas worker

The existing overlay canvas was hidden and a transferred OffscreenCanvas rendered the
actual 18,000 indexed edges and live Cosmos positions at the shipped 10 Hz ambient
cadence. Projection remained on the main thread and transferred a fresh position buffer
per draw. It held 60 fps, but adds a worker lifecycle, buffer transport, duplicated
Canvas drawing code, and a browser fallback for no performance gain over native.

### Zoom-decimated Canvas

A disposable main-thread canvas drew the deterministic `i % 4 === 0` ambient subset
(4,500 of 18,000) at 10 Hz over the same live positions. It held 60 fps, proving
decimation is a valid emergency lever. It was not selected because native holds the same
ceiling with the full web; selected/hovered completeness therefore needs no decimation
implementation.

## Decision

**Ship Cosmos-native curved GPU links alone.** It is the smallest winner:

- 60.03 fps, full 18,000-link web, Tier 0 held;
- reuses the existing Cosmos WebGL surface and installed dependency;
- no worker, transfer protocol, duplicate renderer, or zoom threshold;
- no edge thinning, so the owner's decimation fallback remains unused;
- installed APIs directly cover per-link colors/widths, curved geometry, and runtime
  updates needed for the Phase-32 focus/morph contract.

Plan 35-02 must implement complete ambient < selected < hovered buffer ordering,
synthesized selected-match edges, 25% morph opacity, reduced-motion snap, and the
frozen-handle invariant before this candidate becomes shippable.

## Cleanup proof

All disposable prototype changes were explicitly reversed after measurement.
`GraphCanvas2D.tsx` returned to zero diff; no worker, renderer selector, dependency, or
decimation branch remains in the product tree. Temporary measurement scripts and images
remain only under writable machine-local `C:\tmp` / gitignored `scratch` paths.
