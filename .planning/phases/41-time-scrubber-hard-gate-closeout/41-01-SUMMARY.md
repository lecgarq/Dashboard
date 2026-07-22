# 41-01 Summary — Exact-month scrubber and activity-state composition

## Shipped

- `activityTime.ts` selects exact-month full indices and deterministically caps
  an arbitrary active set at the existing L2 ceiling.
- `ActivityUniverseShell.tsx` now opens on All and provides the locked bottom
  native timeline: exact month, active/total count, All, Play/Pause, one-second
  oldest→newest playback, manual pause, and reduced-motion static stepping.
- Month changes atomically swap the cosmos point set and the single
  rendered→full mapping, clear hover/detail/lasso, preserve dimension state,
  rebuild group layout over the active sample, and recount the active legend
  without changing category colors.
- `activityMotion` exposes its real controller tier/fps; the activity bridge now
  carries temporal, finite-position, ambient, and renderer evidence.

## Deviation

- The plan did not list `lodSample.ts`, but source inspection showed its region
  scan still traversed the full corpus. Its existing `viewportIndices` boundary
  gained an optional candidate set (plus one focused pin), which is the narrowest
  correction preventing zoom detail from resurrecting hidden-month events.

## Gates

- Focused Vitest: **4 files / 19 tests passed** (`activityTime`, `lodSample`,
  `activityMotion`, `activityColorBy`).
- `npx tsc --noEmit`: **passed** (exit 0, no output).
- `impeccable detect` on `ActivityUniverseShell.tsx`: **passed**, JSON `[]`.
- Commit: `f2c7bad8` (`feat(activity): add exact-month scrubber`).

## Follow-up

- Integrated timer, selectors, lasso, and real canvas behavior are deliberately
  owned by 41-02 Playwright; no durable debt introduced here.
