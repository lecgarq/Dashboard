# 37-BASELINE — Scale Feasibility Spike (SCALE-01)

**Measured:** 2026-07-21, workshop machine (the local `:3000` box)
**Harness:** flag-gated `/users/scale-spike` (commit `f772f5bc`) + `/api/scale-spike/payload`
(commit `6a3e99f6`), driven by `tests/e2e/scale-spike.spec.ts` via
`scripts/measure-scale-spike.cjs` on the isolated `:3100` production build.
**Environment:** cosmos.gl `@cosmos.gl/graph` 3.3.0 (patch applied), `.next-e2e` BUILD_ID at
measurement commit `f1af6416` lineage; Playwright Chromium **headed, D3D11 ANGLE**.
**GPU (resolves CONTEXT VERIFY):** `ANGLE (Intel, Intel(R) Graphics (0x00007D67) Direct3D11
vs_5_0 ps_5_0, D3D11)` — Intel integrated graphics. VRAM is shared system memory
(browser cannot read true VRAM — buffer figures below are allocation accounting, labeled).

**Methodology honesty:**
- First run recorded SwiftShader (software) numbers — DISCARDED; the spec now hard-fails on
  a SwiftShader renderer (`assertHardwareRenderer`). All numbers below are hardware D3D11.
- Each scenario ≥12 s rAF sample; median instantaneous fps + min 1 s-window fps; the
  production `createAmbientFpsController` fed the same windows (tier verdict).
- `rest` note: cosmos draws continuously at this scale, so rest IS render cost here.
- Synthetic positions at real scale (48-cluster Gaussian mixture, deterministic seed 42),
  real attribute cardinalities (57 verbs / 13 objectTypes / 956 projects / 2,313 authors).

## Track (a) — Render (fps median / min-window)

| points | rest | panzoom | cpuAmbient (full-set rAF push) | gpuDrift (cosmos GPU sim) | context loss |
|---|---|---|---|---|---|
| **4,862,301** | **8.0 / 6.8** | 18.0 / 7.5 | 1.5 / 1.2 | 2.2 / 2.1 | none |
| 1,000,000 | 36.1 / 35.5 | 142.9 / 58.6 | 11.1 | 10.3 | none |
| 500,000 | **71.9 / 68.1** | 142.9 / 104.3 | 16.0 | 20.4 | none |
| 250,000 | 142.9 / 63.8 | 144.9 / 142.0 | 28.8 | 36.2 | none |
| **106,196 (L3 grain)** | **144.9 / 141.1** | 144.9 / 144.0 | **73.0 / 61.6** | **71.9 / 54.3** | none |

- **Static-render ≥50 fps ceiling ≈ 500k rendered points** on this iGPU.
- No `webglcontextlost` at any scale incl. 4.86M. JS heap at full scale ≈ 1.13 GB;
  JS typed-array allocations 170 MB; estimated cosmos GPU buffers ~117 MB (estimate).
- Full-set CPU choreography (`pushPositions`) is dead ≥250k (28.8 fps) — confirms the
  PERF-07 premise that per-node CPU/rAF motion cannot carry the new grain.
- cosmos's own GPU force sim is NOT the cheap ambient path (20.4 fps @500k): ambient at
  scale needs custom GPU-shader displacement or decimation regardless of rung.

## Track (b) — Binary columnar payload (73 MB at full scale)

| points | bytes on wire | fetch | decode | derive colors | GPU upload | **total** |
|---|---|---|---|---|---|---|
| 4,862,301 | 72,935,020 | 511 ms | 0.2 ms | 17 ms | 543 ms | **1,072 ms** |
| 1,000,000 | 15,000,488 | — | — | — | — | 281 ms |
| 106,196 | 1,593,432 | — | — | — | — | 44 ms |

Zero-copy decode is effectively free; wire + GPU upload dominate. **The binary columnar
path comfortably beats the v2.6 JSON budget class (2,386.7 ms median at 22k) while moving
220× the data.** Recommended SCALE-02 budget input: full-corpus payload ≤ ~2.5 s median-of-5.

## Track (c) — Embedding runtime (real AccActivityAccds samples, seed 42)

| n | PaCMAP fit | peak RSS |
|---|---|---|
| 100,000 | 16.5 s (determinism re-fit: identical) | 333 MB |
| 500,000 | 128.5 s | 714 MB |
| 1,000,000 | 379.8 s | 1,246 MB |

- **Full-corpus full-fit estimate ~34 min** (n log n extrapolation — NOT measured). RSS
  trend suggests ~6 GB at full fit (estimate).
- faiss flat-index kNN projection measured **840 rows/s** → ~77 min for the 3.86M remainder
  (extrapolation) — SLOWER than full fit with a brute-force index. ANN index (IVF/HNSW) is
  the Phase-38 lever if projection is wanted; full-fit looks tractable outright.

## Ladder readiness (evidence → rung)

| rung | definition | evidence verdict |
|---|---|---|
| **L0** | all 4.86M animated ≥50 fps | **FAIL** — static render alone is 8 fps; both ambient variants ≤2.2 fps |
| **L1** | all resident + rendered; decimated ambient | **FAIL** — base full-set render is 8 fps; ambient decimation cannot fix it |
| **L2** | all 4.86M resident; far-zoom LOD decimation of RENDERING | **VIABLE** — data resident is proven (no context loss, 73 MB payload in ~1.1 s); ≥50 fps needs the rendered subset ≤ ~500k; ambient on the rendered subset still needs custom-shader or decimated motion (cosmos sim is 20.4 fps @500k) |
| **L3** | bounded grain user+project+verb+month = 106,196 (every activity counted) | **GREEN across the board** — 144.9 rest, 73.0 cpuAmbient, 71.9 gpuDrift, all mins ≥54 |

## Ladder decision (owner)

**L2 — LOD rendering. Locked 2026-07-21 at the phase-end checkpoint** (owner selected
"L2 — LOD rendering (Recommended)" from the four-option rung choice; numbers table +
live `:3100` demo links presented).

What L2 means for every later phase (build target, from the evidence):

- **All 4,862,301 events resident** — binary columnar payload (~73 MB, ~1.1 s measured)
  + full cosmos point set uploaded (no context loss proven).
- **Far-zoom renders a decimated subset ≤ ~500k points** (≥50 fps static proven at 500k:
  71.9/68.1); zoom reveals per-region detail via the existing `setPointSet`/`pushPointSet`
  LOD seam in GraphCanvas2D.
- **Ambient motion on a bounded subset (~100k class)** — 73 fps CPU-choreographed proven
  at 106k; cosmos's GPU force sim is NOT the ambient path (20.4 fps @500k). Phase 40
  decides custom-shader vs decimated-CPU from this evidence.
- REND-04's ≥50 fps hard gate at close applies to this rung; shipping below L0 carries
  this recorded sign-off (REQUIREMENTS REND-04 clause satisfied).
