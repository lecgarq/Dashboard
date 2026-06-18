---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 2
current_phase_name: /users Decomposition
status: verifying
stopped_at: Completed 04-02 (UserProfilePanel person chrome — 10 tests green; tsc 0)
last_updated: "2026-06-18T23:14:24.148Z"
last_activity: 2026-06-18
last_activity_desc: "02-06: ActivityAuditPanel + DirectoryFilterBar extraction; 314-line shell; projector sign-off"
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 23
  completed_plans: 22
  percent: 57
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-17)

**Core value:** When these 4 pages are presented in a workshop, the data makes people lean in — fast, tactile, visually premium, and explorable live.
**Current focus:** Phase 2 — /users Decomposition

## Current Position

Phase: 2 of 7 (/users Decomposition)
Plan: 6 of 6 in current phase (Phase 2 complete)
Status: Phase complete — ready for verification
Last activity: 2026-06-18 — 02-06: ActivityAuditPanel + DirectoryFilterBar extraction; 314-line shell; projector sign-off

Progress: [██████░░░░] 58%

## Performance Metrics

**Velocity:**

- Total plans completed: 6
- Phase 1 executed in 3 parallel waves (wall-clock ~16m end-to-end)

**By Phase:**

| Phase | Plans | Notes |
|-------|-------|-------|
| 01    | 6/6   | 3 waves, parallel executors; 48 tests, tsc 0 |

**Recent Trend:**

- Phase 1: 01-01..01-06 all complete; verification human_needed → approved
- Trend: foundation primitives shipped

*Updated after each plan completion*
| Phase 02-users-decomposition P02 | 11 | 3 tasks | 6 files |
| Phase 02 P03 | 372 | 3 tasks | 3 files |
| Phase 02-users-decomposition P04 | 7 | 3 tasks | 4 files |
| Phase 02-users-decomposition P05 | 420 | 3 tasks | 4 files |
| Phase 03 P01 | 9min | 2 tasks | 3 files |
| Phase 03-datatable-primitive P02 | 4min | 3 tasks | 2 files |
| Phase 04-users-table-polish P02 | 2min | 2 tasks | 2 files |
| Phase 04 P03 | 15min | 3 tasks | 6 files |
| Phase 04-users-table-polish P04 | 9min | 3 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Foundation-first build order is strict — every per-page phase imports Phase 1 (tokens, PremiumSurface, EChart, motion facade, Sheet).
- [Roadmap]: `/users` decomposition (Phase 2) + DataTable (Phase 3) both precede the `/users` table redesign (Phase 4).
- [Roadmap]: Phases 4, 5, 6 are parallel-safe after the foundation; Phase 7 (projector UAT) is the only valid acceptance test.
- [Roadmap]: NA-01 (analytics feasibility gate) lives in Phase 5 where new analytics are introduced; THM-01 (light/dark + projector contrast) is verified on the densest data surface (Phase 5).
- [Phase 01]: framer-motion bumped to 12.40.0 (VIS-06; React 19 reorder layout-animation fix).
- [Phase 01]: EChart `axisLabel.color` uses `palette.axis` (split-line color), matching existing chart conventions.
- [Phase 01]: `mergeEChartsTheme` always injects default xAxis/yAxis objects even when the caller omits them.
- [Phase 01]: `w-[480px] sm:w-[480px]` on SheetContent overrides shadcn `sm:max-w-sm` for consistent ~480px drill-panel width.
- [Phase 02-01]: zustand 5.0.14 installed as a dependency (not devDep) — store is shipped app code.
- [Phase 02-01]: Baseline test count = 2015 (2012 pass + 1 skip + 2 pre-existing FolderPermissionTerrain failures from concurrent WIP). Every extraction plan must hold or exceed this.
- [Phase 02-01]: vi.hoisted() required for bulkUsersQuerySpy to survive vi.mock hoisting; HTMLElement.prototype.scrollIntoView + window.scrollTo stubbed for Radix Select + jsdom compatibility.
- [Phase 02-06]: DirectoryFilterBar reads from useUsersDirectoryStore directly — no prop drilling of 12+ option lists/setters into the extracted component.
- [Phase 02-06]: useDirectoryRows custom hook extracts filtering/sorting/grouping/windowing memos so the shell stays under the 320-line ceiling.
- [Phase 02-06 → Phase 4 DEFERRED]: /users auto-refresh / data freshness — pre-existing refetchOnWindowFocus:false + 5-10min staleTime in lib/core/providers.tsx; not a Phase 2 regression; deferred to Phase 4 (/users freshness/polish).
- [Phase ?]: OrgPerson/LocalDirectoryUser re-exported from useMergedAccUsers via directoryUtils to avoid a second source of truth
- [Phase ?]: PersonDetailModal stays a centered shadcn Dialog — Sheet migration deferred to Phase 4 (RESEARCH Open Q1)
- [Phase ?]: setMounted scroll-init hack preserved verbatim in PersonRowList.tsx (RESEARCH Pitfall 3) - transitive import pattern via PersonRowList
- [Phase ?]: BULK_USERS_LEAN_INPUT exported at module scope; imported by both hook and prefetch — structural PERF-03 fix by referential-identity sharing
- [Phase ?]: ColumnDef<MockRow, string>[] (explicit value-type param) required with createColumnHelper — TanStack Table v8 strict generics
- [Phase ?]: @ts-expect-error on RED-step component imports keeps tsc exit 0 while preserving runtime RED failure
- [Phase ?]: Plan 02 must implement data-expand/data-cell/data-density/data-clear-filters attributes as test selector surface
- [Phase ?]: AnimatePresence inside conditional: framer-motion exit async in jsdom; React must control DOM presence
- [Phase ?]: Cross-wave @ts-expect-error removal: TS2307 suppression becomes TS2578 once DataTable.tsx exists; must remove in same commit
- [Phase ?]: [Phase 04-02]: UserProfilePanel.tsx gains optional person?: OrgPerson prop; dialog variant renders person chrome (banner avatar, name, title, badge tags, contact rows) when supplied; rail ignores it; PersonAvatar imported from PersonDetailModal to avoid duplication

### Pending Todos

- [Phase 4/7 UAT] Verify `prefers-reduced-motion` at runtime via DevTools Rendering → "Emulate prefers-reduced-motion: reduce" once a page wires the motion facade. Code-level enforcement (`useSafeVariants`) is proven by 15/15 unit tests; only the live browser media-query path is unverified. (Carried forward from 01-VERIFICATION.md human_needed item, approved 2026-06-17.)

### Blockers/Concerns

- [Constraint] `next build` typechecks the whole tree incl. test files — `npx tsc --noEmit` is the mandatory last step before any rebuild; prop-shape changes must update test fixtures in the same commit.
- [Constraint] No new WebGL on data surfaces (GPU < 400MB); R3F accents confined to `/users` header and `/forma-proposal` background only.
- [Constraint] New analytics strictly derivable from the existing Prisma DB; `AccActivity` covers only 428/1,152 projects — label under-covered sources in the UI.
- [Boundary] `/users/spatial-graph` is strictly out of scope; verify `git diff --name-only` touches zero files under `users/access-analysis/`.
- [Toolchain] Per-phase research uses `.tools/repo-map/` (`npm run repo-map` then consult dep graph / ast-grep reports; `repo-map:check` ratchets against re-introduced fetches/effects).

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Forma Proposal | FRM-V2-01 role-permission diff view (needs new `template.getBaseline(roleId)` query) | Deferred to v2 | 2026-06-17 |
| Access Analysis | ACC-V2-01 project-grouped persistent accordion in picker | Deferred to v2 | 2026-06-17 |
| Analytics | NA-V2-01 additional new analytics beyond the gated per-page set | Deferred to v2 | 2026-06-17 |
| /users freshness | /users data requires manual browser refresh to show latest data — pre-existing refetchOnWindowFocus:false + staleTime in lib/core/providers.tsx; confirmed NOT a Phase 2 regression | Deferred to Phase 4 | 2026-06-18 |

## Session Continuity

Last session: 2026-06-18T23:14:24.141Z
Stopped at: Completed 04-02 (UserProfilePanel person chrome — 10 tests green; tsc 0)
Resume file: None
