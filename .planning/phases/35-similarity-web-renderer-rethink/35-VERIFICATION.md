# Phase 35 Verification — Similarity-Web Renderer Rethink

**Date:** 2026-07-20 · **Milestone:** v2.6 Full-Rate Graph · **Plans:** 2/2 summarized
**Requirements:** REND-01, REND-03

## Per-requirement coverage

### REND-01 — off-main-thread Canvas2D raster path ✅

- Plan 35-01 measured four candidates against the same authenticated full graph:
  22,279 nodes / 18,000 links. Canvas2D held 39.79 fps and degraded Tier 0→2;
  Cosmos-native held 60.03 fps at Tier 0→0. Worker and deterministic decimation also held
  60 fps but added machinery or discarded links with no benefit.
- Plan 35-02 shipped Cosmos-native curved links only. `SimilarityWebOverlay.tsx` contains
  no `<canvas>`, `Path2D`, projection raster, or parallel renderer. No dependency changed.
- Final browser sample: **60.07 fps over 10.02 s**, 22,279 nodes / 18,000 links,
  `linkRenderer: "cosmos-native"`, Tier 0 before and after.

### REND-03 — Phase-32 visual and interaction contract preserved ✅

- Exact weak/medium/strong bands, monotone widths/alpha, and ambient→selected→hovered
  buffer order are unit-pinned. Synthesized selected matches stay complete.
- Morphing preserves the 25% floor; reduced motion snaps; selected focus works while
  ambient motion is static; grouping pauses and resumes ambient cleanly.
- Frozen Cosmos never starts or reheats simulation on native-link updates.
- Real framebuffer assertions and screenshots prove the web is painted, not merely counted.

## Gates actually run

| Gate | Outcome |
|---|---|
| Focused Vitest | 5 files / 54 passed |
| `npx tsc --noEmit` | exit 0 (including immediately before live build) |
| `node scripts/repo-map/check.cjs` | pass; 3 dependency + 248 AST baseline warnings |
| `impeccable detect` | `[]` |
| Isolated Next production build | pass; 29/29 static pages |
| Phase-32 browser spec | 4/4 passed; 60.07 fps / 10.02 s / Tier 0 |
| `acc-dc-graph.spec.ts` | 16 passed / 8 skipped / 0 failed |
| Scoped diff check | clean |

## Visual/browser evidence

- Both `/users/spatial-graph` and `/users/access-analysis` canonicalize to the same surface
  and pass the populated-framebuffer gate.
- Screenshot review found and blocked a blank-render false positive before ship. The final
  isolated screenshot shows the full native web; no console or WebGL context errors.
- Live authenticated probe after deploy: `/users/spatial-graph` → 200, WebGL
  976×929, 157,644 colored pixels.

## Deploy (autoDeploy policy)

- `LECG Dashboard Local` stopped; port 3000 freed before build.
- `npx tsc --noEmit` → exit 0; `npm run build` → exit 0.
- Scheduled task restarted → `Running`; port 3000 → `Listen`.
- Probe at 2026-07-20T14:25:27-06:00: `/api/health` → 200 with
  `database: connected`; unauthenticated graph route → expected 307 login redirect;
  authenticated graph route → 200 with populated framebuffer.
- **BUILD_ID:** `lzC97Z2E6chNTArdzDZd0`.

## Scope and debt

- No decimation shipped: settled close, selected, and hovered links are complete by
  construction. The measured hard-gate rerun remains Phase 36's closeout responsibility.
- No new debt or `VERIFY:` blocker introduced. The three-tier controller remains as the
  safety net and was observed idle in the Phase-35 sample.

**Phase result: PASS — 5/5 success criteria met and deployed.**
