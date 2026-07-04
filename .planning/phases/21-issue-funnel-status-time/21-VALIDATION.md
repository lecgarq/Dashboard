---
phase: 21
slug: issue-funnel-status-time
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-04
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.6 (config `vitest.config.ts`, setup `vitest.setup.ts`) |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `npx vitest run lib/server/issueFunnelView.test.ts "app/(dashboard)/access-analysis/__tests__/issueFunnelCounts.test.ts"` |
| **Full suite command** | `npm test` (baseline 2392 passed / 1 skipped, STATE.md Phase 20.1 close) |
| **Estimated runtime** | quick ~10s · full ~120s |

---

## Sampling Rate

- **After every task commit:** run that task's `<automated>` command + `npx tsc --noEmit`
- **After every plan wave:** `npm test` (full suite)
- **Before `/gsd:verify-work`:** full suite green + `npx tsc --noEmit` exit 0
- **Max feedback latency:** ~120 seconds (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | ISSUE-02, ISSUE-03 | unit (mock-db, aggregate-bound) | `npx vitest run lib/server/issueFunnelView.test.ts` | ❌ created in-task | ⬜ pending |
| 21-01-02 | 01 | 1 | ISSUE-02, ISSUE-03 | typecheck | `npx tsc --noEmit` | n/a | ⬜ pending |
| 21-02-01 | 02 | 1 | ISSUE-03 | typecheck | `npx tsc --noEmit` | n/a | ⬜ pending |
| 21-02-02 | 02 | 1 | ISSUE-03 | unit (pure transform) | `npx vitest run "app/(dashboard)/access-analysis/__tests__/issueFunnelCounts.test.ts"` | ❌ created in-task | ⬜ pending |
| 21-03-01 | 03 | 2 | ISSUE-02 | component (jsdom) | `npx vitest run "app/(dashboard)/access-analysis/__tests__/IssueTimelineChart.test.tsx"` | ❌ created in-task | ⬜ pending |
| 21-03-02 | 03 | 2 | ISSUE-03 | component (jsdom) | `npx vitest run "app/(dashboard)/access-analysis/__tests__/IssueStatusChart.test.tsx"` | ❌ created in-task | ⬜ pending |
| 21-04-01 | 04 | 3 | ISSUE-02, ISSUE-03 | typecheck | `npx tsc --noEmit` | n/a | ⬜ pending |
| 21-04-02 | 04 | 3 | ISSUE-02, ISSUE-03 | component (shell lazy fetch-once pin) | `npx vitest run "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx" && npx tsc --noEmit` | ✅ exists (case added in-task) | ⬜ pending |
| 21-04-03 | 04 | 3 | ISSUE-02, ISSUE-03 | full suite + typecheck | `npx tsc --noEmit && npm test` | n/a | ⬜ pending |
| 21-04-04 | 04 | 3 | ISSUE-02, ISSUE-03 | checkpoint:human-verify (live Projects tab) | manual — see plan | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Note: the reused timeline transform (`summarizeActivityTimeline`) already has a dedicated
test at `app/(dashboard)/access-analysis/__tests__/timelineCounts.test.ts` (verified to
exist this session) — no duplicate transform test is required (RESEARCH Wave-0 VERIFY
resolved).

---

## Wave 0 Requirements

No standalone Wave 0 — every new test file is created inside the same task as (or the same
plan wave as) the code it verifies, following this repo's co-located/`__tests__` convention:

- [ ] `lib/server/issueFunnelView.test.ts` — created in task 21-01-01 (the roadmap-mandated aggregate-bound test)
- [ ] `app/(dashboard)/access-analysis/__tests__/issueFunnelCounts.test.ts` — created in task 21-02-02
- [ ] `app/(dashboard)/access-analysis/__tests__/IssueTimelineChart.test.tsx` — created in task 21-03-01
- [ ] `app/(dashboard)/access-analysis/__tests__/IssueStatusChart.test.tsx` — created in task 21-03-02

Existing infrastructure (Vitest, jsdom, mock-db conventions) covers all phase requirements —
no framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Projects-tab visual check (zinc theme, zoom brush feel, drill open/close, coverage subtitles, empty states, no scroll jump) | ISSUE-02, ISSUE-03 | `next dev` broken both ways on this machine (STATE.md); visual/UX quality is owner taste | 21-04 checkpoint: webpack production build to isolated dist (e.g. `.next-uat-21`) + `next start` on `:3100` per `references/deploy-sequence.md`; `:3000` untouched |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are the blocking human checkpoint
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (tests created in-task, mapped above)
- [x] No watch-mode flags (all commands use `vitest run`)
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned 2026-07-04 (gsd-planner)
