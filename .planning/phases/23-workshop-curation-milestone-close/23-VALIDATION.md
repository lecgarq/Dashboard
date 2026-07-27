---
phase: 23
slug: workshop-curation-milestone-close
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-14
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **This is a curation + milestone-close GATE phase. It ships no new business logic.**
> None of its four ROADMAP success criteria describe testable behavior, so the observable
> signals are **gate command exit codes, live-route HTTP probes, git-diff scope proofs, and
> captured owner sign-off** — not new unit tests. Derived from `23-RESEARCH.md`
> § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing; no new framework needed) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~46s (`npm test`, measured live 2026-07-14) |

**Live baseline captured 2026-07-14 (re-confirm, do not assume):**
`npm test` → 2535 passed / 1 skipped / **0 failed**. `npx tsc --noEmit` → exit 0.
The `physicsLayer.test.ts` isolation flake logged in `22-issue-type-resolution/deferred-items.md`
**did not reproduce** and passes in isolation. TEST-01/02/03 are byte-identical vs the `v2.2` tag.

---

## Sampling Rate

- **After every task commit:** `npx tsc --noEmit` (minimal tier per `dashboard-verification-sequence.md`).
- **After every plan wave:** the tier matching the changed files. Waves 1/3/5 change no source, so
  the type gate suffices; Wave 2 is the only wave that can touch UI source (and may legitimately
  be zero-diff).
- **Before milestone close:** `npm test` **and** `npx tsc --noEmit` both green, plus
  `npm run repo-map:check` green *after* the stale-baseline refresh in 23-04.
- **Max feedback latency:** ~46s (full suite).

---

## Per-Task Verification Map

Plans are strictly serial (wave N depends on wave N−1): you cannot review an undeployed surface,
gate an unreviewed one, or close an ungated one.

| Plan | Wave | Criterion | Test Type | Automated Command / Observable Signal | Status |
|------|------|-----------|-----------|----------------------------------------|--------|
| 23-01 | 1 | SC#2 (precondition) | build gate | Task Scheduler task STOPPED → `npx tsc --noEmit` exit 0 → `npm run build` exit 0 → task restarted → `/api/health` returns **200** | ⬜ pending |
| 23-02 | 2 | SC#1 | git-diff scope proof | `git diff --stat -- "app/(dashboard)/access-analysis/components/*TabPanel.tsx"` → **empty (zero-diff PASS) or reorder-shaped hunks only** (no new imports, no new props). Panel recount asserts **23**, Roles tab **6**. | ⬜ pending |
| 23-03 | 3 | SC#2 | **manual — human gate** | Owner sign-off captured in `23-FINDINGS.md` across the full 4-page surface. Blocking checkpoint; `autonomous: false`. | ⬜ pending |
| 23-04 | 4 | SC#3 + SC#4 | gate exit codes + scope proof | `npm test` → 0 failed · `npx tsc --noEmit` → exit 0 · `git diff v2.2 -- <TEST-01/02/03>` → empty · `git diff v2.2..HEAD -- "app/(dashboard)/access-analysis/"` grepped for WebGL/R3F imports → **none** · `git diff --stat v2.2..HEAD -- "app/(dashboard)/users/spatial-graph"` → **empty** · `npm run repo-map:check` → exit 0 *after* baseline refresh | ⬜ pending |
| 23-05 | 5 | close | gate script | `node scripts/gsd-self-gate.cjs --phase 23 --rebuild --route /users` → pass (route inference reads only ROADMAP Phase-23 text, which never names `/users`, so the flag is **required**) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

**None.** Existing infrastructure (Vitest, `npx tsc --noEmit`, `npm run repo-map:check`,
`scripts/gsd-self-gate.cjs`, `/api/health`) already covers every signal this phase's success
criteria require. No new test framework, fixture, or harness is needed — and none should be
added, since the phase adds no code surface to test.

---

## Manual-Only Verifications

| Behavior | Criterion | Why Manual | Test Instructions |
|----------|-----------|------------|-------------------|
| Graph-by-graph owner sign-off, full 4-page workshop surface | SC#2 | **No assertion can tell you a chart's NUMBER is wrong** — only that it rendered. This is the sole pass that would catch a bad figure in a pre-v2.3 panel, and it is the reason the phase exists. | On a freshly rebuilt `:3000`, walk `23-REVIEW-CHECKLIST.md` one panel at a time. Depth is **graded** per the owner's 2026-07-14 decision: `/access-analysis` deep (23 panels / 6 tabs) · `/users` deep · `/template-mty` short functional pass (role-similarity graph) · `/forma-proposal` short visual pass (brand palette). |
| Honesty-label correctness on the live build | SC#2 (data truth) | Labels are prose; correctness is a judgment about whether the caption still matches reality after the rebuild. | Confirm each label still reads true: workflow-tools DC-only caption · issue-coverage fetched/total captions · `IssueTypeChart` Unknown/No-type guards · module-attribution ⓘ caveat · activity-recency "Never active" bands. All five are cited to file:line in `23-RESEARCH.md`. |

**Triage rule (binding, applied at the moment each finding is raised — this is what prevents a Phase 23.1):**
- **Fix in Phase 23:** copy/label fixes, wrong wording, ordering nits, obvious visual defects — anything touching **no loader** and adding **no data**.
- **Defer to v2.4:** anything needing a new loader, chart, data source, or schema/taxonomy change. Record as a milestone seed; **do not build**.

---

## Validation Sign-Off

- [x] All tasks have an automated verify **or** are an explicitly-justified manual gate (SC#2 only)
- [x] Sampling continuity: no 3 consecutive tasks without an automated signal
- [x] Wave 0 covers all MISSING references — none exist
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — set on completion of 23-04.
