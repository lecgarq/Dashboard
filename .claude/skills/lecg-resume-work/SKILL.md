---
name: lecg-resume-work
description: Restore LECG Dashboard project context and resume where the last session stopped. Use at the start of any session when Luis says "resume", "continue", "where were we", "status", "progress", or gives any terse continue-style prompt — this is the default entry point when he wants work to pick up without restating the milestone.
---

# lecg-resume-work

Rebuild working context from `.planning/` and route to the next action without
asking Luis to restate anything.

Read `../lecg-dashboard/references/lecg-workflow-conventions.md` first.

## Process

1. **Read state.** `.planning/STATE.md` — frontmatter (`current_phase`,
   `status`, `current_plan`, `stopped_at`) plus Current Position and Deferred
   Items sections. `stopped_at` usually names the exact next command.
   Schema v2 stores no progress figures — derive them in step 2 from
   PLAN-vs-SUMMARY counts and ROADMAP checkboxes.
2. **Verify state against reality** (STATE lies after crashes/corruption):
   - Active phase dir: `.planning/phases/<NN>-*/` — list `*-PLAN.md` vs
     `*-SUMMARY.md`. A PLAN without its SUMMARY = incomplete work.
   - `git log --oneline -5` and `git status --short` — uncommitted work or
     commits newer than `last_updated` mean STATE is behind; trust the tree.
   - Any `.continue-here*` checkpoint file in the phase dir wins over both.
3. **Present status compactly** (no wall of prose):
   - Milestone / phase / status one-liner
   - What actually happened last (from evidence, not just STATE)
   - Any divergence found between STATE and the tree
   - **Next action** — one recommended command
4. **Repair STATE if diverged.** Surgical Edit + frontmatter re-check, commit
   `docs(state): reconcile STATE with tree`. Only when evidence is clear;
   otherwise flag the divergence and ask one question.
5. **Route and proceed.** Route on **artifact evidence**, not status alone
   (plan commits historically don't update STATE, so `ready_to_plan` can mean
   three different positions):
   - No `<NN>-CONTEXT.md` → `/lecg-discuss-phase <N>`
   - Milestone's last phase fully summarized and verified → `/lecg-close-milestone`
   - Otherwise → `/lecg-phase <N>`; it plans when needed, executes plans missing
     summaries, and reconciles a fully summarized phase without re-execution
   In autonomous mode (`.planning/config.json` `mode: autonomous`), state the inferred
   next action and start it; don't wait for confirmation.

## Traps

- Do not "helpfully" rebuild STATE.md from scratch — surgical edits only.
- Uncommitted WIP in the tree may be pre-existing and intentional (this branch
  carries WIP); check whether it belongs to the active plan before assuming it
  is lost work.
