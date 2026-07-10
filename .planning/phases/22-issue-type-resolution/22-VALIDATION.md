---
phase: 22
slug: issue-type-resolution
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source of truth: `22-RESEARCH.md` → Validation Architecture section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing repo suite) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npx vitest run lib/server/issueFunnelView.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | quick ~seconds; full suite per repo baseline |

---

## Sampling Rate

- **After every task commit:** Run the quick command plus `npx tsc --noEmit`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-T1 (model + migration) | 01 | 1 | ISSUE-04 | integration | `npx tsc --noEmit` + node/pg `SELECT COUNT(*) FROM "AccIssueType"` (table exists) | ✅ (live DB) | ⬜ pending |
| 22-01-T2 (backfill script + dry-run) | 01 | 1 | ISSUE-04 | manual-with-command | `node scripts/acc-issue-types-backfill.cjs --dry-run --project=<accessible-id>` (exit 0, sample record logged, 0 writes) | ❌ script new (no test file — matches `acc-issues-backfill.cjs` precedent) | ⬜ pending |
| 22-01-T3 (live run + evidence) | 01 | 1 | ISSUE-04 | integration | node/pg `SELECT kind, COUNT(*) FROM "AccIssueType" GROUP BY kind` (both kinds > 0) + resolved/total split queries | ✅ (live DB) | ⬜ pending |
| 22-02-T1 (loader type cut) | 02 | 2 | ISSUE-05 | unit | `npx vitest run lib/server/issueFunnelView.test.ts` (incl. the queryRaw single-call pin) | ✅ extend existing | ⬜ pending |
| 22-02-T2 (summarizeIssueType) | 02 | 2 | ISSUE-05 | unit | `npx vitest run "app/(dashboard)/access-analysis/__tests__/issueTypeCounts.test.ts"` | ❌ W0 (created in-task) | ⬜ pending |
| 22-03-T1 (IssueTypeChart) | 03 | 3 | ISSUE-05 | component | `npx vitest run "app/(dashboard)/access-analysis/__tests__/IssueTypeChart.test.tsx"` (incl. self-grep pin) | ❌ W0 (created in-task) | ⬜ pending |
| 22-03-T2 (wiring) | 03 | 3 | ISSUE-05 | full suite | `npm test && npx tsc --noEmit` | ✅ | ⬜ pending |
| 22-03-T3 (owner checkpoint) | 03 | 3 | ISSUE-05 | manual | `:3100` production preflight (`.next-uat-22`), owner UAT steps in 22-03-PLAN.md | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] None standalone — the two new test files (`issueTypeCounts.test.ts`, `IssueTypeChart.test.tsx`) are created inside the same task as the code they pin, following the repo's co-located-test convention; existing vitest infrastructure covers everything (no new framework/config).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live APS issue-types response field names | ISSUE-04 | External API; MEDIUM confidence on response JSON shape | Run backfill with `--dry-run` first; inspect logged sample record before writes |
| Chart renders on live page with resolved names, no raw GUIDs | ISSUE-05 | Visual UAT on zinc theme, top-N + "Other" behavior | Load `/access-analysis` issues tab; confirm names + "Unknown type" fallback |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
