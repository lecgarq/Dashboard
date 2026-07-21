# 40-01 Summary — Activity dimension model, organic group layout, color-by

**Status:** COMPLETE · commit `6b7be17a` · 2026-07-21

## Changed files

- `app/(dashboard)/users/access-analysis/activity/activityDimensions.ts` (new) —
  8 descriptors (verb/module/objectType/month/role/company/project/author) from
  meta dicts; `author.groupBy === false` (owner decision 4); month labels
  generated via monthLabel(monthFloor, i), monthCount verified 20 in live meta;
  project labels map GUIDs through the projectNames map with GUID fallback;
  honest coverage = nonzero-id count for sentinel dims (dict slot 0 =
  "Unknown"/"(none)"/"Unknown author" — verified against the live meta), full
  corpus for month and module ("(none)" is a displayed legend category, not
  hidden).
- `activityGroupLayout.ts` (new) — `categoryCentroids` (size-aware golden-angle
  spiral: radial coordinate tracks cumulative membership, seeded hash jitter in
  angle+radius, overflow REFLECTED not clamped — see deviation), `buildGroupLayout`
  (per-node targets = centroid + RMS-normalized rest offset → texture preserved,
  never a point-pile; outputs MapClusterLabels-shaped centers/restCenters/radii/
  counts), `mixPositions` (reusable-buffer strength blend).
- `activityColorBy.ts` (new) — module delegates byte-identical to the
  established moduleColors 7-color language; other dims top-N (12)
  CATEGORICAL_PALETTE hues + OTHER_GREY remainder; sentinel slot never earns a
  hue; legend honest with explicit "(+K more)" grey row; per-category RGB
  exported for label chips.
- Co-located tests: `activityDimensions.test.ts`, `activityGroupLayout.test.ts`,
  `activityColorBy.test.ts`.

## Deviations

- **Rim-clamp → reflection** (found by the K=957 distinctness test): hard
  `min(1, frac+jitter)` piled overflowing tail categories at exactly r=350
  where near-Fibonacci rank pairs landed sub-0.001 apart (945/957 distinct at
  3 decimals). Jitter overflow is now reflected (`f>1 → 2-f`), keeping every
  jittered radius distinct; test asserts exact distinctness at K=957.
- Coverage semantics: module marked `hasSentinel: false` — its "(none)" bucket
  is a real displayed category (zinc-500 in the established legend), so hiding
  it from coverage would be less honest, not more.

## Gates

- Focused vitest: 3 files, 13/13 pass (353ms).
- `npx tsc --noEmit`: clean (whole tree).

## Follow-ups / debt

- None new. Month color-by at cardinality 20 gets top-12 + grey per the default
  policy; if the owner wants a sequential temporal ramp instead, that's a
  Phase-41 scrubber-adjacent taste call.
