# Plan 35-02 Summary — Cosmos-native similarity web shipped

**Status:** COMPLETE — 2026-07-20
**Requirements:** REND-01, REND-03
**Commit:** `02b729f6` `feat(35): move similarity web to Cosmos GPU`

## Outcome

Replaced the Canvas2D raster overlay with the installed Cosmos renderer's native curved
GPU links. The existing `SimilarityWebOverlay` composition seam remains, but it is now an
imperative controller with no canvas of its own. It composes one ordered buffer:
ambient links, then complete selected links, then complete hovered links.

No worker, decimation path, package, data source, schema change, or second live renderer
shipped. This follows Plan 35-01's measured winner and the owner decision that selected,
hovered, and settled close views must never be decimated.

## Implementation

- `similarityWeb.ts`: renderer-neutral native link/color/width buffer composition with
  exact band semantics and focus priority.
- `SimilarityWebOverlay.tsx`: removed the Canvas2D/Path2D projection and raster loop;
  preserves the morph opacity floor and reduced-motion snap while driving Cosmos.
- `GraphCanvas2D.tsx`: enabled native curved links, added one atomic links/colors/widths
  update, and kept the frozen renderer free of simulation start/reheat calls.
- `GraphCanvas2D.tsx`: fixed a browser-visible Luma initialization defect found during
  screenshot review. The backing framebuffer is materialized at its real CSS size and an
  immediate frame makes initial data and later native-link buffer swaps visible.
- `GraphInteractions.tsx`: same-user empty colors no longer overwrite the native
  similarity colors.
- Browser bridge/specs name `cosmos-native` and now inspect real framebuffer pixels, so a
  populated counter cannot mask a blank WebGL pass.

## Exact gates

- Focused Vitest: **5 files / 54 tests passed**.
- `npx tsc --noEmit`: exit 0.
- Repo-map: passed; 3 dependency warnings and 248 AST findings remained at baseline.
- `impeccable detect` on the changed graph files: `[]`.
- Isolated production build: compiled, type-checked, and generated 29/29 static pages.
- Phase-32 browser gate: **4/4 passed**; 22,279 nodes / 18,000 native links; Tier 0;
  **60.07 fps over 10.02 s**; reduced motion, click focus, morph pause/resume green.
- Framebuffer regression gate: both route aliases rendered a correctly sized opaque WebGL
  buffer with >50,000 colored pixels (native web visibly present).
- Re-baselined graph suite: **16 passed / 8 skipped / 0 failed**.

## Deviation resolved during verification

Automated counters initially passed while the screenshot was blank. Investigation proved
the renderer was attached to the default 300×150 lazy Luma framebuffer and later link
updates were not repainted into the resized target. Focused failing tests were added before
the two narrow fixes. Final isolated and live screenshots show the complete graph and web.
