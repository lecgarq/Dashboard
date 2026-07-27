---
name: lecg-phase
description: Resume, plan, execute, verify, and advance an LECG Dashboard phase from its real artifacts. Use for "plan phase", "execute phase", "build phase", "continue phase", or `/lecg-phase N`; add `plan only` to stop before product execution.
argument-hint: "<N> [plan only]"
---

# lecg-phase

Run one phase from its actual `.planning/` state. Default behavior is
end-to-end: plan if needed, self-check, execute, verify, summarize, deploy
(when `autoDeploy` is on), and advance. `/lecg-phase <N> plan only` never
executes product work.

Read first:

@C:/LECG/Dashboard/AGENTS.md
@C:/LECG/Dashboard/.claude/skills/lecg-dashboard/references/lecg-workflow-conventions.md

## Resolve state before acting

1. Run `git status --short`; preserve unrelated edits and deletions.
2. Read `.planning/STATE.md`, the phase entry in `.planning/ROADMAP.md`, its
   requirement IDs in `.planning/REQUIREMENTS.md`, and the matching
   `.planning/phases/<NN>-*/` directory. Confirm the requested phase exists.
3. List `<NN>-CONTEXT.md`, `<NN>-<MM>-PLAN.md`, matching `SUMMARY.md` files,
   and any `.continue-here*` checkpoint. Derive position from these artifacts —
   plans without summaries are the remaining work. Trust artifacts and Git
   history over stale STATE prose.
4. Apply the first matching route:
   - Missing context or material owner decisions: route to
     `/lecg-discuss-phase <N>` and stop.
   - Context exists, no plans: write and self-check 1–4 plans. In `plan only`
     mode, stop after the planning artifacts and STATE update; otherwise begin
     execution immediately.
   - Plans exist with missing summaries: never replan. In `plan only` mode,
     report the existing plans and stop; otherwise execute the first incomplete
     plan by dependency wave.
   - Every plan has a summary: do not re-execute. Run phase completion below.

## Planning

Treat `CONTEXT.md` decisions as locked. Read every file a plan will touch and
verify callers, exports, routes, procedures, Prisma models, adjacent tests, and
commands with codebase-memory plus direct source reads and `rg`. Plans that
touch a visual surface also read root `DESIGN.md` and include the design gate
(`impeccable detect`) in their verification tier.

Write the smallest complete set of 1–4 vertical plans. Use the established
`<NN>-<MM>-PLAN.md` schema:

- Frontmatter: `phase`, `plan`, `type: execute`, `wave`, `depends_on`, exact
  `files_modified`, `autonomous`, requirement IDs, and `must_haves` containing
  truths, artifacts, and grep-able key links.
- Body: objective, required `@` context paths, numbered tasks with exact files
  and checks, the narrowest verification gates, and success criteria mirroring
  the truths.
- Use `VERIFY:` for unresolved evidence; a discovery task must resolve it before
  implementation can rely on it.

Self-check before execution:

- Every phase requirement appears in at least one plan.
- Every truth has an implementing task and a gate that can catch failure.
- Every artifact and key-link path exists or is explicitly created by a task.
- Key-link patterns match the intended integration.
- Waves and `depends_on` describe real dependencies; do not manufacture plans.

Update STATE surgically (schema v2: `stopped_at` names the plans and the exact
next command). Leave `status: ready_to_plan` until execution begins. If
committing planning docs, stage only their explicit paths and inspect
`git diff --cached --name-only`.

## Execution

Execute incomplete plans inline in ascending wave and plan order. At the start
of each plan, re-read the full plan and its context files, inspect current WIP,
and set STATE to `status: executing` with `current_plan: "<NN>-<MM>"`.

For each task:

1. Implement the smallest complete diff using existing helpers, types,
   components, routes, and installed packages.
2. If source evidence contradicts the plan, make a trivial correction and
   record it in the summary. Stop for direction when the contradiction changes
   scope, data authority, or a required truth.
3. Run the plan's exact focused gates. Application code requires
   `npx tsc --noEmit`; architecture/import/router/Prisma changes also require
   `node scripts/repo-map/check.cjs`. Never fake data or verification.
4. Commit only coherent task groups when commits are part of the workflow.
   Stage explicit paths, inspect `git diff --cached --name-only`, then use the
   repository's `feat`, `fix`, `test`, or `docs` message style.
5. Write `<NN>-<MM>-SUMMARY.md` with changed files, truthful deviations, exact
   gate outcomes, and durable follow-up debt. Update STATE (`stopped_at`,
   `current_plan`, `last_updated`) and re-read its frontmatter.

Continue dependency waves until every plan has a summary or a real blocker
requires owner input.

Context hygiene: if context is already deep when the next plan starts,
finish the current plan's SUMMARY and STATE update, then recommend resuming
in a fresh session (`/lecg-resume-work` restores position from artifacts at
no cost) instead of pushing one long session through the whole phase —
execution quality degrades with context depth.

## Phase completion

When all plans are summarized:

1. **Audit against the roadmap.** Check the phase's ROADMAP success criteria
   and requirement IDs against what actually shipped. Record gaps instead of
   declaring them complete.
2. **Cut before verifying.** For phases that added shared modules, new
   abstractions, or refactors, run `/ponytail-review` on the phase diff and
   apply the deletions that survive scrutiny — the cheapest time to remove
   over-engineering is before it ships. Skip for pure content/data phases.
3. **Write `<NN>-VERIFICATION.md`** in the phase directory: per-requirement
   coverage with shipped evidence (files, commits, gate outputs), every gate
   actually run with its exact outcome, deviations carried from summaries, and
   any remaining `VERIFY:` items or recorded gaps.
4. **Roll debt forward.** Copy durable follow-ups from the phase's SUMMARYs
   into `.planning/codebase/CONCERNS.md` as dated, phase-tagged entries. Debt
   that only lives in a summary is debt that gets lost.
5. **Deploy per policy.** With `.planning/config.json` `"autoDeploy": true`
   and all gates green, run `/lecg-ship` end-to-end (deploy-sequence + route
   probe) and append the probe result to `<NN>-VERIFICATION.md`. On build or
   probe failure: restore the `:3000` task, report, and stop without advancing
   STATE. With `autoDeploy` off, offer the rebuild instead.
6. **Advance.** Reconcile ROADMAP (check the phase's boxes) and STATE
   surgically: next phase, `status: ready_to_plan`, `current_plan: null`, and a
   `stopped_at` naming `/lecg-phase <next>` or `/lecg-discuss-phase <next>`
   based on the next phase's artifacts. If this was the milestone's last phase,
   route to `/lecg-close-milestone` instead.

## Fractional phases

To insert urgent follow-up work between phases (the `20.1`, `21.1` pattern):
create `.planning/phases/<NN.M>-<slug>/`, add a `### Phase NN.M` entry to the
active ROADMAP section with goal/requirements/success criteria, and point STATE
at it. Never renumber existing phase directories or ROADMAP entries.

## Non-negotiable safeguards

- Never stage the whole dirty tree or discard unrelated work.
- Never run `npm run build` before `npx tsc --noEmit`, or while the local
  scheduled task / port `:3000` is live.
- Keep repo-map as the deterministic architecture gate; MCP evidence is
  supplemental.
- Preserve truthful coverage labels and existing data authority. Do not add
  fake fixtures, routes, metrics, or verification claims.
