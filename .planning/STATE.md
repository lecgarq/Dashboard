---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: "Access Analysis: Hub Story & Scenario Explorer"
status: ready-to-plan
current_phase: 8
current_phase_name: Activity Re-Extraction (free ACCDS crawler)
stopped_at: "Phase 8 context gathered (08-CONTEXT.md). Decisions: ACCDS session-cookie crawler only (no DC quota); max history; spike full ACC membership before any admin grant (the 428 ceiling is inherited, not a session limit); 2-legged folder crawl for the treemap; report-not-block currency. Run /gsd:plan-phase 8 (Phase 9 still parallel-safe)."
last_updated: "2026-06-22"
last_activity: 2026-06-22
last_activity_desc: "Phase 8 discuss-phase complete — 08-CONTEXT.md written. Centerpiece decision: a session-endpoint spike (accds/v0 on member-only projects) may unlock coverage beyond the 428 admin set with no permission change."
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-22)

**Core value:** A stakeholder can read the situation of the hub at `/access-analysis` as a guided story, then pivot the extracted data across any dimension pair live — fast, clickable, and factually honest.
**Current focus:** Milestone v3.0 (Access Analysis: Hub Story & Scenario Explorer) — roadmap complete, ready to plan Phase 8.

## Current Position

Phase: 8 — DC Re-Extraction (not yet started)
Plan: —
Status: Ready to plan
Last activity: 2026-06-22 — Roadmap written (Phases 8–14, 27/27 requirements mapped)

Progress: [░░░░░░░░░░] 0%

**Execution order:** {8 ‖ 9} → 10 → 11 → {12 ‖ 13} → 14

Phase 8 is the hard data gate for Phases 12–14. Do not proceed to those phases until Phase 8 verification passes (428 projects backfilled, zero Unmapped actions).

## Performance Metrics

**Velocity (v2.0 reference):**

- Total plans completed: 30 (33 with gap-closure)
- Phase 1 executed in 3 parallel waves (wall-clock ~16m end-to-end)

**By Phase (v2.0):**

| Phase | Plans | Notes |
|-------|-------|-------|
| 01    | 6/6   | 3 waves, parallel executors; 48 tests, tsc 0 |
| 02    | 6/6   | Zustand store + decomposition; 2015 baseline tests held |
| 03    | 2/2   | DataTable primitive |
| 04    | 4/4+3 | /users table + polish + gap-closure |
| 05    | 5/5   | /access-analysis depth + cross-filter |
| 06    | 5/5   | /template-mty + /forma-proposal polish |
| 07    | 2/2   | Pre-workshop UAT; 38-test Playwright harness |

**v3.0 velocity:** TBD — phases begin 2026-06-22

*Updated after each plan completion*

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
- [Phase ?]: Timeline slice-narrowing via sliceFilteredProjectIds; moduleSummary stays picker-only; people sheet from in-memory summaries
- [Phase ?]: Suspense boundary wraps full data tier; mainCharts.tsx non-page RSC extraction
- [Phase ?]: TerrainReveal lazy-load via loadOverview on expand
- [Phase ?]: KPI no-reanimate guard via useRef
- [Phase ?]: Raise the token, not the threshold: light cSub/cAxis nudged to zinc-600 (#52525b, ~7.0:1) rather than loosening the 4.5 WCAG AA floor [Phase 05-05]
- [Phase ?]: chart polish
- [Phase ?]: FRM-01: HierarchyView deferred via dynamic(ssr:false) with HierarchyViewSkeleton fallback + idle prefetch
- [Phase ?]: FRM-02: FormaParticleAccent frameloop=demand / opacity 0.18 behind editor at z-0; PremiumSurface on outer containers only; folder rows + tier chips stay flat
- [Phase ?]: 06-05
- [Phase ?]: 06-05
- [Phase ?]: 06-05
- [Phase ?]: Boundary diff gate checks Phase 7 commits only (HEAD~0..HEAD~2) not full branch vs origin/deploy
- [Phase ?]: axe-core 4.10.0 CDN injection for WCAG AA contrast in Playwright — no new npm package, pinned to avoid supply drift
- [Phase ?]: UAT gate wrapper exits 0 on BLOCKED (no server on :3100) — static-only mode valid intermediate state for CI/owner split between plans 07-01 and 07-02
- [v3.0 Roadmap]: Phase 8 (DC Re-Extraction) and Phase 9 (Structural Prerequisites) are parallel-safe — no shared files, no data dependency.
- [v3.0 Roadmap]: Phase 8 is a hard gate for Phases 12–14 (activity/folder/Sankey views are meaningless without current data).
- [v3.0 Roadmap]: Phase 10 (Sectioned Hub Narrative) must precede Phases 11–14 so new panels land in correct section slots from day one.
- [v3.0 Roadmap]: Phases 12 and 13 are parallel-safe (separate files; no shared state between activity-depth and folder-reach agents).
- [v3.0 Roadmap]: Pivot aggregation is server-side only via scenarioActions.ts server action — NOT a new tRPC procedure.
- [v3.0 CORRECTION — owner]: Phase 8 uses the FREE ACCDS web-session crawler (scripts/accds-activity-ingest.cjs + scripts/accds-login.cjs → AccActivityAccds), NOT the DC quota path. Session-cookie auth (scratch/acc-session.json, gitignored); resume via ACCDS_RESUME=1; re-login on SessionExpiredError; no ~25/day quota, no DC_403_BISECT, no APS refresh-token rotation. DC AccActivity refresh is optional/secondary. OPEN (decide at Phase 11/12 plan): new activity views source AccActivityAccds (fresh, folder/object-level, trailing window) vs AccActivity (DC CSV, comprehensive, quota-bound) — a data-authority call.
- [v3.0 Roadmap]: ECharts calendar/visualMap/treemap/chord/sankey arc colors are caller-owned and must be wired manually using ECHARTS_DARK/ECHARTS_LIGHT palette pattern.
- [v3.0 Roadmap]: AccDcRole is permanently empty — role names must always come from AccRole via mergeRoleNames().
- [v3.0 Roadmap]: All AccFolderPermission queries require GROUP BY + LIMIT at the query level (OOM prevention; v2.0 incident: 5M rows, 77s).
- [v3.0 Roadmap]: ACTD-03 (hottest files) is conditional on AccActivityAccds row count > 0 after Phase 8; FOLD-04 (treemap) is conditional on AccFolder.totalSizeBytes IS NOT NULL after Phase 8.

### Pending Todos

- [Phase 4/7 UAT] Verify `prefers-reduced-motion` at runtime via DevTools Rendering → "Emulate prefers-reduced-motion: reduce" once a page wires the motion facade. Code-level enforcement (`useSafeVariants`) is proven by 15/15 unit tests; only the live browser media-query path is unverified. (Carried forward from 01-VERIFICATION.md human_needed item, approved 2026-06-17.)
- [v3.0 Phase 8] Run `SELECT COUNT(*) FROM "AccActivityAccds"` after re-extraction to gate ACTD-03 (hottest files panel)
- [v3.0 Phase 8] Run `SELECT COUNT(*) FILTER (WHERE "totalSizeBytes" IS NOT NULL) FROM "AccFolder"` after Phase 8 to gate FOLD-04 (storage treemap)
- [v3.0 Phase 12] Run `SELECT COUNT(*) FILTER (WHERE "userEmail" IS NULL), COUNT(*) FROM "AccActivity"` to verify exact attribution-gap percentage for ACTD-04

### Blockers/Concerns

- [Constraint] `next build` typechecks the whole tree incl. test files — `npx tsc --noEmit` is the mandatory last step before any rebuild; prop-shape changes must update test fixtures in the same commit.
- [Constraint] No new WebGL on data surfaces (GPU < 400MB); R3F accents confined to `/users` header and `/forma-proposal` background only.
- [Constraint] New analytics strictly derivable from the existing Prisma DB; `AccActivity` covers only 428/1,152 projects — label under-covered sources in the UI.
- [Boundary] `/users/spatial-graph` is strictly out of scope; verify `git diff --name-only` touches zero files under `users/access-analysis/`.
- [Toolchain] Per-phase research uses `.tools/repo-map/` (`npm run repo-map` then consult dep graph / ast-grep reports; `repo-map:check` ratchets against re-introduced fetches/effects).
- [v3.0 Risk] AccFolderPermission OOM: any pivot or folder query without GROUP BY + LIMIT will OOM (v2.0 incident: 5M rows). Enforce at query level, not as a backstop.
- [v3.0 Risk] APS refresh-token rotation: single-use tokens must be persisted atomically to DB on every rotation or the live dashboard login breaks. Recovery: `node scripts/aps-login.cjs`.
- [v3.0 Risk] Sankey/chord cardinality: ACC has 77 roles, 428 projects, ~3,367 users. Server-side caps mandatory: ≤50 nodes / ≤200 links for Sankey; enforce with adversarial unit test.
- [v3.0 Risk] Coverage-honesty omissions: every activity-derived panel must show "428 of 1,152 projects" inline (not in a tooltip); verify with `rg -i "risk|danger|critical|exposed|suspicious"` after each phase.
- [v3.0 VERIFY] `ChordSeriesOption` export from `echarts` at runtime — deferred to v3.1 (C6); verify before planning chord series.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Forma Proposal | FRM-V2-01 role-permission diff view (needs new `template.getBaseline(roleId)` query) | Deferred to v3.1+ | 2026-06-17 |
| Access Analysis | ACC-V2-01 project-grouped persistent accordion in picker | Deferred to v3.1+ | 2026-06-17 |
| Analytics | NA-V2-01 additional new analytics beyond the gated per-page set | Deferred to v3.1+ | 2026-06-17 |
| /users freshness | /users data requires manual browser refresh to show latest data — pre-existing refetchOnWindowFocus:false + staleTime in lib/core/providers.tsx | Deferred to v3.1+ | 2026-06-18 |
| Interconnections | LINK-V2-01 Chord/co-occurrence matrix — high complexity; needs ChordSeriesOption API verification | Deferred to v3.1 | 2026-06-22 |
| Scenario Explorer | SCEN-V2-01 User-persisted custom presets + export/download | Deferred to v3.1 | 2026-06-22 |
| Scenario Explorer | SCEN-V2-02 Date-range filter UI on the explorer | Deferred to v3.1 | 2026-06-22 |

## Session Continuity

Last session: 2026-06-22 — Phase 8 context gathered (discuss-phase)
Stopped at: 08-CONTEXT.md written. Method locked to the free ACCDS session crawler; Plan task 1 = spike full membership + test accds/v0 on member-only projects before any admin grant. Folder crawl (2-legged APS) approved for treemap data. Currency = report, don't block.
Resume file: .planning/phases/08-activity-re-extraction/08-CONTEXT.md
