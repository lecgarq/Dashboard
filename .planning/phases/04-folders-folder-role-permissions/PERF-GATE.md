# Phase 4 Perf Pre-Flight: GO/NO-GO Decision

**Measured:** _DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12_
**Hub:** Hermosillo
**Methodology:** Option A — Playwright headless Chromium driving `/users` route, sampling FPS via `requestAnimationFrame` count over a 5-second window, with `performance.memory.usedJSHeapSize` as the memory proxy. Injection of synthetic 2×/5× folder nodes uses a `window.__cosmosGraph` dev-only hook (see "Methodology Caveats" below).
**Cosmos.gl version:** `@cosmos.gl/graph` 3.0.0-beta.9 (per package.json at the time of script authoring)
**Script:** `scripts/perf-preflight.cjs`

---

## Methodology

1. Start the Next.js dev server: `npm run dev` (defaults to `http://localhost:3000`).
2. Authenticate once in a regular browser; export the session storage state to `.secrets/playwright-storage.json` (or set `PERF_PREFLIGHT_STORAGE_STATE`).
3. Run: `node scripts/perf-preflight.cjs` (add `--write-gate` to back-fill the measurement table below).
4. The script:
   - Launches headless Chromium at 1600×1000, deviceScaleFactor=1.
   - Navigates to `/users`, waits for the cosmos `<canvas>` to mount and the simulation to spin up (2 s warm-up).
   - For each multiplier in `[1, 2, 5]`:
     - If `mult > 1`: calls `window.__cosmosGraph.addSyntheticNodes(target, { kind: 'folder' })` to grow the rendered set.
     - Waits 2 s for layout to breathe.
     - Samples 5 s of `requestAnimationFrame` callbacks → mean FPS.
     - Reads `performance.memory.usedJSHeapSize` as the memory proxy.
     - Reads `window.__cosmosGraph.nodes.length` for the post-injection node count.
5. Console emits `[perf] {mult}x nodes=N fps=F heapMB=M` per multiplier.

### Cosmos.gl alpha note

`getSimulationAlpha()` in cosmos.gl v3 returns `(1 - progress)` — INVERTED from d3 alpha (memory: cosmos alpha inversion, 2026-05-XX). Not consumed by this script directly, but any future "wait until settled" gate must use `progress` (rising to 1) rather than alpha (falling to 0) as the d3-style intuition would suggest.

### Memory proxy honesty

`performance.memory.usedJSHeapSize` measures **JavaScript heap**, NOT GPU VRAM. Cosmos.gl stores positions/links in WebGL buffers — GPU memory is **not introspectable** from a normal page context (`navigator.gpu` is WebGPU-only and not in use here). Treat the heapMB column as a **lower bound** proxy: a heap close to 512 MB is a strong NO-GO signal; a heap well below 256 MB is at best a *weak* GO signal because true VRAM may still be 2–4× higher.

### Injection hook caveat

The current renderer (`app/(dashboard)/users/AccUsersGraph.tsx`) does **NOT** expose `window.__cosmosGraph` as of Phase 4 plan 07. Without that hook, the script measures FPS at the live node count only (1× baseline) — the 2× and 5× rows degenerate to "no-op injection". Two mitigation paths for manual UAT:

- **(a) One-line dev hook (recommended):** Inside `AccUsersGraph` mount effect, gate by `process.env.NODE_ENV !== 'production'` and assign `window.__cosmosGraph = { nodes, addSyntheticNodes }` with an `addSyntheticNodes` helper that pushes synthetic folder nodes through the existing setState path.
- **(b) Option B HTML harness:** Author a standalone `tmp/perf-preflight.html` that mounts the graph against synthetic data fixtures sized to 2×/5× the live count, then read the same FPS/heap numbers manually. Slower to set up; doesn't touch renderer code.

Both choices belong to the **manual UAT pass**, not this scaffold.

---

## Measurements

| Multiplier | Node count | Mean FPS (5s) | Heap proxy (MB) |
|------------|------------|---------------|-----------------|
| 1×         | _DEFERRED_ | _DEFERRED_    | _DEFERRED_      |
| 2×         | _DEFERRED_ | _DEFERRED_    | _DEFERRED_      |
| 5×         | _DEFERRED_ | _DEFERRED_    | _DEFERRED_      |

> **Numbers intentionally not fabricated.** The script exists, the methodology is locked, the values land at phase-end manual UAT per Luis directive 2026-05-12 ("continue with the next waves, don't wait for verification, we will verify it at the end").

---

## GO Threshold (strict, per CONTEXT.md)

- 60 FPS sustained AND
- GPU memory < 512 MB (heap proxy < 256 MB as a conservative substitute when VRAM is unreadable)
- Evaluated at the **projected node count** (5× as worst-case growth headroom)

---

## Decision

**DEFERRED — `GRAPH-04-GATE=PENDING-MANUAL-PERF-MEASUREMENT`**

### Rationale

No live FPS or memory sample has been taken. The script is feature-complete and the methodology is locked, so the manual UAT pass can capture the three rows without further design work. Phase 7 plan 07-01 already keyed its `3D-FOLDERS=NO-GO` on the **absence** of this artifact; the scaffold flips gate **visibility** (the file now exists for Phase 5 GRAPH-04 to read) but the **decision** stays pending until real numbers land.

### Contingency

- **If GO at phase-end UAT:** Phase 5 GRAPH-04 wires folder nodes as the 5th node kind (`'folder'` is already defined in `GraphRenderNode.kind` per Plan 07-05), hidden by default with the `showFolders` filter toggle already shipped in Plan 07-06.
- **If NO-GO at phase-end UAT:** Folder nodes do **not** ship in the graph. The dashboard-only path via `FolderPermissionsWidget` (Plan 04-06, pending) carries folder UX. Re-consideration is gated on either (a) `@cosmos.gl/graph` v4 release with claimed perf gains, or (b) a switch to LOD/zoom-tier culling of folder nodes. Cosmos.gl v4 is the more likely near-term trigger given the patch churn already visible (`patches/@cosmos.gl+graph+3.0.0-beta.9.patch`).
- **If PENDING (current state):** Phase 5 GRAPH-04 plan, whenever drafted, **must** read this DECISION line first. Until the value flips to `GO` or `NO-GO`, GRAPH-04 plans assume **NO-GO** for safety (consistent with the conservative bias in CONTEXT.md "honest NO-GO over sluggish integration").

---

## Raw Console Output

```
DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12
```

---

## Phase 5 GRAPH-04 Plan Instruction

Phase 5 planner: read this file before planning GRAPH-04. The decision is currently `PENDING-MANUAL-PERF-MEASUREMENT` — treat as **NO-GO for planning purposes** until a real measurement flips the verdict. Do not re-measure unless the underlying `@cosmos.gl/graph` version changes. When the manual UAT pass lands real numbers, this file's "Decision" section is the single source of truth — no re-planning required if the gate flips to GO.

---

**DECISION:** `GRAPH-04-GATE=PENDING-MANUAL-PERF-MEASUREMENT`
