---
phase: 20
slug: foundation-wins-engagement-panels
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-02
updated: 2026-07-03
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (verified `vitest.config.ts`: `environment: 'node'`, `globals: true`, `setupFiles: ['./vitest.setup.ts']`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run <single test path>` (quote paths containing `(dashboard)`) |
| **Full suite command** | `npm test` (= `vitest run --exclude "**/tests/e2e/**"`) |
| **Estimated runtime** | single file ~5-15 s; full suite ~2-4 min |

---

## Sampling Rate

- **After every task commit:** Run the task's single-file `npx vitest run <path>` from the map below
- **After every plan wave:** Run `npm test` (full suite; TEST-01/02/03 characterization pins must stay green and their files byte-untouched)
- **Before `/gsd:verify-work`:** Full suite green + the 3 manual/smoke steps (BigInt live load, Never-bucket live check, load-time spot-check)
- **Max feedback latency:** ~240 s (full suite)

---

## Per-Task Verification Map

Note: test files are CREATED WITHIN their tasks (test + implementation land together per
task — no separate Wave 0 plan; every task has an automated verify from its own new test).

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | PERM-01 | unit | `npx vitest run lib/server/permissionFootprintView.test.ts` | ❌ created in-task | ⬜ pending |
| 20-01-02 | 01 | 1 | PERM-01 | unit | `npx vitest run "app/(dashboard)/access-analysis/__tests__/permissionFootprintCounts.test.ts"` | ❌ created in-task | ⬜ pending |
| 20-01-03 | 01 | 1 | PERM-01 | component | `npx vitest run "app/(dashboard)/access-analysis/__tests__/PermissionFootprintChart.test.tsx"` | ❌ created in-task | ⬜ pending |
| 20-02-01 | 02 | 1 | ENG-01 | unit | `npx vitest run lib/server/signInRecencyView.test.ts` | ❌ created in-task | ⬜ pending |
| 20-02-02 | 02 | 1 | ENG-01 | unit | `npx vitest run "app/(dashboard)/access-analysis/__tests__/signInRecencyCounts.test.ts"` | ❌ created in-task | ⬜ pending |
| 20-02-03 | 02 | 1 | ENG-01 | component | `npx vitest run "app/(dashboard)/access-analysis/__tests__/DormantSignInChart.test.tsx"` | ❌ created in-task | ⬜ pending |
| 20-03-01 | 03 | 1 | ISSUE-01 | unit | `npx vitest run lib/server/coordinationByProjectView.test.ts "app/(dashboard)/access-analysis/__tests__/CoordinationByProject.test.tsx"` | ✅ extends existing | ⬜ pending |
| 20-03-02 | 03 | 1 | ISSUE-01 | unit | `npx vitest run "app/(dashboard)/access-analysis/__tests__/issueFetchCoverageCounts.test.ts"` | ❌ created in-task | ⬜ pending |
| 20-03-03 | 03 | 1 | ISSUE-01 | component | `npx vitest run "app/(dashboard)/access-analysis/__tests__/IssueFetchCoverageDonut.test.tsx"` | ❌ created in-task | ⬜ pending |
| 20-04-01 | 04 | 1 | PIPE-01 | unit | `npx vitest run lib/server/ingestFreshnessView.test.ts` | ❌ created in-task | ⬜ pending |
| 20-04-02 | 04 | 1 | PIPE-01 | unit | `npx vitest run "app/(dashboard)/access-analysis/__tests__/ingestFreshnessCounts.test.ts"` | ❌ created in-task | ⬜ pending |
| 20-04-03 | 04 | 1 | PIPE-01 | component | `npx vitest run "app/(dashboard)/access-analysis/__tests__/IngestFreshnessPanel.test.tsx"` | ❌ created in-task | ⬜ pending |
| 20-05-01 | 05 | 2 | all 4 | component + typecheck | `npx vitest run "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx" && npx tsc --noEmit` | ✅ extends existing | ⬜ pending |
| 20-05-02 | 05 | 2 | all 4 | full gates | `npx tsc --noEmit && npm test` (+ `node scripts/repo-map/check.cjs`) | ✅ existing suite | ⬜ pending |
| 20-05-03 | 05 | 2 | all 4 | checkpoint:human-verify | manual — see Manual-Only Verifications | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — Vitest is fully wired
(`vitest.config.ts`, `vitest.setup.ts`, `npm test`); no framework install, no shared
fixtures needed. Each new test file is created inside the task that creates the code it
pins, so no standalone Wave 0 plan exists.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No BigInt serialization error on live render | PERM-01 (roadmap SC#1) | RSC→client serialization failure is runtime-only; `tsc --noEmit` cannot catch it (roadmap explicitly notes this) | Plan 20-05 Task 3: `npx next dev --turbopack -p 3100`, load `/access-analysis`, watch dev-server terminal for "serialize a BigInt" |
| Never-signed-in bucket populated on a real project | ENG-01 (roadmap SC#4) | Requires live DB data + visual confirmation of the muted bar + drill | Plan 20-05 Task 3: select project `de245cf4-30a9-422c-ad74-6f8c886605ef` (CDMX MELI PLATAH, 276 never-signed-in members), confirm bar + drill rows show "Never" |
| Load-time spot-check before/after +3 loaders | all 4 (roadmap SC#5) | No perf harness exists for this page; milestone practice is dev-server eyeball comparison | Plan 20-05 Task 3 step 6: compare page-load feel pre/post; executor confirms fan-out stays parallel in code |
| Panel placement / zinc theme / demo coherence | all 4 | Visual taste + workshop-narrative judgment | Plan 20-05 Task 3 steps 2, 4, 5, 6 (owner checkpoint) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (every auto task creates + runs its own test file)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (only 20-05-03, the final checkpoint, is manual)
- [x] Wave 0 covers all MISSING references (none — tests created in-task; framework pre-existing)
- [x] No watch-mode flags (`vitest run` everywhere)
- [x] Feedback latency < 240 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-03 (planner)
