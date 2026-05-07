---
phase: quick-1
plan: 1
subsystem: graph-labels
tags: [ui-polish, cosmos, labels, canvas2d-overlay]
requires: []
provides: ["Polished label envelope, pill backgrounds, padded AABBs in CosmosGraphRenderer.drawLabelOverlay"]
affects: ["app/(dashboard)/users/graphRenderers.ts"]
tech-stack:
  added: []
  patterns: ["inline drawPill helper closure", "pow(zoom, 0.2) gentle exponent", "AABB = textWidth + padX*2 / fontPx + padY*2"]
key-files:
  created: []
  modified:
    - "app/(dashboard)/users/graphRenderers.ts"
decisions:
  - "Used pow(cosmosZoom, 0.2) clamped [0.85, 1.4] per design spec size table (line 45) — anchors 13px at z=1, ceiling ~18px at z>=6, floor ~11px at z<=0.3"
  - "Cloud pill: rgba(255,255,255,0.92) fill, #0f172a text, weight 600, padX=4 padY=2 radius=4"
  - "Override pill: rgba(15,23,42,0.95) fill, #ffffff text, weight 700, padX=5 padY=3 radius=5"
  - "drawPill kept inline (not module-scoped) so it captures per-frame ctx state"
  - "Stroke halo + lineJoin/miterLimit fully removed — pill background subsumes contrast role"
metrics:
  duration: "~6m"
  tasks: 1
  files_changed: 1
  completed: "2026-05-07"
---

# Phase quick-1 Plan 1: Label Readability Polish Summary

UI polish for Cosmos label overlay: caps deep-zoom labels at ~18px, lifts floor to ~11px,
swaps stroke-halo for soft pill backgrounds (white-cloud / dark-override), and updates
collision AABBs to honor pill padding. All inside `CosmosGraphRenderer.drawLabelOverlay`.

## Implementation

Single-function edit in `app/(dashboard)/users/graphRenderers.ts`. All six design-spec
changes applied:

**1. Size envelope (zoomScale)**

```ts
const zoomScale = Math.max(
  0.85,
  Math.min(1.4, Math.pow(cosmosZoom, 0.2)),
);
```

Replaces the previous `pow(cosmosZoom, 0.7)` clamped `[0.55, 4.5]`.
- Floor 0.85 × 13px = ~11px at zoom-out (legible)
- Ceiling 1.4 × 13px = ~18px at deep zoom-in (UI-scale cap)

**2. drawPill helper** — added inline before the override pass, captures `ctx`. Draws
soft shadow (`rgba(0,0,0,0.08)`, 2px blur, 1px Y-offset), rounded-rect pill fill, then
text. Resets shadow state after the fill so subsequent draws don't inherit it.

**3. Legibility floor** — `if (fontPx < 10) continue;` added to both passes
(safety net under the new clamped curve where minimum is already 11px).

**4. Override pass** — weight 700, padX=5, padY=3, radius=5, fill
`rgba(15, 23, 42, 0.95)`, text `#ffffff`. AABB built from `textWidth + padX*2`
and `overrideFontPx + padY*2`.

**5. Normal (cloud) pass** — weight 600, padX=4, padY=2, radius=4, fill
`rgba(255, 255, 255, 0.92)`, text `#0f172a`. AABB built same shape; collision
check via `aabbsOverlap` retained.

**6. Removed** — `ctx.lineJoin`, `ctx.miterLimit`, `ctx.strokeStyle`, `ctx.lineWidth`,
both `ctx.strokeText` calls, and the `overrideAabbY/H`, `normalAabbY/H` constants
(replaced by pill-padded calc).

`ctx.textAlign = "center"`, `ctx.textBaseline = "alphabetic"`, the per-frame
`ctx.globalAlpha` plumbing (1 for override, `opacity` for cloud), and the
`MAX_LABELS=200`, `aabbsOverlap` collision check, `isIsolated` cloud-suppression,
and override-channel routing are all preserved.

## Line-count delta

`drawLabelOverlay`: +97 / −46 inside the function (per `git show --stat`).
Net +51 lines, mostly the inline `drawPill` helper (~30 lines) plus structured
AABB calculations split across two `padX/padY` blocks.

## Final values reference

| Aspect       | Cloud (normal pass) | Override pass         |
| ------------ | ------------------- | --------------------- |
| Font weight  | 600                 | 700                   |
| Base font    | 12 × zoomScale      | 13 × zoomScale        |
| Pill fill    | rgba(255,255,255,0.92) | rgba(15,23,42,0.95) |
| Text color   | #0f172a             | #ffffff               |
| Pad X / Y    | 4 / 2               | 5 / 3                 |
| Border radius| 4                   | 5                     |
| Shadow       | rgba(0,0,0,0.08), 2px blur, 1px offset (same both) | (same) |

`zoomScale = clamp(pow(cosmosZoom, 0.2), 0.85, 1.4)`

## Verification

- `npx tsc --noEmit` — clean (no output)
- `npm run lint` — clean for the modified file. ESLint reports 27 pre-existing
  parse errors in `.local/postgresql18/pgsql/pgAdmin 4/...` vendored JS files
  (gitignored, not source). The repo's `eslint.config.mjs` is `export default []`
  (empty config), so the modified TS file produces only an "ignored, no matching
  configuration" notice — zero applicable rule violations. Pre-existing condition,
  out of scope per execution constraints.

## Deviations from Plan

None — design spec implemented exactly as written. The size table (spec line 45)
was used as the source of truth for the curve, and matches the plan's
`pow(cosmosZoom, 0.2)` clamped `[0.85, 1.4]` formula.

## Commits

- `55e2378` — feat(quick-1): implement label readability polish per 03-06 spec

## Self-Check: PASSED

- File `app/(dashboard)/users/graphRenderers.ts` modified — FOUND
- Commit `55e2378` — FOUND in git log
- `pow(cosmosZoom, 0.2)` literal present — FOUND
- `drawPill(` helper invocation — FOUND in both passes
- `padX * 2` AABB pattern — FOUND
- No `strokeText` calls remain in `drawLabelOverlay` — VERIFIED via grep
