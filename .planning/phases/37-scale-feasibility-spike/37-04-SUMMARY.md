# 37-04 Summary — Measurement run, 37-BASELINE.md, ladder-rung owner checkpoint

**Status:** COMPLETE 2026-07-21 — **owner locked L2 (LOD rendering)** at the checkpoint.
**Requirement:** SCALE-01 (closes it, with 37-01/02/03)

## What ran

- `tests/e2e/scale-spike.spec.ts` + `scripts/measure-scale-spike.cjs` (commit `ccee0f46`)
  against the isolated `:3100` production build (`.next-e2e`, both spike flags), PowerShell
  build per standing rules; `:3000` untouched throughout.
- Runs at n = 4,862,301 / 1,000,000 / 500,000 / 250,000 / 106,196 (`SPIKE_N`), frozen +
  GPU passes each. Raw JSONs archived in the session scratchpad; canonical numbers in
  `37-BASELINE.md`.

## Deviations (recorded honestly)

1. **SwiftShader trap:** the first measurement run silently used Playwright headless
   Chromium's SwiftShader software rasterizer (0.4–1 fps) — worthless as GPU evidence.
   Discarded; spec now runs HEADED with `--use-angle=d3d11` and hard-fails on a
   SwiftShader renderer string (`assertHardwareRenderer`). Durable trap for every future
   fps measurement on this repo.
2. Ceiling probes at 1M/500k/250k/106k were added beyond the plan's single full-scale run
   (plan task 3's descending-`?n=` clause) — they produced the ≥50 fps ceiling (~500k) and
   the direct L3-grain proof the owner decision needed.

## Checkpoint

Owner shown the readiness table + live demo links; selected **"L2 — LOD rendering
(Recommended)"**. Decision + build-target implications recorded verbatim in
`37-BASELINE.md` "Ladder decision (owner)". REND-04's below-L0 sign-off clause is
satisfied by this record.

## Gates

- Spec green on `:3100` (honesty invariants; renderer guard), `test-results/scale-spike.json`
  written per run. `npx tsc --noEmit` → 0.
- 37-BASELINE.md complete: GPU/renderer recorded (Intel iGPU D3D11 — resolves the CONTEXT
  VERIFY), per-scenario fps, context loss (none), memory accounting (measured vs estimate
  labeled), payload timings, embedding numbers, environment record, owner decision.

## Follow-ups / debt (rolled to CONCERNS by phase close)

- Ambient at L2 scale needs custom GPU-shader displacement or bounded-subset decimation —
  cosmos's own force sim measured insufficient (Phase 40 input).
- faiss flat-index projection slower than full fit; IVF/HNSW is the Phase-38 lever if
  projection is wanted.
- Spike route/flag removal or re-gate decision belongs to milestone close.
