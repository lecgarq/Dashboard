# Retrospective — LECG Dashboard

A living retrospective across milestones. Newest milestone first; cross-milestone trends at the bottom.

---

## Milestone: v2.0 — Workshop-Grade UI/UX Overhaul

**Shipped:** 2026-06-19
**Phases:** 7 | **Plans:** 30 (33 with gap-closure) | **Commits:** 161 over 3 days

### What Was Built

A foundation-first premium overhaul of `/users`, `/access-analysis`, `/template-mty`, and `/forma-proposal`: a shared design language (depth/glow tokens, `PremiumSurface`, themed `EChart`, motion facade, `DrillSheet`), the 2,474-line `/users` monolith decomposed behind a golden-path test, one reusable virtualized `DataTable`, client-side cross-filtering on `/access-analysis`, WCAG-AA projector-brightness contrast, and a projector-simulation UAT harness as the acceptance gate.

### What Worked

- **Foundation-first sequencing.** Shipping Phase 1 (the shared design system) once meant the three per-page polish phases (4, 5, 6) could run in parallel and never re-invented styling. The dependency graph in the roadmap paid off directly in wall-clock.
- **Refactor-behind-a-test before re-skinning.** Decomposing `/users` with a golden-path integration test written *before* the first extraction (02-01) made a high-risk teardown of a 2,474-line monolith land with zero user-visible change.
- **Automated gates for subjective qualities.** Turning "labels must be readable on a projector" into a 15-assertion WCAG contrast test (05-05) and a full Playwright engineering-gate harness (07-01) made the final UAT fast and repeatable instead of a manual eyeball marathon.
- **Owner-in-the-loop UAT per page.** Phases 4, 5, and 6 each ended with a live rebuild + owner sign-off, so the Phase 7 projector pass had no surprises.
- **"Raise the token, not the threshold."** When a contrast check failed, the fix nudged the color to meet AA rather than loosening the standard — a small discipline that kept quality honest.

### What Was Inefficient

- **Version-number collision discovered at ship time.** The fresh GSD project re-claimed "v1.0" while a `v1.0` git tag already existed from the May milestone — surfaced only at milestone completion, forcing a late decision to tag as `v2.0`. A version-namespace check at *project init* would have caught it earlier.
- **Phase 4 needed three gap-closure plans** (G1/G4/G6) after owner UAT found 5 gaps + 2 perf follow-ups — the largest rework pocket of the milestone, concentrated in the most-redesigned page.
- **Heavy planning-doc churn.** 74 `docs(` commits vs 53 `feat(` — the planning overhead was a large share of total commits (expected under GSD, but worth noting for cost).

### Patterns Established

- **Settle-and-freeze** for d3-force graphs (`sim.on('end', sim.stop())`) to end perpetual ticking; **click-vs-drag** gating via movement+duration.
- **Split-scroll virtualized table** (sticky header + body in separate overflow containers) as the `DataTable` baseline.
- **Selective WebGL** — real R3F only on non-data regions (`frameloop="demand"`, `pointer-events:none`), CSS/ECharts depth everywhere else; verified < 400MB GPU.
- **`repo-map` toolchain as standing research input** + `repo-map:check` regression ratchet against re-introduced fetches/effects.
- **Deploy = local rebuild**, not a branch merge — the working tree ships via `npm run build` + Task Scheduler restart on :3000.

### Key Lessons

- Reconcile the **git tag namespace** with planning-doc version numbers at init, not at ship.
- A **projector-brightness simulation** (secondary display, reduced brightness, 1280px) is a materially different test than a normal monitor — and it's the only acceptance test that matters for a workshop showcase.
- **Decompose before you decorate:** the visual redesign of `/users` was only safe because the monolith was already split behind a test.

### Cost Observations

- Model mix: not instrumented this milestone.
- Sessions: multiple, spanning 2026-06-17 → 2026-06-19 (3 active days).
- Notable: planning docs (`docs(`/`docs:` = ~54% of commits) were the dominant non-feature cost; gap-closure on Phase 4 was the main rework.

---

## Cross-Milestone Trends

| Milestone | Shipped | Phases | Plans | Commits | Days |
|-----------|---------|--------|-------|---------|------|
| v1.0 — ACC Users Graph + Access Analysis | 2026-05-08 | 6 | 33 | — | ~11 |
| v2.0 — Workshop-Grade UI/UX Overhaul | 2026-06-19 | 7 | 30 (33) | 161 | 3 |

**Recurring strengths:** foundation/primitive-first sequencing; owner-in-the-loop UAT before declaring done.
**Recurring watch-items:** planning-doc overhead as a share of commits; reconcile versioning/namespace decisions earlier in the lifecycle.

---
