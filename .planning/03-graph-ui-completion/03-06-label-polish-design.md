# 03-06 — Cosmos Label Readability Polish (Design Spec)

**Date:** 2026-05-07
**Author:** Luis (with Claude orchestration)
**Status:** Design approved — pending implementation
**Files touched:** `app/(dashboard)/users/graphRenderers.ts` (single function)
**Scope:** UI polish only. No new features, no API changes, no callers affected.

## Problem

After 03-04 shipped the Cosmos label overlay and zoom-scaling tweaks (commits f7cdb1c, e1c25f6, 3c5e48e) landed, labels appear correctly across the zoom range — but the size envelope is wrong:

- **Deep zoom-in (z≈5):** labels balloon to ~54px and dominate the viewport.
- **Deep zoom-out (overview):** labels shrink to ~7px and become illegible.
- **Mid zoom:** labels feel anchored to nodes (correct) but the full size band is too wide overall.

Confirmed by user UAT: pain is sharpest at the **top end** (humongous deep-zoom labels). The overview floor is less critical but should still be bounded above unreadable size.

## Goals

1. Cap label size at dashboard UI text scale (~18px) so labels never dominate the viewport.
2. Keep labels visually anchored to their nodes — small movement when zoom changes, never static.
3. Always-readable contrast on busy/dense graph areas (clusters of overlapping nodes).
4. No labels drawn below the legible threshold (~10px) — fade out, don't smudge.

## Non-Goals

- No new label types, no new data on the frame, no new user controls.
- No change to the Canvas2D fallback renderer (its label code path is separate).
- No change to label selection logic (degree priority, 200-cap, AABB collision).
- No change to override (hover/selected) bypass behavior.

## Design

### 1. Size envelope

| Anchor | Current | New |
|---|---|---|
| Floor (deep zoom-out) | ~7px | **11px** |
| Anchor zoom=1 (fit view) | 12-13px | **13px** unchanged |
| Ceiling (deep zoom-in) | ~54px | **18px** |

**Curve:** Replace `pow(zoom, 0.7)` clamped to `[0.55, 4.5]` with `pow(zoom, 0.2)` clamped to `[0.85, 1.4]`. The much flatter exponent (0.2 vs 0.7) keeps growth gentle across the practical zoom range; the clamp ceiling enforces the hard 18px cap. Resulting effective sizes (override base 13px):

| Cosmos zoom | Old override (13×scale) | New override (13×scale) |
|---|---|---|
| 0.3 (zoomed out) | 7px | 11px (floor) |
| 1.0 (fit view) | 13px | 13px |
| 2.0 | 21px | 15px |
| 3.5 | 31px | 17px |
| 6.0 | 49px | 18px (ceiling) |
| 10.0 | 58px (cap) | 18px (ceiling) |

Smooth, gentle growth — eye gets a "labels track nodes" cue from z=1 to z=5, then they cap at dashboard-UI scale and stop. No more humongous deep-zoom labels.

### 2. Pill background

Replace the current "halo only" treatment (white stroke around dark text) with a soft pill background.

**Cloud labels (zoom-band):**
- Fill: `rgba(255, 255, 255, 0.92)` — near-opaque white
- Border-radius: 4px
- Padding: 4px horizontal, 2px vertical
- Shadow: 1px Y-offset, 2px blur, `rgba(0,0,0,0.08)` — barely visible, just enough to lift the pill off light cluster fills
- Text: `#0f172a` (slate-900), weight 600 — current values, kept

**Override labels (hover/selected):**
- Fill: `rgba(15, 23, 42, 0.95)` — dark slate, near-opaque
- Border-radius: 5px
- Padding: 5px horizontal, 3px vertical
- Shadow: same as cloud
- Text: `#ffffff`, weight 700 — visually distinct from cloud labels at a glance

**Drop the `strokeText` halo entirely.** The pill makes it redundant; double-chrome (halo + pill) looks cluttered.

### 3. Legibility floor

If `effectiveFontPx < 10`, skip the label entirely (continue the candidate loop). Currently labels at 7px are technically rendered but illegible — wasted draw + visual noise. Combined with the existing `opacity` fade band, labels will:

1. Above zoom band: fully drawn at min font 11px (legible)
2. Inside fade band: drawn at min font 11px with ramping opacity
3. Below fade band: not drawn at all (existing behavior)

So the legibility floor is effectively unreachable under the new curve (min 11px > floor 10px) — this rule is a safety net for any future curve changes. Cheap to add, expensive to forget.

### 4. AABB collision update

AABB calculation must include pill padding, not just glyph metrics:

```ts
const padX = 4; const padY = 2;  // cloud
const textWidth = ctx.measureText(c.label).width;
const aabbW = textWidth + padX * 2;
const aabbH = fontPx + padY * 2;
const aabb = [c.sx - aabbW / 2, c.sy - overrideOffsetY - aabbH + padY, aabbW, aabbH];
```

Without this update, pills would visually overlap even though glyph centers don't — the existing collision check would silently allow it.

### 5. Pill draw helper

A small inline helper inside `drawLabelOverlay` for clarity:

```ts
const drawPill = (
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  text: string, fontPx: number,
  fillColor: string, textColor: string,
  padX: number, padY: number, radius: number,
) => {
  const w = ctx.measureText(text).width + padX * 2;
  const h = fontPx + padY * 2;
  const x = cx - w / 2;
  const y = cy - h;
  // Shadow
  ctx.shadowColor = "rgba(0,0,0,0.08)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  // Pill
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  // Text
  ctx.fillStyle = textColor;
  ctx.fillText(text, cx, cy - padY);
};
```

`ctx.roundRect` is supported in all modern browsers (Firefox 113+, Chrome 99+, Safari 16+) — covers the dashboard's browser support floor.

## Implementation Plan

Single-file edit. Roughly the structure of changes inside `drawLabelOverlay`:

1. **Replace zoomScale calc** — new `pow(zoom, 0.2)` + `[0.85, 1.4]` clamp (matches table at line 45).
2. **Add legibility floor** — early `continue` in candidate loop when `fontPx < 10`.
3. **Add drawPill helper** — module-private or inline in the method.
4. **Replace stroke+fill text rendering** with `drawPill` calls in both override and normal passes.
5. **Update AABB calc** to include pill padding.
6. **Drop `strokeText` calls and stroke style setup** — no longer needed.

## Verification

- `npm run lint` clean
- `npx tsc --noEmit` clean
- Manual UAT on Railway production after deploy:
  - Open `/users` — wait for sim to settle
  - Zoom out to overview → labels readable, around 11px, never tiny
  - Zoom in to single cluster → labels grow gracefully, max ~18px, never humongous
  - Hover a node → override pill appears (dark, white text), distinct from cloud
  - Select a node → selected label persists with override pill
  - Pan around dense cluster → no overlapping pills (collision works with new AABB)

## Risk

- **Low.** Single function, no API changes, no callers affected. Rollback = revert the commit.
- **Browser compat:** `roundRect` is the only API that could be missing. Already supported in dashboard's browser support floor (Firefox 113+, Chrome 99+, Safari 16+) — verified at MDN.
- **Performance:** adding `roundRect`+shadow per label is a few extra ops at 200 max labels per frame ≪ 1ms on any device that runs Cosmos GPU physics.

## Out of Scope (Future)

- Adapting pill colors to dark mode (current dashboard is light only)
- Per-cluster label color coding
- Truncation/ellipsis for long names
- Multi-line labels (e.g., name + role)

These are deliberately not addressed — keep this change focused.
