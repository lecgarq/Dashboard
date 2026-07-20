# Plan 34-04 Summary — E2E-01/02 graph e2e re-baseline + lasso budget

**Status:** COMPLETE — 2026-07-20
**Requirements:** E2E-01, E2E-02
**Commit:** `c1b78647` `test(e2e): re-baseline graph suite to 22,279-node v2.4+ surface; close lasso budget (E2E-01/02)`
(`tests/e2e/acc-dc-graph.spec.ts`, `tests/e2e/acc-3d-lasso.spec.ts`)

## Harness (deviation from the checked-in default config — recorded)

The default `playwright.config.ts` dev-server harness (`next dev --webpack` on
:3100) 500s on `/login` — the documented webpack-dev `pg` bundling trap
(TESTING.md). All runs used the ESTABLISHED prod-build harness
(`playwright.verify.config.ts` + out-of-band `next start` on :3100 serving an
isolated `NEXT_DIST_DIR=.next-e2e` build with `NEXT_PUBLIC_ACC_GRAPH_TEST=1` +
`NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1`), same as the 2026-07-14 dep-update
verification. Builds were powershell-wrapped isolated-dist invocations — allowed
through the GUARD-01-hardened hook (34-01's exact tested form). A leftover 9:27 AM
node process held :3100 and was killed before the first run. Live `:3000`
untouched throughout.

## E2E-01 — acc-dc-graph re-baseline

**Fresh baseline (VERIFY resolved):** the "14 fails" figure was stale — the
recorded baseline run was **16 failed / 5 skipped / 6 passed** (29.7m).

**Shipped, per category:**
- **Node pin:** `EXPECTED_NODE_COUNT = 22_279` (exact assert, comment retained —
  Decision 1).
- **Repointed to the real v2.4+ surface:**
  - slider smoke → Layout tab `group-by-select` ("user") + "Grouping strength
    thumb" (curated "User name" slider gone).
  - filter test → adds the dim via `toolbar-add-filter` before `dim-popover-role`.
  - P4 sidebar test → Layout/Dimensions tabs + `catalog-slider-sidebar` +
    `catalog-section-structural` (old `slider-group-*` testids gone).
  - P4 dimension search → Dimensions tab `dimension-search` filtering the catalog
    tree (Company visible / Users hidden; `.first()` for the multi-match).
  - P4 color-mode options → catalog id-space (`adminMember`, `riskScore`;
    retired registry ids `isAdmin`/`status` dropped).
  - access-map smoke → grouped-by **General** (defaultGroupBy), title updated.
  - P0 camera test → INVERTED contract pinned: isolate now runs a deliberate
    camera focus session (GraphInteractions focusPoint, scale 2.25); asserts the
    camera MOVES on isolate and Escape clears the isolation layer.
- **Gated to the parked 3D shell** (`test.skip(!ACC_3D_GRAPH)`, not deleted):
  footprint-edges (old L697), P0 footprint-lit (old L1070) — same-user edges
  exist only flag-ON (embedding map is edge-free by design); P0 reheat (old
  L1004) — the frozen 2D path morphs layoutTarget without restarting the sim
  (PERF-02 frozen-handle invariant), so "unfreeze on nudge" is physics-shell-only.
- **Deleted (feature no longer exists in any form — each with a NOTE comment in
  the spec):**
  1. "P4: Free preset relaxes layout…" — PresetBar unmounted (ORPHAN-01).
  2. "P6: riskScore advanced slider engages…" — riskScore is `surfaces: ["color"]`,
     not slider-surfaced; color path still covered by the P6 color-mode smoke.
  3. "P4: Access & permissions '1 active' badge" — the grouped-sidebar badge UI
     no longer exists.
  4. map-cluster-labels attachment assert (inside the access-map smoke) —
     `blobDesc` is built only when `ACC_3D_GRAPH_ENABLED`, so chips never render
     on the default flag-OFF path; component covered by MapClusterLabels.test.tsx.

**Final gate:** full suite on the isolated :3100 prod build —
**16 passed / 8 skipped / 0 failed** (13.8m). Skips = 5 pre-existing 3D-gated
+ 3 newly gated above. `npx tsc --noEmit` clean.

**Product gap found (NOT fixed here — recorded as debt):** Escape does not
restore the camera after a focus session — `restoreView` →
`setZoomTransformByPointPositions` leaves zoom at the focused level (measured
1.000 → 0.265 → 0.252 after Escape). Reversibility half of the focus-session
contract is deliberately NOT asserted; noted in the spec comment and rolled to
CONCERNS.

## E2E-02 — lasso budget

**VERIFY resolved:** on the prod harness the spec completes in ~40s — the
config-level 120s per-test budget never governs (the body carries a scoped
`test.setTimeout(360_000)` already). The remaining exposure was the INNER
`gotoGraph` readiness `waitForFunction` (120s), which a loaded dev-server cold
boot could trip (CONCERNS §3.4 mechanism). **Lever (smallest, evidence-chosen):**
raised that inner wait 120s → 240s to fit the body budget with margin; comment
documents the reasoning. No config-level changes, no fixture reduction.

**Consecutive recorded flag-on passes** (flag-ON isolated build, since
`NEXT_PUBLIC_ACC_3D_GRAPH` is build-time): 44.7s, 37.6s (pre-edit repro), 37.9s
(post-edit) — 3/3 green, all >3× under the old budget.

## Gate outcomes (exact)

- Baseline: `16 failed / 5 skipped / 6 passed (29.7m)` (recorded pre-edit).
- Final acc-dc-graph: `16 passed / 8 skipped (13.8m)`, exit 0.
- acc-3d-lasso: `1 passed (45.5s)`, `1 passed (38.3s)`, `1 passed (38.6s)`.
- `npx tsc --noEmit`: exit 0 after every spec edit.

## Durable follow-ups (roll to CONCERNS)

1. **FOCUS-RESTORE gap:** Escape doesn't restore the 2D focus-session camera
   (GraphCanvas2D `restoreView`); e2e deliberately doesn't assert it.
2. **Default e2e dev harness broken:** `playwright.config.ts` webServer
   (`next dev --webpack`) 500s on /login; every real run uses
   `playwright.verify.config.ts` + out-of-band prod server. Config cleanup or
   TESTING.md pointer worth consolidating.
3. Cluster-label chips are flag-ON-only (`blobDesc` gate) — if the owner expects
   chips on the default map, that is a product decision to revisit.
