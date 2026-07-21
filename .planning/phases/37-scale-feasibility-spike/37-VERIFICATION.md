# 37-VERIFICATION — Scale Feasibility Spike & Fallback Ladder

**Verified:** 2026-07-21 · **Requirement:** SCALE-01 · **Plans:** 4/4 summarized

## Roadmap success criteria → shipped evidence

1. **Full 4,862,301-point cosmos.gl render measured** ✓ — `/users/scale-spike` harness
   (commit `f772f5bc`) on the isolated `:3100` prod build, hardware D3D11 (Intel iGPU,
   renderer string recorded); fps at rest (8.0), pan+zoom (18.0), ambient CPU (1.5) and
   GPU-sim (2.2); GPU memory accounting (measured JS 170 MB / labeled-estimate cosmos
   ~117 MB); context-loss: none at any scale. All in `37-BASELINE.md`.
2. **Binary payload prototype measured** ✓ — columnar codec + flag-gated route
   (commit `6a3e99f6`); 72,935,020 bytes on wire, fetch 511 ms / decode 0.2 ms / upload
   543 ms, **total 1,072 ms** at full scale. Grounds the Phase-38 SCALE-02 budget
   (recommended input: ≤ ~2.5 s median-of-5).
3. **Embedding runtime estimated from measured sample-fits** ✓ — real-sample PaCMAP
   16.5 s @100k / 128.5 s @500k / 379.8 s @1M (determinism identical), faiss flat
   projection 840 rows/s; full-fit **~34 min labeled extrapolation** (`37-03-SUMMARY.md`).
4. **Ladder rung chosen from evidence with explicit owner sign-off** ✓ — readiness table
   (L0 FAIL, L1 FAIL, L2 VIABLE, L3 GREEN) presented with live `:3100` demo links;
   **owner locked L2 (LOD rendering)** 2026-07-21; decision + build-target implications
   recorded verbatim in `37-BASELINE.md` "Ladder decision (owner)". REND-04's below-L0
   sign-off clause satisfied.
5. **No production surface changes** ✓ — all spike code behind
   `NEXT_PUBLIC_ACC_SCALE_SPIKE` (route + API 404 flag-off); isolation grep clean (no
   imports from outside `users/scale-spike/`); `npx tsc --noEmit` = 0 after every plan.

## Gates actually run (exact outcomes)

- `npx vitest run …spikeSynthetic.test.ts` → 4/4 pass · `…columnar.test.ts` → 3/3 pass
- `npx tsc --noEmit` → 0 errors (run after 37-01, 37-02, spec edits)
- `node scripts/repo-map/check.cjs` → passed (pre-existing 3 dep-cruiser warnings +
  248 baseline ast-grep findings unchanged)
- `tests/e2e/scale-spike.spec.ts` on `:3100` → green at n=4,862,301 / 1M / 500k / 250k /
  106,196 (honesty invariants + hardware-renderer guard)
- Embedding script exit 0, read-only (SELECT-only), determinism spot-check identical

## Deviations carried from summaries

- SwiftShader first-run discard + headed/D3D11 guard (37-04; now a CONCERNS trap entry).
- `createAmbientMotionLayer` not reused at 4.86M (per-node id strings); controller reused.
- `runPayload` as dedicated bridge method (intent preserved).
- Ceiling probes beyond the single full-scale run (produced the ~500k ceiling + direct
  L3 proof).

## Cut review (ponytail)

Spike additions reviewed for over-engineering: code is additive, flag-gated, zero new
deps, reuses GraphCanvas2D/fps-controller/spec-orchestrator patterns. No deletions found
worth taking; the columnar header-stabilization loop stays (correctness over cleverness).

## Remaining VERIFY / gaps

- None open for SCALE-01. Phase-38 inputs recorded as CONCERNS entries (ambient path,
  faiss index choice, full-fit RSS estimate, spike-surface lifecycle).

## Deploy (autoDeploy policy)

Deploy-sequence run 2026-07-21: `LECG Dashboard Local` task stopped, `:3000` freed
(Listen-state clean), `npx tsc --noEmit` = 0, `npm run build` exit 0, task restarted
(state Running), **BUILD_ID `LGy8KOP1nWXoeczYd5-8J`**. Probes: `/api/health` **200**,
`/users/spatial-graph` **307** (auth redirect — established normal),
`/api/scale-spike/payload` **404** (flag off in prod — isolation proven),
`/users/scale-spike` **307** (auth middleware fires before the page's `notFound()` gate;
flag-off 404 enforced in-page by code, API 404 is the observable proof). `:3100` demo
server stopped after the checkpoint.
