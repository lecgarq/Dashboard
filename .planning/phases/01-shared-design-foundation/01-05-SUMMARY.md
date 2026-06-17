---
phase: 01-shared-design-foundation
plan: "05"
subsystem: ui
tags: [framer-motion, animation, motion, reduced-motion, accessibility, hooks]
status: complete

# Dependency graph
requires:
  - phase: 01-02
    provides: framer-motion 12.40.0 installed (the motion facade consumes it)

provides:
  - "components/ui/motion.ts: central Framer Motion facade with fadeUp, fadeIn, stagger, slideFromRight presets and useSafeVariants hook"
  - "import contract: page components use @/components/ui/motion, never framer-motion directly"
  - "reduced-motion enforcement: single point (useSafeVariants) zeroes all durations under prefers-reduced-motion"

affects:
  - "all per-page phases (2–6) that implement entrance animations"
  - "VIS-06 motion/3D facade contract"
  - "FND-04 accessibility / reduced-motion requirement"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Motion facade: never import framer-motion directly; use @/components/ui/motion"
    - "useSafeVariants: wrap any variant object before passing to a motion element for reduced-motion safety"
    - "hidden/visible convention: all presets use hidden/visible keys, composable with initial='hidden' animate='visible'"
    - "EASE = [0.22, 1, 0.36, 1]: shared cubic-bezier, matches --motion-ease CSS token and animated-list.tsx"

key-files:
  created:
    - components/ui/motion.ts
    - components/ui/__tests__/motion.test.tsx
  modified: []

key-decisions:
  - "Motion facade uses 'use client' directive so useSafeVariants hook is unambiguously client-bound"
  - "stagger preset uses staggerChildren=0.05 (not 0.06) so 6 items * 0.05 + 0.05 delay = 0.35s, strictly under <400ms budget"
  - "animated-list.tsx left untouched; motion.ts is a superset for NEW code only (scope guard honoured)"
  - "Pre-existing EChart.test.tsx tsc errors (14 errors, all in that file) are out of scope — not introduced by this plan"

patterns-established:
  - "hidden/visible: all motion presets follow the hidden/visible variant key convention"
  - "useSafeVariants: every entrance animation in consuming phases must wrap variants with this hook"
  - "Budget invariant: all entrance presets must keep total entrance time (duration + delay) < 0.4s"

requirements-completed: [FND-04, VIS-06]

# Metrics
duration: 4min
completed: 2026-06-17
---

# Phase 01 Plan 05: Motion Facade Summary

**Framer Motion re-export facade with fadeUp/fadeIn/stagger/slideFromRight presets and useSafeVariants hook that zeroes durations under prefers-reduced-motion, establishing the import contract for all per-page entrance animations**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-17T18:16:35Z
- **Completed:** 2026-06-17T18:21:00Z
- **Tasks:** 1 (TDD: RED commit then GREEN commit merged as single feat commit)
- **Files modified:** 2

## Accomplishments

- Created `components/ui/motion.ts`: re-exports `motion` + `AnimatePresence`, exports 4 named variant presets (fadeUp, fadeIn, stagger, slideFromRight), all strictly under the <400ms entrance budget
- `useSafeVariants<T>` hook: single enforcement point — zeroes `duration`, `staggerChildren`, `delayChildren` under `prefers-reduced-motion`; preserves opacity end-states so content remains visible; returns variants unchanged otherwise
- Established import contract: `"use client"` + module-level comment; no page component should import framer-motion directly
- 15 passing tests covering preset budget invariants and useSafeVariants reduced/passthrough behaviour; `animated-list.tsx` untouched

## Task Commits

1. **Task 1: Motion facade — presets + useSafeVariants** - `8474fe5` (feat)

**Plan metadata:** (docs commit follows)

_TDD: test file written first (RED — import error), then motion.ts implemented (GREEN — 15/15 pass)_

## Files Created/Modified

- `components/ui/motion.ts` — Framer Motion re-export facade + variant presets + useSafeVariants hook (VIS-06 / FND-04 import contract)
- `components/ui/__tests__/motion.test.tsx` — 15 tests: preset shape + budget assertions + useSafeVariants reduced/passthrough

## Decisions Made

- `"use client"` directive added at file top — hook (`useSafeVariants`) requires client context; directive is consistent with ARCHITECTURE §2e and doesn't block preset constants from being imported in client components
- `staggerChildren = 0.05` (not 0.06 from task spec): 0.06 × 6 + 0.05 = 0.41s exceeds the <400ms hard budget; adjusted down to 0.05 so 6 items complete at 0.35s
- Reused `EASE = [0.22, 1, 0.36, 1]` locally (not imported from animated-list.tsx) to honour the scope guard — animated-list.tsx is untouched

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Budget precision] staggerChildren adjusted from 0.06 to 0.05**

- **Found during:** Task 1 implementation review
- **Issue:** The plan spec states `staggerChildren: 0.06` but also asserts 0.06 × 6 + 0.05 = 0.36s under budget. The correct math is 0.06 × 6 + 0.05 = 0.41s (exceeds <400ms). The test asserts `staggerChildren * 6 + delayChildren < 0.4`.
- **Fix:** Used `staggerChildren: 0.05` so the total is 0.35s, strictly under budget, and the test passes cleanly.
- **Files modified:** components/ui/motion.ts
- **Verification:** vitest run passes (15/15); stagger budget assertion passes
- **Committed in:** 8474fe5

---

**Total deviations:** 1 auto-fixed (Rule 1 — budget math correction)
**Impact on plan:** Corrects a spec arithmetic error; all constraints now hold.

## Issues Encountered

- Pre-existing `EChart.test.tsx` tsc errors (14 errors) are unrelated to this plan and were present before any changes. Documented in deferred-items.md. tsc has 0 errors in motion.ts or its test file.

## Known Stubs

None — `motion.ts` is a pure re-export facade with no data dependencies.

## Next Phase Readiness

- `@/components/ui/motion` import contract is live; any Phase 2+ component can `import { motion, fadeUp, useSafeVariants } from "@/components/ui/motion"`
- VIS-06 facade contract established (R3F 3D accents remain Phase 4/6 — out of scope)
- FND-04 reduced-motion enforcement is active via useSafeVariants

---
*Phase: 01-shared-design-foundation*
*Completed: 2026-06-17*
