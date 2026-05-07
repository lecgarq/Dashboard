---
phase: quick-1
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - app/(dashboard)/users/graphRenderers.ts
autonomous: true
requirements:
  - LABEL-POLISH-01  # 18px ceiling / 11px floor / gentle curve
  - LABEL-POLISH-02  # pill background (cloud + override variants), drop halo
  - LABEL-POLISH-03  # 10px legibility floor (skip-draw safety net)
  - LABEL-POLISH-04  # AABB collision includes pill padding
must_haves:
  truths:
    - "At Cosmos zoom <=0.3, labels render at floor ~11px (never <11px) when in fade band"
    - "At Cosmos zoom >=6, labels cap at ~18px (never grow beyond ceiling)"
    - "Cloud labels render with near-opaque white pill + slate-900 text, no stroke halo"
    - "Override (hover/selected) labels render with dark slate pill + white text, no stroke halo"
    - "Pills do not visually overlap in dense clusters (AABB includes pill padding)"
    - "`npm run lint` passes"
    - "`npx tsc --noEmit` passes"
  artifacts:
    - path: "app/(dashboard)/users/graphRenderers.ts"
      provides: "Updated CosmosGraphRenderer.drawLabelOverlay implementing 03-06 spec"
      contains: "drawPill"
  key_links:
    - from: "drawLabelOverlay zoomScale calc"
      to: "Math.pow(cosmosZoom, 0.2) clamped [0.85, 1.4]"
      via: "Math.max/Math.min"
      pattern: "Math\\.pow\\(cosmosZoom, 0\\.2\\)"
    - from: "override + normal label render passes"
      to: "drawPill helper"
      via: "direct call replacing strokeText+fillText pair"
      pattern: "drawPill\\("
    - from: "AABB construction (both passes)"
      to: "pill padding (padX, padY)"
      via: "aabbW = textWidth + padX*2; aabbH = fontPx + padY*2"
      pattern: "padX \\* 2"
---

<objective>
Implement the 03-06 label readability polish design spec inside `CosmosGraphRenderer.drawLabelOverlay`. Single-function edit. UI polish only — no API changes, no callers affected.

Purpose: Cap deep-zoom labels at dashboard UI scale (~18px) and lift the deep-zoom-out floor (~11px) so labels are always legible without dominating the viewport. Replace stroke-halo treatment with soft pill backgrounds (white-cloud / dark-override) for cleaner contrast on busy graphs.

Output: Updated `drawLabelOverlay` with new size envelope, drawPill helper, pill-padded AABBs, legibility floor, and stroke-halo code removed.
</objective>

<execution_context>
@C:/Users/luis.cortes/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/luis.cortes/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/03-graph-ui-completion/03-06-label-polish-design.md
@app/(dashboard)/users/graphRenderers.ts

<interfaces>
<!-- Function signature being modified — do NOT change. -->
drawLabelOverlay(ctx: CanvasRenderingContext2D, frame: GraphRenderFrame, dpr: number): void

<!-- Frame fields used (already wired by 03-04, do not touch): -->
frame.cssWidth, frame.cssHeight
frame.cosmosLabelFadeStartZoom, frame.cosmosLabelFadeEndZoom
frame.labelFadeStartScale, frame.labelFadeEndScale  (Canvas2D fallback band)
frame.labelOverrideIndices: Set<number> | undefined
frame.selectedNodeIndex: number
frame.nodes[i].label: string | undefined
frame.nodes[i].degree: number | undefined
frame.positions: Float32Array (seed only in GPU-physics mode)

<!-- Cosmos public API (verified at @cosmos.gl/graph dist/index.d.ts:343): -->
this.graph.getZoomLevel(): number
this.spaceToScreen(wx, wy): [number, number] | null
this.getPointPositionsArray(): Float32Array | null

<!-- ctx.roundRect: supported Firefox 113+, Chrome 99+, Safari 16+ — within dashboard's browser floor. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement size envelope, drawPill helper, pill-based rendering, and AABB padding</name>
  <files>app/(dashboard)/users/graphRenderers.ts</files>
  <action>
Edit `CosmosGraphRenderer.drawLabelOverlay` (currently lines 890-1084). Six changes, all inside the method:

**1. Replace zoomScale calculation (currently lines 953-956).**

Old:
```ts
const zoomScale = Math.max(
  0.55,
  Math.min(4.5, Math.pow(cosmosZoom, 0.7)),
);
```

New (matches the size table in design spec lines 45-52 — `pow(zoom, 0.2)` clamped to `[0.85, 1.4]`; the spec's "Implementation Plan" line that mentions `pow(0.55)` is a typo, the size table is the source of truth):
```ts
// 03-06 polish: gentle exponent (0.2) keeps mid-range growth subtle;
// clamp ceiling 1.4 enforces the ~18px hard cap on a 13px base font;
// floor 0.85 keeps deep-zoom-out at ~11px (legible) instead of ~7px.
const zoomScale = Math.max(
  0.85,
  Math.min(1.4, Math.pow(cosmosZoom, 0.2)),
);
```
Update the JSDoc comment block above (lines 946-952) to reflect the new envelope: anchor 13px at zoom=1, ceiling 18px at zoom>=6, floor 11px at zoom<=0.3. Keep the rest of the comment style consistent.

**2. Add `drawPill` inline helper.**

Insert immediately after the `aabbsOverlap` helper (currently lines 1012-1021), before the override pass. Use the spec exactly:
```ts
const drawPill = (
  cx: number,
  cy: number,
  text: string,
  fontPx: number,
  fillColor: string,
  textColor: string,
  padX: number,
  padY: number,
  radius: number,
) => {
  const w = ctx.measureText(text).width + padX * 2;
  const h = fontPx + padY * 2;
  const x = cx - w / 2;
  const y = cy - h;
  ctx.shadowColor = "rgba(0,0,0,0.08)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = textColor;
  ctx.fillText(text, cx, cy - padY);
};
```
Closure captures `ctx`. Do NOT extract to module scope — keep inline so it inherits the per-frame ctx state.

**3. Add legibility floor (10px skip).**

Inside both candidate loops (override pass and normal pass), immediately before AABB construction, add:
```ts
if (fontPx < 10) continue;
```
Where `fontPx` is `overrideFontPx` in the override pass and `normalFontPx` in the normal pass. Under the new clamped curve this is a safety net (min effective is 11px) but is required by the spec.

**4. Replace override pass body (currently lines 1023-1048).**

- Keep `overrideCandidates` iteration, MAX_LABELS gate, `drawnAabbs.push`, `drawnCount++`.
- Override base font remains 13px → `const overrideFontPx = Math.round(13 * zoomScale);`
- Keep `overrideOffsetY = Math.round(10 * zoomScale);`
- Pill padX=5, padY=3, radius=5 (override variant per spec section 2).
- AABB now uses pill padding:
  ```ts
  const padX = 5; const padY = 3;
  const textWidth = ctx.measureText(c.label).width;
  const aabbW = textWidth + padX * 2;
  const aabbH = overrideFontPx + padY * 2;
  const aabb: [number, number, number, number] = [
    c.sx - aabbW / 2,
    c.sy - overrideOffsetY - aabbH + padY,
    aabbW,
    aabbH,
  ];
  ```
- Replace `ctx.strokeText` + `ctx.fillText` with:
  ```ts
  drawPill(
    c.sx, c.sy - overrideOffsetY,
    c.label, overrideFontPx,
    "rgba(15, 23, 42, 0.95)", "#ffffff",
    padX, padY, 5,
  );
  ```
- Set font BEFORE the loop: `ctx.font = \`700 ${overrideFontPx}px ui-sans-serif, system-ui, sans-serif\`;` (weight 700 per spec).
- DELETE: `ctx.strokeStyle`, `ctx.lineWidth`, and the now-removed `overrideAabbY`/`overrideAabbH` constants (they're replaced by pill-padded calc).

**5. Replace normal pass body (currently lines 1050-1082).**

- Keep `opacity > 0 && drawnCount < MAX_LABELS` gate, `normalCandidates` iteration, MAX_LABELS gate, AABB-collision check via `aabbsOverlap`, `drawnAabbs.push`, `drawnCount++`.
- Normal base font remains 12px → `const normalFontPx = Math.round(12 * zoomScale);`
- Keep `normalOffsetY = Math.round(9 * zoomScale);`
- Pill padX=4, padY=2, radius=4 (cloud variant per spec section 2).
- AABB construction same shape as override (with normal padX/padY and normalFontPx).
- Replace `ctx.strokeText` + `ctx.fillText` with:
  ```ts
  drawPill(
    c.sx, c.sy - normalOffsetY,
    c.label, normalFontPx,
    "rgba(255, 255, 255, 0.92)", "#0f172a",
    padX, padY, 4,
  );
  ```
- Set font BEFORE the loop: `ctx.font = \`600 ${normalFontPx}px ui-sans-serif, system-ui, sans-serif\`;` (weight 600 per spec).
- `ctx.globalAlpha = opacity;` BEFORE the loop (preserves fade-band behavior — pill fills inherit the alpha).
- DELETE: `ctx.strokeStyle`, `ctx.lineWidth`, and the now-removed `normalAabbY`/`normalAabbH` constants.

**6. Drop the `lineJoin`/`miterLimit` setup (currently lines 943-944).**

These existed only for `strokeText` halos. Safe to remove. Keep `textAlign = "center"` and `textBaseline = "alphabetic"` — `drawPill` relies on those.

**Final cleanup:**
- Ensure `ctx.globalAlpha = 1;` at the end of the function (already present at line 1083, keep it).
- No new imports needed. No type changes. No JSX/caller changes.

**Avoid:**
- Do NOT extract `drawPill` to module scope (it captures `ctx`).
- Do NOT change `frame.*` field access — those are wired by 03-04.
- Do NOT touch the Canvas2D fallback `CanvasGraphRenderer` — out of scope per spec section "Non-Goals".
- Do NOT change `opacity` calc, `isIsolated` logic, override-vs-normal split, MAX_LABELS=200, fade-band gate, or hover/select override channel.
- Do NOT remove `ctx.shadow*` resets inside `drawPill` — required so subsequent labels in the same frame don't inherit shadow state.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>
    `drawLabelOverlay` uses `pow(cosmosZoom, 0.2)` clamped `[0.85, 1.4]`; `drawPill` helper exists and is called in both passes; both passes have `fontPx < 10` skip-continue; AABBs are computed from textWidth+padX*2 and fontPx+padY*2; no `strokeText` calls remain in the function; `lineJoin`/`miterLimit` lines removed; `npx tsc --noEmit` and `npm run lint` both pass clean.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` clean
- `npm run lint` clean
- Manual UAT (post-deploy, owned by orchestrator + user, NOT this executor):
  - Zoom out to overview → labels readable at ~11px floor, never tiny
  - Zoom in to single cluster → labels grow gently, cap at ~18px
  - Hover a node → dark pill with white text appears (override variant)
  - Select a node → selected label persists with override pill, cloud labels suppressed (existing isIsolated behavior preserved)
  - Pan dense cluster → no overlapping pills (AABB collision honors pill padding)
</verification>

<success_criteria>
- Single-file diff scoped to `CosmosGraphRenderer.drawLabelOverlay`.
- All six design-spec changes (size envelope, drawPill, legibility floor, override pill, cloud pill, padded AABB) present and observable in the diff.
- All `strokeText` calls and stroke-halo style setup removed from this function.
- Type-check and lint clean.
- No changes to callers, frame schema, Canvas2D path, or override-channel wiring.
</success_criteria>

<output>
After completion, create `.planning/quick/1-implement-label-readability-polish-per-0/1-SUMMARY.md` capturing: final zoomScale formula used, font-weight values used, pill padding values used, line-count delta in `drawLabelOverlay`, and any deviations from the design spec (expected: none).
</output>
