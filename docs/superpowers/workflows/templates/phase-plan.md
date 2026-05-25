# Template — Phase Plan

> Copy into `docs/superpowers/plans/YYYY-MM-DD-<slug>.md` (plans are **dated**, unlike workflows).
> Use with `superpowers:writing-plans`. Tasks use `- [ ]` checkbox syntax so executors can track them.
> Mirrors the structure of existing plans in this repo (e.g. the P5-C plan).

---

# <Phase / Feature Name>

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended)
> or `superpowers:executing-plans` to implement this plan task-by-task.
>
> **STATUS: <PLAN ONLY — do NOT implement until approved | APPROVED — execute>.**

**Goal:** <one sentence — the outcome, not the steps>

**Architecture:** <how it fits the existing system; the data flow; what stays unchanged>

**Tech Stack:** TypeScript, Next.js App Router, tRPC, Prisma/Postgres, apache-arrow + DuckDB-WASM, Vitest,
Playwright. <trim to what's relevant>

**Data check:** <result of [data-discovery-workflow] — the real, counted source field(s) this relies on>

## Scope guardrails (negative space — what this must NOT do)

- No changes to: lasso, camera, nav/routes, `UserDetailPanel`, renderers, edge layers, graph physics, router.
- No new DIMENSION_REGISTRY descriptors / sliders / edges / UI unless explicitly listed below.
- Node identity (`userId::projectId`) preserved.
- <other explicit negatives>

## File structure

| File | Responsibility | New/Modify |
|------|----------------|------------|
| `path/to/file.ts` | <what> | Create / Modify |

---

# Task <N>: <title>

**Files:**
- Create: `...`
- Modify: `...`
- Test: `...`

- [ ] **Step 1: Write the failing test** (`superpowers:test-driven-development`)
- [ ] **Step 2: Run to verify failure** → `npx vitest run <name>` → FAIL
- [ ] **Step 3: Implement minimally**
- [ ] **Step 4: Run to verify pass** → PASS
- [ ] **Step 5: Gates** → `npm test` / `npx tsc --noEmit -p tsconfig.json` (+ `npm run test:e2e` if UI/graph)
- [ ] **Step 6: Commit (surgical, explicit paths)**
  ```bash
  git add <explicit paths>
  git diff --cached --name-only   # verify only these files
  git commit -m "<type>(<scope>): <task>"
  ```

---

## Self-Review

- **Checklist coverage:** every requirement maps to a task. <map>
- **No scope creep:** <confirm against the guardrails above>
- **Type consistency:** <shared types defined once, reused>
- **Known limitations:** <list, with mitigation>

## Execution Handoff

Plan saved. <Do not implement until approved | Approved — order: Task1 → Task2 → ...>, via
`superpowers:subagent-driven-development` with surgical-commit + post-subagent scope-verify discipline.
