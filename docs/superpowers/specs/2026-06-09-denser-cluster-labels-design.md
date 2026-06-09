# Denser cluster labels on the spatial map

**Date:** 2026-06-09
**Surface:** `/users/spatial-graph` projector map — `MapClusterLabels.tsx`.
**Status:** Approved (design phase). Follow-on to the three-presets work.

## Goal

Show many more cluster name-chips at once (target "way denser" — roughly 70–100 at
the default view vs ~16 today), without hover, while keeping the no-overlap declutter
and the FPS ceiling. Density is a matter of taste, so these are *starting* values to
be fine-tuned on real data after a rebuild.

## Approach

Retune the four level-of-detail constants in `MapClusterLabels.tsx` and shrink the
chips. No change to the LOD *logic* (`selectVisibleLabels` / `labelCandidateClusters`
stay as-is and remain unit-tested); only the numeric thresholds they receive change.

| Constant | Now | New (starting) | Why |
|----------|-----|----------------|-----|
| `MIN_SCREEN_RADIUS` | 11 | **4** | Main lever — far more blobs clear the on-screen-size gate at default zoom |
| `SEP_X` | 120 | **70** | Chips pack closer before one is pruned |
| `SEP_Y` | 22 | **14** | Tighter rows |
| `MAX_LABELS` | 60 | **120** | More candidates eligible + raise the DOM/FPS ceiling (still bounded) |

Chip style (denser, readable): `fontSize` 12 → **11**, padding `2px 7px` → **`1px 5px`**,
dot 8px → **6px**, gap 6 → **4**.

## What is preserved (intentionally)

- **Zoom reveal** still works (radius-based LOD unchanged — zoom shows even more).
- **No-overlap declutter** still holds (greedy collision prune, bigger cluster wins).
- **Strength fade** unchanged (labels fade in with grouping strength via `opacity`).
- **FPS ceiling**: `MAX_LABELS` still caps live DOM chips, so grouping by User name
  (~3,400 groups) renders at most 120 chips, never thousands.

## Tradeoffs (accepted)

- Busier look (the explicit ask).
- High-cardinality groupings (User name, Project) still won't show *all* labels — the
  ~120 largest plus zoom-reveal. Role (~77) effectively shows all.
- `SEP` near the chip size means dense areas can *touch*; if it reads as overlap on
  real data, nudge `SEP_X`/`SEP_Y` up. Easy post-rebuild tuning.

## Testing

- `tsc` clean. Existing label tests unaffected (they pass explicit thresholds / test
  the opacity prop, not these constants). Verify the full unit suite still green.
- Visual: rebuild `:3000`, eyeball density on Role / Project / User name, then tune
  the four knobs together.

## Out of scope (YAGNI)

- No hover/click-to-reveal labels.
- No cardinality-adaptive "label all when few" logic.
- No change to label positioning, color, or the morph-ride behavior.
