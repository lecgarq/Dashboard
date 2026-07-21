# Phase 41: Time Scrubber, Hard Gate & Closeout - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Three requirements: **TIME-01, REND-04, E2E-03**. This is the measure-last closeout
for `/users/spatial-graph` and its `/users/access-analysis` alias after the activity
universe and dimension/motion surface shipped in Phases 39–40.

1. **Temporal scrubber (TIME-01)** — add one compact bottom-canvas timeline over the
   existing `ActivityUniverseShell`. It has an explicit **All** state plus the payload's
   20 exact-month steps (current artifact: Dec 2024–Jul 2026). Selecting a month is a
   true snapshot: only that month's events are visible and selectable; the full binary
   corpus remains resident. The timeline shows the selected month and active/total event
   count, with native range semantics, keyboard stepping, and Play/Pause.
2. **Playback contract (TIME-01)** — the route still opens on **All**, preserving the
   current full-universe first impression. Play from All starts at the oldest month,
   advances one month per second, and stops at the newest month (no loop). Manual input
   pauses playback. `prefers-reduced-motion` removes autoplay entirely: the same control
   remains usable as static month steps.
3. **Composition with Phase 40 (TIME-01)** — month changes preserve `groupBy`, `colorBy`,
   and grouping strength. Visible-node counts and the color legend recalculate from the
   active month, so the displayed numbers describe what is on screen. Hover, detail, and
   lasso state clear on a month change because their rendered-index meaning is stale.
   Region LOD, morph, ambient motion, and temporal filtering must share one current
   rendered-index map; no hidden month may remain hoverable/selectable.
4. **E2E re-baseline (E2E-03)** — replace the retired instance-universe assumptions in
   `acc-dc-graph.spec.ts` and the lasso coverage with a compact activity-native gate using
   `window.__ACTIVITY_UNIVERSE_TEST__`. Pin the current contract: both route aliases,
   resident/rendered counts, finite populated canvas, group/color/strength + morph,
   exact-month/All/playback behavior, truthful period counts, activity lasso, and
   reduced-motion static behavior. Delete or rewrite instance-only assertions (3D,
   similarity web, user-footprint edges, retired search/preset/right-rail selectors)
   rather than recreating retired features. Add the requirement's deterministic,
   CI-sized activity fixture behind `NEXT_PUBLIC_ACC_GRAPH_TEST=1`; the full-scale payload
   remains the workshop-machine measurement path.
5. **Hard gates and closeout (REND-04)** — after all behavior is present, measure the
   shipped L2 universe on the workshop machine for at least 10 seconds in a headed
   Chromium session. Record the D3D11 renderer string, Tier 0 staying idle (no
   demotion), ambient active, elapsed time, frame count, and sustained fps; **<50 fps
   blocks closeout**. Re-run the median-of-5 time-to-graph path on the isolated `:3100`
   production harness and keep the Phase-38 payload fetch+decode gate ≤2,500 ms. Record
   full navigation-to-`ready` separately so unlike measures are never conflated.
6. **Milestone-close cleanup** — importer-audit the instance-era orphans named in
   `CONCERNS.md` §3.11, deleting only clean zero-importer files and preserving the three
   WIP-carrying catalog files. Remove the now-unused `AccInstanceEmbedding` Prisma model,
   table, raw migration lineage, and remaining test/docs references at the narrowest safe
   boundary; apply the drop only after `rg` + repo-map prove no runtime consumer remains.
   Fix the stale `AccActivityEmbedding.id` schema comment in the same schema touch.

**NOT this phase:** activity payload/embedding recomputation or new columns (Phase 38);
activity-universe grain/hover/detail redesign (Phase 39); new dimensions, a different
morph design, or speculative motion work (Phase 40). The 23-panel
`app/(dashboard)/access-analysis/` charts page, `/template-mty`, person graph, issue
dimensions, and deferred data-truth items remain untouched. If the hard gate fails,
Phase 41 may take the narrowest measured renderer fix required to pass (first inspect the
full-buffer ambient upload called out in CONCERNS §3.12); it may not lower the ≥50 fps bar.

**Traps:**
- `app/(dashboard)/access-analysis/` is the charts page; this phase belongs under
  `app/(dashboard)/users/access-analysis/activity/`. Both graph URLs share one shell.
- Temporal selection cannot be implemented as a cosmetic caption or 0.15-opacity greyout:
  hidden-month events must not render, hit-test, lasso, hover, or contribute to period
  legend counts.
- Month filtering changes rendered-index identity. Reuse one full-index mapping for
  point buffers, interactions, labels, motion, and tests; parallel maps will drift.
- `activityMotion` is per-rendered-set. A time-set swap must stop/dispose the current
  ambient layer before changing count and restart it against the new base; never hand a
  different-length buffer to `setBase`.
- Headless/SwiftShader fps is invalid evidence. The binding run is headed + D3D11 with a
  renderer guard, on the workshop machine, after the final production build.
- `AccInstanceEmbedding` removal is separate from `AccActivityEmbedding`, which is the
  live activity-universe authority and must remain.

</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` Phase 41 and `.planning/REQUIREMENTS.md` TIME-01/REND-04/E2E-03
  — exact success criteria: month filtering + animation, activity-native e2e fixture,
  ≥10 s headed Tier-0 sample at ≥50 fps, time-to-graph re-measure, deploy and close.
- `.planning/phases/37-scale-feasibility-spike/37-BASELINE.md` — owner-approved L2 rung,
  D3D11/SwiftShader measurement trap, ~500k rendered ceiling, and LIFE-03-style fps
  methodology.
- `.planning/phases/38-activity-data-pipeline/38-VERIFICATION.md` +
  `tests/e2e/activity-payload.spec.ts` — 149.7 MB full payload and existing median-of-5
  fetch+decode gate (≤2,500 ms).
- `.planning/phases/39-activity-universe-swap/39-VERIFICATION.md` — 4,904,886 resident,
  stride-10 sample 490,489 rendered, interaction surface, and the intentionally deferred
  e2e re-baseline.
- `.planning/phases/40-dimensions-sliders-at-scale/40-VERIFICATION.md` — final surface
  to measure: activity dimension rail, GPU morph seam, decimated ambient, and expanded
  activity test bridge.
- `app/(dashboard)/users/access-analysis/activity/ActivityUniverseShell.tsx` — single
  production composition point; owns full/sample/current index maps, LOD flips,
  group/color/strength, legend counts, ambient lifecycle, hover/detail/lasso state, and
  the bottom-left control area.
- `app/(dashboard)/users/access-analysis/activity/activityTestBridge.ts` — current
  `__ACTIVITY_UNIVERSE_TEST__` state: ready, resident/rendered/LOD/stride/selection plus
  groupBy/colorBy/strength/morphCount/ambientActive. Phase 41 extends this seam with
  temporal and measured tier/fps state; it does not revive `__ACC_GRAPH_TEST__`.
- `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` — current point-set,
  color, morph, screen-space, and lasso handle seams. Confirm the narrowest true-visibility
  implementation in cosmos v3 before choosing mask vs point-set filtering.
- `app/(dashboard)/users/access-analysis/activity/activityMotion.ts` — ambient subset
  contract, per-rendered-set length guard, FPS controller, and reduced-motion behavior.
- `app/(dashboard)/users/access-analysis/activity/activityEventLabels.ts` +
  `scripts/compute_activity_embeddings.py` — `monthId` is zero-based months from
  `dicts.monthFloor`; current machine-local meta reports `monthFloor=2024-12`,
  `monthCount=20`. VERIFY the artifact values again at execution time because manual
  pipeline refreshes can extend the ceiling.
- `tests/e2e/acc-dc-graph.spec.ts`, `tests/e2e/acc-3d-lasso.spec.ts`,
  `tests/e2e/spatial-graph-baseline.spec.ts`, `tests/e2e/phase32-ambient.spec.ts`, and
  `tests/e2e/acc-cluster-labels.spec.ts` — instance-era assumptions to replace, delete,
  or port to the activity bridge; keep only assertions for behavior that still exists.
- `scripts/measure-spatial-graph-baseline.cjs` + `playwright.verify.config.ts` — existing
  isolated `:3100`, median-of-5 environment-recording harness to adapt, not fork.
- `.planning/codebase/CONCERNS.md` §3.11–3.12 — exact orphan inventory,
  WIP-preservation warning, `AccInstanceEmbedding` drop, and the first performance lever
  if the final gate misses.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Timeline chrome: one zinc-semantic, full-width bottom overlay above the canvas edge;
  native `<input type="range">` with visible focus, keyboard arrows, labeled Play/Pause,
  All shortcut, current month, and active/total count. No timeline library or new package.
- Exact-month steps are discrete; visual transition ≤200 ms. Playback cadence is one
  second per month and stops at the newest month. Changing month manually pauses it;
  unmount and visibility loss clear the timer.
- All is not a synthetic 21st month in payload data. Keep it as explicit UI state and
  derive labels from `monthFloor + monthId` with the existing `monthLabel` helper.
- The full payload remains resident and immutable. Derive one active full-index set, then
  compose it with L2 sampling/LOD so memory is not duplicated per month. Prefer existing
  typed-array helpers and GraphCanvas2D handles; add no abstraction or dependency unless
  the measured gate proves the native seam insufficient.
- Recompute active-period color legend/counts from the selected index set; keep dimension
  dictionaries and category colors stable across months so animation does not recolor the
  same category between frames.
- Preserve group/color/strength across time. Category centroids remain based on the active
  rendered points with the existing organic packing and top-N label rules; empty categories
  simply have no visible points/label in that month.
- Test bridge gains only fields needed by gates: temporal mode/month/play state/active count,
  current tier, last sampled fps, and renderer identity. Unit-test the pure month-index
  selection once; Playwright owns the integrated timer/control/render contract.
- Re-baseline by deletion and replacement: do not mechanically port the ~1,100-line
  instance spec. One focused activity graph spec plus one activity lasso spec is sufficient;
  delete obsolete 3D/similarity/user-footprint cases and keep person-graph tests untouched.
- CI fixture is deterministic and small but includes at least three months, multiple
  modules, and enough points for a non-empty strict-subset lasso. Full artifact tests and
  headed performance evidence remain separate so fixture speed cannot masquerade as scale.
- REND-04 pass is conjunctive: ≥50 fps for ≥10 s, Tier 0 before/after, ambient active,
  D3D11 renderer guard passed, full shipped L2 activity artifact. No degradation-clause
  closeout and no headless result.
- Verification order: focused Vitest → `npx tsc --noEmit` → full `npm test` →
  `node scripts/repo-map/check.cjs` → isolated `:3100` activity e2e + median-of-5 timing →
  headed D3D11 hard gate → autoDeploy sequence + authenticated populated-route probe.
- Closeout cleanup uses explicit importer checks and explicit git paths. Preserve unrelated
  WIP in `catalogTargets.ts`, `dimensionCatalog.types.ts`, and `catalogTargets.test.ts`;
  no bulk staging or broad deletion.

</defaults>

<decisions>
## Locked Owner Choices (2026-07-21)

1. **Temporal meaning = exact month plus All.** Each of the 20 current month steps is a
   snapshot, not cumulative history or a two-handle range. All restores the full corpus.
2. **Placement = bottom canvas timeline.** The scrubber spans the graph bottom and stays
   separate from the right Dimensions rail; it includes month, active/total count,
   All, and Play/Pause.
3. **Default/playback = All, then oldest→newest at one month/second, stop.** No loop.
   Manual input pauses. Reduced motion has static stepping only and no autoplay.
4. **Filtered truth + composition = active-period counts, preserved dimensions.** Visible
   count and legend counts reflect the selected month; groupBy/colorBy/strength persist.
   Hover, detail, and lasso clear whenever the time selection changes.

</decisions>
