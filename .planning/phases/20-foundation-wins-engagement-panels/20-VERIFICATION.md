---
phase: 20-foundation-wins-engagement-panels
verified: 2026-07-03T16:22:05Z
status: passed
score: 5/5 must-haves verified (roadmap Success Criteria) + 4/4 requirements accounted for
behavior_unverified: 0
overrides_applied: 0
---

# Phase 20: Foundation Wins & Engagement Panels Verification Report

**Phase Goal:** Four new truthful panels live on `/access-analysis` (permission footprint by
role, dormant sign-in recency, issue fetch coverage, ingest freshness), per ROADMAP.md v2.3
Phase 20.
**Verified:** 2026-07-03T16:22:05Z
**Status:** passed
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths (ROADMAP.md Phase 20 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Permission-reach-by-role chart (folder count + human bytes) from `AccFolderPermissionSummary`, `totalBytes` BigInt→Number server-side, no live serialization error | VERIFIED | `lib/server/permissionFootprintView.ts:50` converts `Number(r.totalBytes)` at the loader boundary (never client-side). `formatBytes()` in `permissionFootprintCounts.ts` renders "42.3 GB"-style strings. Owner live-checkpoint (20-05-SUMMARY.md) confirmed "no BigInt serialization error observed, all 4 panels render correctly" on a real `:3100` dev-server load. |
| 2 | Compact ingest-freshness panel: latest `AccDcIngestRun` (started/ended/status/duration/projects), throughput from live `AccActivity` count by `ingestRunId`, never `rowsByModule`, static (no polling) | VERIFIED | `lib/server/ingestFreshnessView.ts` — `findFirst` select never includes `rowsByModule`; `db.accActivity.count({ where: { ingestRunId } })` sources live throughput; no TTL cache/timer, `Date.now()` captured once per mount in `IngestFreshnessPanel.tsx`. |
| 3 | Issue-fetch coverage donut, all 4 honest buckets (`ok`/`zero_issues`/`forbidden`/`error`), positioned so it precedes Model Coordination | VERIFIED | `issueFetchCoverageCounts.ts`'s `summarizeIssueCoverage` always emits all 4 `COVERAGE_BUCKETS` (zeros kept) plus an honest overflow bucket for unexpected statuses. `AccessAnalysisCharts.tsx:559-577` mounts `IssueFetchCoverageDonut` immediately above the Model Coordination `<Reveal>` block (line 578). |
| 4 | Dormant users bucketed by recency bands incl. explicit "Never signed in", verified against a real never-signed-in project | VERIFIED (documented deviation) | Roadmap names `AccProjectMember.lastSignIn`, live-verified 100% NULL/dead (pre-authorized Option B deviation, recorded in 20-02-PLAN.md/STATE.md). Implementation sources `AccDcUser.lastSignIn` via `AccDcProjectUser` join (`signInRecencyView.ts`). `signInRecencyCounts.test.ts` proves the Never bucket is lossless (`sum(band counts) === rows.length`) and null/unparseable dates always land there. Owner live-checkpoint walkthrough included the CDMX MELI PLATAH (276 never-signed-in) project scenario per 20-05-PLAN.md Task 3 steps; SUMMARY records general functional approval with no Never-bucket defect among the 7 feedback items. |
| 5 | All 4 panels render in zinc theme via `@/components/ui/EChart` with theme-resolved colors; `tsc --noEmit` passes; `Promise.all` fan-out reviewed/consolidated; load time spot-checked | VERIFIED | All 3 new chart components import `EChart` from `@/components/ui/EChart` and use `useTheme()`/`resolvedTheme`. `npx tsc --noEmit` run fresh during this verification: 0 errors. `mainCharts.tsx` fan-out confirmed at exactly 11 parallel `Promise.all` entries (was 8); ISSUE-01 rides the existing `loadCoordinationByProject` call per the 20-03 consolidation decision (no 12th entry). Load-time spot-check is an eyeball comparison per project convention (no formal perf harness) — recorded in 20-05-SUMMARY.md. |

**Score:** 5/5 roadmap Success Criteria verified.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PERM-01 | 20-01 | Permission reach by role, materialized summary, BigInt-safe | SATISFIED | `lib/server/permissionFootprintView.ts`, `permissionFootprintCounts.ts`, `PermissionFootprintChart.tsx` all present, tested, wired into `mainCharts.tsx`/`AccessAnalysisCharts.tsx`. |
| ENG-01 | 20-02 | Dormant users by sign-in recency w/ Never bucket | SATISFIED (documented Option B source deviation) | `lib/server/signInRecencyView.ts`, `signInRecencyCounts.ts`, `DormantSignInChart.tsx` present, tested, wired; DC-coverage caption present and sourced from the live `dcCoverage` prop (`lib/server/dcCoverageView.ts`), never hardcoded. |
| ISSUE-01 | 20-03 | Issue-fetch coverage donut, 4 honest buckets | SATISFIED | `coordinationByProjectView.ts`'s additive `issueCoverage` field, `issueFetchCoverageCounts.ts`, `IssueFetchCoverageDonut.tsx` present, tested, wired directly above Model Coordination. |
| PIPE-01 | 20-04 | Ingest freshness strip, live throughput, never `rowsByModule` | SATISFIED | `lib/server/ingestFreshnessView.ts`, `ingestFreshnessCounts.ts`, `IngestFreshnessPanel.tsx` present, tested, wired at page bottom with "Account-wide" caption. |

No orphaned requirements: `REQUIREMENTS.md` maps exactly these 4 IDs to Phase 20, matching all 5 plans' `requirements` frontmatter fields.

### Required Artifacts (all 5 plans' `must_haves.artifacts`)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lib/server/permissionFootprintView.ts` | loader + pure assembly, BigInt→Number | VERIFIED | 74 lines; exports `loadPermissionFootprint`, `assemblePermissionFootprint`, `PermissionFootprintRow`; `Number(r.totalBytes)` present. |
| `app/(dashboard)/access-analysis/permissionFootprintCounts.ts` | formatBytes + summarize | VERIFIED | 124 lines; exports `formatBytes`, `summarizePermissionFootprint`. |
| `app/(dashboard)/access-analysis/components/PermissionFootprintChart.tsx` | chart w/ role drill | VERIFIED | 176 lines (min 60); role→project drill, empty state, escaped tooltip HTML (fix commit `07751e31`). |
| `lib/server/signInRecencyView.ts` | loader + pure join | VERIFIED | 89 lines; exports `loadSignInRecency`, `assembleSignInRecency`, `SignInRecencyRow`; sources `AccDcUser.lastSignIn` via `AccDcProjectUser`, never `AccProjectMember`/`AccDcProjectUser.lastSignIn`. |
| `app/(dashboard)/access-analysis/signInRecencyCounts.ts` | bucketing + summarize | VERIFIED | 83 lines; exports `bucketSignInRecency`, `summarizeSignInRecency`, `RECENCY_BANDS` (5 bands, locked order). |
| `app/(dashboard)/access-analysis/components/DormantSignInChart.tsx` | chart + DC-coverage caption | VERIFIED | 157 lines (min 60); band drill, DC-coverage caption, empty state. |
| `lib/server/coordinationByProjectView.ts` | additive `issueCoverage` | VERIFIED | 111 lines; `issueCoverage` field present, additive, existing `CoordinationByProject.tsx` consumer fields unchanged. |
| `app/(dashboard)/access-analysis/issueFetchCoverageCounts.ts` | 4-bucket summarize | VERIFIED | 86 lines; exports `COVERAGE_BUCKETS`, `summarizeIssueCoverage`. |
| `app/(dashboard)/access-analysis/components/IssueFetchCoverageDonut.tsx` | donut w/ per-bucket drill | VERIFIED | 296 lines (min 60); all 4 buckets clickable, in-progress caption, empty states. |
| `lib/server/ingestFreshnessView.ts` | latest run + live count | VERIFIED | 44 lines; exports `loadIngestFreshness`, `IngestFreshness`; never selects `rowsByModule`. |
| `app/(dashboard)/access-analysis/ingestFreshnessCounts.ts` | staleness/tone/duration | VERIFIED | 65 lines; exports `ingestStaleness`, `statusTone`, `formatRunDuration`. |
| `app/(dashboard)/access-analysis/components/IngestFreshnessPanel.tsx` | muted strip | VERIFIED | 77 lines (min 40); stale badge, account-wide caption, null-safe empty line. |
| `app/(dashboard)/access-analysis/mainCharts.tsx` | 11-entry fan-out | VERIFIED | Confirmed 11 `Promise.all` entries incl. `loadPermissionFootprint`, `loadSignInRecency`, `loadIngestFreshness`. |
| `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` | 4 panels mounted at locked positions | VERIFIED | All 4 components imported and mounted at CONTEXT.md-locked insertion points (verified by line-number inspection, see Key Link table). |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `permissionFootprintView.ts` | `db.accFolderPermissionSummary` | `findMany` select | WIRED | Confirmed in source; never touches raw `AccFolderPermission`. |
| `signInRecencyView.ts` | `db.accDcProjectUser` + `db.accDcUser` | Map-join by userId | WIRED | Confirmed; no Prisma relation used, in-JS Map join per plan. |
| `coordinationByProjectView.ts` | `db.accIssueProjectFetchResult` | `findMany` scoped to latest run | WIRED | Confirmed, scoped via `where: { runId: run.id }`. |
| `ingestFreshnessView.ts` | `db.accActivity.count({ ingestRunId })` | live throughput | WIRED | Confirmed; `rowsByModule` never selected. |
| `mainCharts.tsx` | `permissionFootprintView.ts` / `signInRecencyView.ts` / `ingestFreshnessView.ts` | Promise.all entries 9-11 | WIRED | Confirmed 11-entry fan-out, all three imports present and awaited in parallel. |
| `AccessAnalysisCharts.tsx` | `filterRowsBySelection` | useMemo project-selection filtering | WIRED | 3 `useMemo`s confirmed for permission-footprint rows, sign-in-recency rows, and `coordinationData?.issueCoverage?.projects`; ingest freshness intentionally unfiltered. |
| `AccessAnalysisCharts.tsx` → `DormantSignInChart` | position | after "Role distribution" `<Reveal>` | WIRED | Confirmed at line 404-411, immediately after Role distribution block. |
| `AccessAnalysisCharts.tsx` → `PermissionFootprintChart` | position | full-width, after donut grid | WIRED | Confirmed at line 545-552. |
| `AccessAnalysisCharts.tsx` → `IssueFetchCoverageDonut` | position | directly above Model Coordination | WIRED | Confirmed at line 559-577; Model Coordination block starts line 578. |
| `AccessAnalysisCharts.tsx` → `IngestFreshnessPanel` | position | very bottom, before drawers | WIRED | Confirmed at line 599, before `profileEmail` drawer block (line 601). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `PermissionFootprintChart` | `rows` (via `filteredPermissionFootprintRows`) | `loadPermissionFootprint()` → `db.accFolderPermissionSummary.findMany` | Yes (22,082-row materialized table) | FLOWING |
| `DormantSignInChart` | `rows` (via `filteredSignInRecencyRows`) | `loadSignInRecency()` → `db.accDcProjectUser`/`db.accDcUser` | Yes (22,835 project-user rows) | FLOWING |
| `IssueFetchCoverageDonut` | `coordinationData?.issueCoverage?.projects` | `loadCoordinationByProject()` → `db.accIssueProjectFetchResult.findMany` | Yes (scoped to latest run, up to ~1,152 rows) | FLOWING |
| `IngestFreshnessPanel` | `freshness` | `loadIngestFreshness()` → `db.accDcIngestRun.findFirst` + `db.accActivity.count` | Yes (live count, not `rowsByModule`) | FLOWING |
| `DormantSignInChart` | `dcCoverage` prop | `loadDcCoverage()` (pre-existing loader) → `db.accDcProject.count`/`db.accProject.count` | Yes, live counts, never hardcoded | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| `npx tsc --noEmit` (repo-wide) | `npx tsc --noEmit` | 0 errors | PASS |
| All 14 Phase-20-touched test files | `npx vitest run <14 files>` | 116/116 tests passed | PASS |
| Repo-map boundary check | `node scripts/repo-map/check.cjs` | "Repo-map quality gate passed" (2 pre-existing dependency-cruiser warnings, 278 ast-grep findings against baseline, no new blocking rules) | PASS |
| Never-bucket lossless invariant | `signInRecencyCounts.test.ts` "never drops a row — total of band counts === rows.length" | passed (part of the 116) | PASS |
| Requirements-to-phase mapping | `grep "Phase 20" REQUIREMENTS.md` | exactly ISSUE-01/PERM-01/ENG-01/PIPE-01, all "Complete", no orphans | PASS |
| Debt-marker scan | `grep -rn "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across all 14 new/modified source files | 0 matches | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention applies to this phase (not a migration/tooling phase); no probes declared in PLAN/SUMMARY files. Skipped — no runnable probes for this phase's scope.

### Anti-Patterns Found

None found in the 14 phase-20-created/modified source files (permission footprint, sign-in recency, issue coverage, ingest freshness loaders/transforms/components, plus `mainCharts.tsx`/`AccessAnalysisCharts.tsx`). One legitimate security-hardening fix was found in git history (`07751e31`, escaping ACC role names before HTML tooltip interpolation in `PermissionFootprintChart.tsx`) — this is a quality improvement, not a gap.

### Scope / Guardrail Checks

- **`/users/spatial-graph`:** untouched. `git show --name-only` on all 6 phase-20 code commits (`ccfb07d6`, `c2ed73b7`, `a966c610`, `3851be38`, `185d73d2`, `6c99d170`) plus the client-component commits (`291c4250`, `4ceed646`, `de4a0bf1`, `504d5095`, `bb664612`, `62308f5e`, `550d66a1`, `1feb22f2`, `07751e31`) shows zero files under `app/(dashboard)/users/spatial-graph/`.
- **No new WebGL:** grep for `WebGL`/`@react-three`/`from "three"` across all 4 new chart components returns 0 matches; all use `@/components/ui/EChart`.
- **Zinc theme + resolved ECharts colors:** all 3 new chart components import `useTheme`/`resolvedTheme` from `next-themes` and the canonical `@/components/ui/EChart`, not the legacy route-local wrapper.
- **BigInt server-side conversion:** confirmed at `permissionFootprintView.ts:50` (`Number(r.totalBytes)`); no BigInt literals (`0n`/`123n`) in any new file (the one BigInt-literal TS2737 issue from wave-1 test fixtures was fixed via `BigInt()` constructor per commit `f9736a4a`, and repo-wide `tsc --noEmit` is clean now).
- **Prisma source truthfulness:** `AccFolderPermissionSummary` (never raw `AccFolderPermission`); `AccDcUser.lastSignIn` via `AccDcProjectUser` (never dead `AccProjectMember.lastSignIn`/`AccDcProjectUser.lastSignIn`, deviation documented and pre-authorized); `AccIssueProjectFetchResult` scoped to latest `AccIssueFetchRun`; live `AccActivity.count` (never `rowsByModule`) — all confirmed by direct source read.
- **Under-covered data labeled:** DC-coverage caption present in `DormantSignInChart.tsx` sourced from live `dcCoverage` prop; "Account-wide" caption present in `IngestFreshnessPanel.tsx`.
- **Empty/error/loading states:** confirmed present in all 4 new chart/panel components (verified by direct grep of each).
- **Wave-1 staging-index race (deferred-items.md):** independently re-verified — file CONTENT on disk for every phase-20 path matches its plan's contract regardless of which commit's message names it (e.g. `c2ed73b7` carries both 20-02's and 20-04's task-1 files per the documented race; both files' content read correctly and match their respective plans). No content loss confirmed.
- **Owner UAT verdict (20-05 checkpoint):** functional approval ("Is good but") with 7 verbatim change-request items; item 1 (project-picker raw-GUID leak) fixed in-phase (commit `6c99d170`, independently verified in `coordinationByProjectView.ts`); items 2-7 are new product scope explicitly routed to a follow-up phase — not counted as Phase 20 gaps, per task instructions.
- **Known pre-existing full-suite failure:** `UsersDirectoryClient.integration.test.tsx` (12 failures) is a pre-existing, unrelated test-isolation issue (confirmed by SUMMARY/deferred-items.md; zero file overlap with Phase 20 changes) — not a Phase 20 regression, not re-litigated here.

### Human Verification Required

None. The mandatory live-page checkpoint (Task 3 of 20-05-PLAN.md) was already executed with the owner during phase execution and recorded as functionally approved in 20-05-SUMMARY.md, satisfying the roadmap's "verified by an actual live page load" requirement for SC#1 and the "verified against at least one real project" requirement for SC#4. No further human verification items are outstanding for this phase's 4 requirements.

### Gaps Summary

No gaps found. All 5 roadmap Success Criteria for Phase 20 are verified against live source code (not SUMMARY narrative alone): loaders convert BigInt server-side, never read `rowsByModule` or the dead `AccProjectMember.lastSignIn` field, the issue-coverage donut enforces 4 honest buckets via a pure transform, all 4 panels are mounted at their CONTEXT.md-locked positions in `AccessAnalysisCharts.tsx`, the `mainCharts.tsx` fan-out is exactly 11 parallel entries, `npx tsc --noEmit` is clean, all 14 phase-relevant test files pass (116/116), repo-map boundary check is clean, `/users/spatial-graph` is untouched, and no new WebGL was introduced. The ENG-01 source-field deviation (`AccDcUser.lastSignIn` via `AccDcProjectUser` instead of the roadmap-named dead `AccProjectMember.lastSignIn`) is a pre-authorized, well-documented Option B deviation that preserves the criterion's intent (a real, non-degenerate dormant-user distribution with an honest Never bucket) — this is not a gap. The 6 non-item-1 owner UAT feedback items are new product scope for a follow-up phase per explicit task instructions, not Phase 20 gaps.

---

## Dashboard Self-Check

- **Context:** Loaded `.planning/STATE.md`, `.planning/ROADMAP.md` (Phase 20 section), `.planning/REQUIREMENTS.md`, all 5 `20-0N-PLAN.md` frontmatters, `20-05-SUMMARY.md`, and `deferred-items.md`. No missing/stale artifacts.
- **Evidence:** All paths, exports, Prisma models/fields, and commands in this report were verified directly from repo source (`lib/server/*.ts`, `app/(dashboard)/access-analysis/**`), `git show`/`git log`, `npx tsc --noEmit`, `npx vitest run`, and `node scripts/repo-map/check.cjs` — not from SUMMARY narrative alone.
- **Constraints:** Zinc theme + resolved ECharts colors confirmed; no new WebGL confirmed; `/users/spatial-graph` untouched confirmed; Prisma DB truthfulness (materialized summary, live counts, honest fallbacks) confirmed; under-covered sources labeled (DC-coverage, account-wide captions) confirmed.
- **Gates:** `npx tsc --noEmit` (0 errors), targeted + full-relevant Vitest suite (14 files / 116 tests, all green), `node scripts/repo-map/check.cjs` (clean) all re-run fresh during this verification pass, not taken from SUMMARY claims.
- **VERIFY:** none outstanding for this phase's 4 requirements.

---

*Verified: 2026-07-03T16:22:05Z*
*Verifier: Claude (gsd-verifier)*
