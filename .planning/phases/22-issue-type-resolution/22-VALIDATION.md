---
phase: 22
slug: issue-type-resolution
status: draft
nyquist_compliant: false
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

*To be filled by the planner — each task must map to ISSUE-04 or ISSUE-05 with an automated command.*

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-* | 01 | 1 | ISSUE-04 | integration | backfill `--dry-run` + row-count check | ❌ W0 | ⬜ pending |
| 22-02-* | 02 | 2 | ISSUE-05 | unit | `npx vitest run lib/server/issueFunnelView.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] None expected — existing vitest infrastructure covers phase requirements; new transform tests extend existing files/patterns.

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
