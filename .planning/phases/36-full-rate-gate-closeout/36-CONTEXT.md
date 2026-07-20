# Phase 36: Full-Rate Gate & Closeout - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Close v2.6 by proving the shipped Cosmos-native similarity web passes the workshop-machine
gate that v2.5 could not pass. Phase 36 covers **REND-02** only:

1. Re-run the established LIFE-03 full-data measurement on `/users/spatial-graph` with
   22,279 nodes, all 18,000 mapped similarity links, ambient motion active, and Tier 0 held
   for at least 10 seconds.
2. Re-run the established isolated `:3100` median-of-5 time-to-graph measurement and compare
   it strictly with the Phase-33 median of 3,913.7 ms.
3. Sweep the milestone gates, deploy under the repository autoDeploy policy, and record the
   build and route probes in `36-VERIFICATION.md`.

**What does NOT change here:**

- No renderer, graph data, visual expression, interaction, tier-controller, query, schema,
  dependency, or user-facing control change is planned. Phase 35 owns REND-01/03 and is
  already deployed.
- No permanent machine-independent `>=50 fps` Playwright assertion. The existing portable
  test continues to prove full-rate-or-visible-degradation behavior on arbitrary machines;
  the strict threshold is workshop-machine closeout evidence.
- No Tier-3 dimensions, issue graph, temporal scrubber, data-truth work, 3D renderer work,
  or test-file splitting. Those remain deferred beyond v2.6.

**Name-collision trap:** use `app/(dashboard)/users/access-analysis/` and
`/users/spatial-graph`; `app/(dashboard)/access-analysis/` is the unrelated 23-panel charts
page.
</domain>

<evidence>
## Grounding Sources

- `.planning/phases/35-similarity-web-renderer-rethink/35-VERIFICATION.md`: the deployed
  native renderer already produced 60.07 fps over 10.02 seconds with 22,279 nodes, 18,000
  links, and Tier 0 before/after. Phase 36 independently re-runs this as the measure-last
  milestone gate; it does not reuse the prior number as its pass.
- `.planning/phases/35-similarity-web-renderer-rethink/35-BASELINE.md`: current authoritative
  full-data measurement conditions and the resolved 18,000-link count, superseding the
  historical `~14.2k` roadmap shorthand.
- `tests/e2e/phase32-ambient.spec.ts`: existing authenticated `:3100` LIFE-03 harness,
  3-second warm-up, continuous >=10-second rAF sample, node/link/renderer evidence, tier
  before/after, reduced-motion proof, and framebuffer gate. Its portable degradation clause
  stays unchanged.
- `app/(dashboard)/users/access-analysis/graphTestBridge.ts`: exposes `getAmbientStats()`
  and `exerciseAmbientController()` without adding a second browser bridge.
- `tests/e2e/spatial-graph-baseline.spec.ts` and
  `scripts/measure-spatial-graph-baseline.cjs`: established isolated-production N=5 method;
  each run uses a fresh authenticated browser context and run 1 is cold.
- Historical `.planning/phases/33-perf-closeout-verification/33-BASELINE.md` at commit
  `27297514`: Phase-33 reference median is **3,913.7 ms** from runs 7,666.8 / 3,703.2 /
  3,873.3 / 3,913.7 / 3,981.2 ms.
- `.planning/phases/34-test-guard-health-sweep/34-VERIFICATION.md`: Phase 34 restored the
  full unit/e2e/tooling gates that Phase 36 must sweep.
- `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md`: REND-02 requires >=50 fps,
  Tier 0 unchanged over the sample, strict time-to-graph non-regression, reduced-motion
  static behavior, full gates, deploy, and route evidence.
</evidence>

<defaults>
## Inferred Dashboard Defaults

- **Evidence-only phase by default.** Reuse the existing measurement scripts/specs and
  write phase artifacts; add product or test code only if a gate exposes a real regression.
- Run the full automated gate sweep before the two closeout measurements. Run time-to-graph
  first and the LIFE-03 full-rate sample last, preserving the milestone's measure-last rule.
- Use one fresh isolated `.next-e2e` webpack production build on `:3100`, compiled with
  `NEXT_PUBLIC_ACC_GRAPH_TEST=1`, for comparable browser evidence. Do not disturb live
  `:3000` until the final autoDeploy sequence.
- Accept the full-rate gate only when the recorded sample is >=10 seconds, FPS is >=50,
  node/link counts are 22,279/18,000, renderer is `cosmos-native`, and tier is 0 both before
  and after. A failed first sample blocks investigation; do not cherry-pick repeats.
- Accept time-to-graph only when the N=5 median is <=3,913.7 ms. Record all five runs, the
  cold marker, the median, and percentage delta. The roadmap's “any regression blocks” rule
  is literal; no unapproved noise allowance.
- Reduced motion is proved by the existing browser assertion: zero animated nodes and an
  unchanged position version while focus remains functional.
- If any gate fails, keep Phase 36 open, fix only the narrow root cause, and re-run the
  affected gate plus the complete closeout sequence. Do not weaken thresholds or tests.
- Final verification records exact test counts, measurement payloads, repo-map baseline
  warnings separately from regressions, deployment BUILD_ID, health response, and both
  unauthenticated and authenticated graph-route probes.
</defaults>

<decisions>
## Locked Owner Decisions (2026-07-20)

1. **The >=50 fps threshold is a workshop-machine closeout gate, not a permanent portable
   Playwright hard assertion.** Keep `phase32-ambient.spec.ts` portable for slower machines:
   it may pass only when full mode holds or the controller visibly degrades. Phase 36 reads
   the same recorded payload against the stricter REND-02 acceptance rule in
   `36-VERIFICATION.md`.

2. **Closeout thresholds are literal.** Full-rate requires >=50 fps with Tier 0 before and
   after for >=10 seconds at 22,279 nodes / 18,000 links. Time-to-graph requires an N=5
   median no slower than 3,913.7 ms. Failure blocks closeout; no tolerance band or
   degradation-clause escape applies to the workshop-machine result.

3. **Do not manufacture Phase 36 code.** Existing Phase-34/35 gates and measurement seams
   are the implementation. Product changes are authorized only if fresh evidence finds a
   regression, and then only at the narrowest shared boundary with one focused regression
   check.

## Requirement Traceability

- REND-02 -> Decisions 1-3 + full-rate/time-to-graph acceptance defaults + recorded deploy
  evidence.

## Deferred Items

- Permanent hardware-independent >=50 fps CI assertion: skipped because the three-tier
  controller deliberately supports slower machines; revisit only with a controlled
  performance runner.
- Longer or repeated performance sampling: not required by LIFE-03; add only if the first
  honest sample is unstable enough that the current method cannot produce trustworthy
  evidence.
- All v2.7 candidates and standing debt remain in `STATE.md` Deferred Items.
</decisions>
