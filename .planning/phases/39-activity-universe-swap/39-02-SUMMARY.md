# 39-02 SUMMARY — Event interaction: hover, click story, lasso (ACT-04)

**Completed:** 2026-07-21

## What shipped

- **Builder `idAnchors`** — `build-activity-universe-payload.ts` records every
  10,000th streamed id into meta (`idAnchors`, additive optional field on the
  v1 shape); `ID_ANCHOR_STRIDE` + pure `anchorFor(index)` in
  `lib/server/activityUniversePayload.ts` (+ vitest). **Artifact rebuilt live:
  4,904,886 rows, 149.7 MB, run `20260721T210323Z-80e4cff2`, 69.3 s; meta now
  carries 491 anchors (= ceil(count/10k)).**
- **`server/routers/activity-universe.ts`** (registered as `activityUniverse`):
  - `projectNames` — GUID→name map (~957 rows) for tooltip display.
  - `eventDetail({index, expectedProjectGuid})` — anchor seek + ≤10k OFFSET on
    the AccActivityEmbedding PK, then PK lookup by id space (`accds:`-prefixed
    → AccActivityAccds; plain cuid → AccActivity DC rows, honest nulls for
    object/folder at that grain) + project-name join. Drift guard: project GUID
    mismatch or missing row → `{stale, reason}` — never a confidently wrong
    event. **Live read-only probe: 1–9 ms warm across 5 indices incl. row 0 and
    the last row (a DC-space id); global-OFFSET cross-check agrees.**
- **Hover (zero-fetch)** — `activityEventLabels.ts` pure resolver (resident
  ints + dicts + projectNames → verb/module/project/month/author/role/company,
  `isUnknownAuthor`, month math across year boundaries) + vitest;
  `ActivityTooltip.tsx` in the NodeTooltip popover style.
- **Click → `ActivityDetailRail.tsx`** — event story (object, folder, project,
  exact timestamp, source labeled "web-session crawl" vs "Data Connector";
  loading + "details unavailable" states) riding as `railPrelude` inside
  `UserProfilePanel` (rail variant, `user=null` + email — panel owns chrome +
  Close); authorId 0 → explicit "Unknown author" card with the coverage share.
- **Lasso** — existing generic `LassoOverlay` reused (props already decoupled);
  hit-test via `findPointsInPolygon` (rendered subset native); honest count
  label "N of rendered ~500k selected" + Clear; selection outlined via
  `setSelectedIndices`; Escape closes rail then clears selection.
- **Coverage on the surface** — caption line "author resolution 94.41% ·
  unknown authors 5.59%" computed from meta.coverage (not hardcoded) —
  completes ACT-02's surface obligation.
- **LOD/interaction contract** — a point-set switch (sample↔region) clears
  hover + selection (rendered indices change meaning) and resets bridge
  counters; `selectedCount` exposed on the test bridge.

## Deviations

- Real id convention is `"accds:"+accdsActivityId` / plain AccActivity cuid —
  the `"a:"/"d:"` comment on the AccActivityEmbedding Prisma model is stale
  (noted for 39-VERIFICATION; comment-only, no code depends on it).
- The plan's separate `activityLasso.ts` was unnecessary — LassoOverlay's
  callback props fit as-is (no adaptation file shipped).

## Gates

- Focused vitest 15/15 (activity dir 12 + payload helper 3).
- `npx tsc --noEmit`: clean.
- `node scripts/repo-map/check.cjs`: PASS (same pre-existing warning baseline).
- Live DB probe (read-only) recorded above.
- Design: impeccable hook scanned every touched surface file, no deterministic
  findings; visual pass happens at the phase deploy probe.

## Follow-ups / debt

- Prisma model comment fix for AccActivityEmbedding id spaces (one-line docs
  tweak; batch into any future schema-touching phase).
- eventDetail cold first-call ~118 ms (PK btree warm-up) — fine for click-time.
