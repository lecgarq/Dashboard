# Roadmap: LECG Dashboard

## Milestones

- ✅ **v1.0 — ACC Users Graph + Access Analysis Dashboard** — 6 phases (shipped 2026-05-08, tag `v1.0`)
- ✅ **v2.0 — Workshop-Grade UI/UX Overhaul** — Phases 1–7 (shipped 2026-06-19, tag `v2.0`)
- 📋 **v-next** — to be defined (`/gsd:new-milestone`)

## Phases

<details>
<summary>✅ v2.0 Workshop-Grade UI/UX Overhaul (Phases 1–7) — SHIPPED 2026-06-19</summary>

Premium UI/UX overhaul of `/users`, `/access-analysis`, `/template-mty`, `/forma-proposal` — fast, visually premium (2.5D depth), tactile, explorable live. Foundation-first; projector UAT as the acceptance gate. Full detail: [`milestones/v2.0-ROADMAP.md`](milestones/v2.0-ROADMAP.md).

- [x] Phase 1: Shared Design Foundation (6/6 plans) — completed 2026-06-17
- [x] Phase 2: /users Decomposition (6/6 plans) — completed 2026-06-18
- [x] Phase 3: DataTable Primitive (2/2 plans) — completed 2026-06-18
- [x] Phase 4: /users Table & Polish (4/4 plans + 3 gap-closure) — completed 2026-06-18
- [x] Phase 5: /access-analysis Depth & Cross-Filtering (5/5 plans) — completed 2026-06-19
- [x] Phase 6: /template-mty & /forma-proposal Polish (5/5 plans) — completed 2026-06-19
- [x] Phase 7: Pre-Workshop UAT (2/2 plans) — completed 2026-06-19

</details>

<details>
<summary>✅ v1.0 ACC Users Graph + Access Analysis Dashboard (6 phases) — SHIPPED 2026-05-08</summary>

Production ACC user-access platform — GPU graph (25,559-node hub), filter pipeline with hide-on-filter, single-page Access Analysis dashboard. Archived before the v2.0 GSD re-init; full record lives in the `v1.0` git tag history.

</details>

### 📋 v-next (to be defined)

Run `/gsd:new-milestone` to define the next milestone (questioning → research → requirements → roadmap). Candidate seeds carried forward from v2.0:

- FRM-V2-01 — Forma role-permission diff view (needs a new `template.getBaseline(roleId)` tRPC query)
- ACC-V2-01 — Project-grouped persistent accordion in the `/access-analysis` project picker
- NA-V2-01 — Additional new per-page analytics beyond the gated set
- `/users` data freshness / auto-refresh

## Progress

**Execution order (v2.0):** 1 → 2 → 3 → 4 → 5 → 6 → 7.
**Parallelization:** Group A (foundation) 1 → {2, 3}; Group B (parallel polish) {4, 5, 6}; Group C (final gate) 7.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Shared Design Foundation | v2.0 | 6/6 | Complete | 2026-06-17 |
| 2. /users Decomposition | v2.0 | 6/6 | Complete | 2026-06-18 |
| 3. DataTable Primitive | v2.0 | 2/2 | Complete | 2026-06-18 |
| 4. /users Table & Polish | v2.0 | 4/4 (+3) | Complete | 2026-06-18 |
| 5. /access-analysis Depth & Cross-Filtering | v2.0 | 5/5 | Complete | 2026-06-19 |
| 6. /template-mty & /forma-proposal Polish | v2.0 | 5/5 | Complete | 2026-06-19 |
| 7. Pre-Workshop UAT | v2.0 | 2/2 | Complete | 2026-06-19 |
