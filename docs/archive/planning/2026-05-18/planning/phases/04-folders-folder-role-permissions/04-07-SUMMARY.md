---
phase: 04-folders-folder-role-permissions
plan: 07
subsystem: perf-gate
tags: [perf, playwright, cosmos-gl, gate, deferred-measurement, scaffold]

# Dependency graph
requires:
  - phase: 04-folders-folder-role-permissions/04-04
    provides: folder-crawl runtime — produces the live node-count baseline that PERF-GATE measures against
provides:
  - PERF-GATE.md scaffold + GRAPH-04-GATE=PENDING-MANUAL-PERF-MEASUREMENT decision line
  - scripts/perf-preflight.cjs — Playwright headless harness ready to run when manual UAT lands
affects: [Phase 5 GRAPH-04, Phase 7 plan 07-01 3D-FOLDERS gate visibility]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scaffold-with-deferred-measurement: methodology locked in markdown + script committed, raw numbers left blank with literal DEFERRED tokens so no fabricated value can slip through grep"
    - "GPU-memory honesty: heap proxy explicitly framed as a lower bound, not a VRAM substitute"
    - "Conservative pending-decision rule: PENDING treated as NO-GO for downstream planning until manual UAT flips it"

key-files:
  created:
    - scripts/perf-preflight.cjs
    - .planning/phases/04-folders-folder-role-permissions/PERF-GATE.md
    - .planning/phases/04-folders-folder-role-permissions/04-07-SUMMARY.md
  modified: []

key-decisions:
  - "GRAPH-04-GATE=PENDING-MANUAL-PERF-MEASUREMENT. Plan executed in scaffold mode per Luis directive 2026-05-12 ('continue with the next waves, don't wait for verification, we will verify it at the end'). Script + methodology are complete; FPS/memory numbers stay blank until phase-end manual UAT pass."
  - "Playwright over Puppeteer: playwright 1.59.1 already in devDependencies; puppeteer absent. Option A (headless Chromium) chosen over Option B (HTML harness) because the driver is one require() away."
  - "Memory proxy = performance.memory.usedJSHeapSize (heap, NOT VRAM). Documented in PERF-GATE.md Methodology Caveats — treat heap as a lower-bound conservative signal."
  - "Synthetic-node injection requires a window.__cosmosGraph dev-only hook that does not yet exist in AccUsersGraph.tsx. Manual UAT pass must either add the one-line hook OR fall back to an Option-B HTML harness. Without the hook, 2×/5× rows degenerate to no-op injection — flagged in PERF-GATE.md."
  - "Pending-decision rule: until a real measurement flips the verdict, Phase 5 GRAPH-04 planners must treat PENDING as NO-GO. Matches CONTEXT.md 'honest NO-GO over sluggish integration' bias."

metrics:
  duration: ~5 min
  completed: 2026-05-12
---

# Phase 04 Plan 07: Perf Pre-Flight (PERF-GATE) Summary

**One-liner:** Shipped the PERF-GATE.md scaffold + `scripts/perf-preflight.cjs` Playwright measurement harness with the decision deliberately left as `GRAPH-04-GATE=PENDING-MANUAL-PERF-MEASUREMENT` — no FPS/memory numbers fabricated, methodology locked, real measurement deferred to phase-end manual UAT per Luis directive 2026-05-12.

## Outcome

**PERF-GATE decision: `GRAPH-04-GATE=PENDING-MANUAL-PERF-MEASUREMENT`** → see `.planning/phases/04-folders-folder-role-permissions/PERF-GATE.md`.

The artifact Phase 5 GRAPH-04 will read is now on disk; its decision line is unambiguous (pending, not GO, not NO-GO). Phase 7 plan 07-01 previously keyed `3D-FOLDERS=NO-GO` on the **absence** of PERF-GATE.md — that visibility constraint is now satisfied, but the underlying decision stays open until manual UAT lands real numbers.

## What Was Built

### `scripts/perf-preflight.cjs`

Playwright headless Chromium driver, 188 lines. Loads `/users`, waits for the cosmos `<canvas>`, samples FPS via `requestAnimationFrame` over 5 s, reads `performance.memory.usedJSHeapSize` as the memory proxy. Iterates `[1×, 2×, 5×]` multipliers; injection uses a `window.__cosmosGraph.addSyntheticNodes` dev-only hook that **does not yet exist** in `AccUsersGraph.tsx` (caveat documented inline + in PERF-GATE.md). Flag `--write-gate` back-fills PERF-GATE.md's Measurements table when a real run lands; default mode is dry-run.

Cosmos.gl v3 alpha-inversion note (`getSimulationAlpha() = 1 - progress`) flagged inline for any future "wait until settled" gate.

### `.planning/phases/04-folders-folder-role-permissions/PERF-GATE.md`

Full methodology section: Option-A Playwright approach, run instructions (dev server + storageState export), the alpha-inversion note, the heap-vs-VRAM honesty paragraph, and the injection-hook caveat with two mitigation paths (one-line dev hook in renderer, or Option-B HTML harness). Measurements table rows literal `_DEFERRED_` strings — grep-detectable so no fabricated number can sneak in. GO/NO-GO/PENDING contingency contract written so Phase 5 GRAPH-04 planning has a deterministic instruction whichever way the gate flips.

## Tasks

| # | Task                                                          | Status     | Commit    | Notes                                              |
|---|---------------------------------------------------------------|------------|-----------|----------------------------------------------------|
| 1 | Implement scripts/perf-preflight.cjs (Option A Playwright)    | Done       | `de62013` | Syntax-checked via `node --check`; not executed.   |
| 2 | Write PERF-GATE.md with GO/NO-GO decision                     | Scaffolded | `bd45843` | Decision = PENDING; numbers DEFERRED to UAT.       |
| 3 | Luis approves the perf decision (checkpoint:human-verify)     | Auto-approved per directive | n/a | Per Luis 2026-05-12: don't wait for verification.  |

## Deviations from Plan

### Scaffold-mode execution (intentional, per Luis directive)

- **Found during:** Plan kickoff
- **Issue:** Plan requires live browser FPS + GPU memory measurements, but Luis directive 2026-05-12 explicitly defers all UAT/live-verification to phase end ("continue with the next waves, don't wait for verification, we will verify it at the end").
- **Fix:** Implemented the measurement tool fully (script parses, methodology locked). Did NOT execute the script. Did NOT fabricate FPS or memory values. PERF-GATE.md uses literal `_DEFERRED_` and `DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12` tokens so any post-hoc grep proves no number was invented.
- **Files modified:** `scripts/perf-preflight.cjs`, `.planning/phases/04-folders-folder-role-permissions/PERF-GATE.md`
- **Commits:** `de62013` (script), `bd45843` (gate scaffold)

### Auto-approved checkpoint (Task 3)

- **Found during:** Task 3 (`checkpoint:human-verify`)
- **Issue:** Plan's autonomous:false UAT gate would normally pause for Luis review.
- **Fix:** Auto-approved per the same directive driving the deferred measurement. Phase-end manual UAT owns the real approval.
- **Commits:** n/a (process decision)

### No injection hook in renderer

- **Found during:** Script authoring
- **Issue:** `AccUsersGraph.tsx` does not expose `window.__cosmosGraph` or any debug surface for adding synthetic nodes.
- **Fix:** Did NOT modify the renderer (out of plan scope; would be a Rule-4 architectural change for a measurement-only plan). Documented the gap + two mitigation paths inside PERF-GATE.md Methodology Caveats so the manual UAT pass has a clear next step.
- **Files modified:** none (gap documented, not patched)

## Deferred Issues

- Real FPS / heap-MB / node-count numbers for 1×, 2×, 5× multipliers — to be captured at phase-end manual UAT.
- `window.__cosmosGraph` dev-only injection hook in `AccUsersGraph.tsx` — chooser between the one-line hook vs Option-B HTML harness belongs to the manual UAT pass.
- `GRAPH-04-GATE` final verdict (GO vs NO-GO) — pending real measurement; defaults to NO-GO for Phase 5 planning purposes until flipped.

## Requirements

- **FLDR-04**: PERF-GATE artifact scaffolded; decision line in place. Marking complete at the **scaffold level** — the real perf verdict is owned by phase-end manual UAT, which will edit PERF-GATE.md in place without re-running this plan.

## Self-Check: PASSED

- `scripts/perf-preflight.cjs` — FOUND
- `.planning/phases/04-folders-folder-role-permissions/PERF-GATE.md` — FOUND
- Commit `de62013` — FOUND in `git log`
- Commit `bd45843` — FOUND in `git log`
- No fabricated FPS/memory values in PERF-GATE.md (verified by literal `_DEFERRED_` and DEFERRED-token presence)
