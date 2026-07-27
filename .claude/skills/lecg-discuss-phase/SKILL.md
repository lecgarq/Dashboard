---
name: lecg-discuss-phase
description: Gather implementation decisions for a roadmap phase and write NN-CONTEXT.md before the unified phase workflow plans or executes it. Use whenever Luis says "discuss phase N", "let's talk through phase N", "context for phase N", or a phase is ready_to_plan with no CONTEXT.md yet.
---

# lecg-discuss-phase

Extract the decisions a planner needs, lock them in
`.planning/phases/<NN>-<slug>/<NN>-CONTEXT.md`, and stop scope creep at the
door. The output must be concrete enough that `/lecg-phase` never has to
ask Luis a question.

Read `../lecg-dashboard/references/lecg-workflow-conventions.md` first.

## Process

1. **Load prior decisions** so nothing gets re-asked: the phase's entry in
   `.planning/ROADMAP.md`, its requirement IDs in
   `.planning/REQUIREMENTS.md`, `.planning/STATE.md` carried-forward
   decisions, and every earlier `*-CONTEXT.md` this milestone.
2. **Scout the code the phase touches.** Read the actual modules, existing
   controls/components, and tests around the target area (use
   codebase-memory `search_graph`/`search_code` before grep sweeps). The point:
   arrive knowing what already exists so gray areas are real choices, not
   research questions.
3. **Identify gray areas** — places where multiple repo-native options exist
   and the choice changes what Luis sees in the workshop, data truthfulness,
   UI taste, or scope. Skip anything already decided in a prior phase or
   derivable from the Dashboard contract (zinc theme, no new WebGL, label
   don't hide — those are settled).
4. **Discuss via AskUserQuestion**, batched (≤4 per call), each option with a
   recommended default grounded in current Dashboard style. Scope creep gets
   redirected: capture the idea under Deferred Items instead of widening the
   phase.
5. **Write `<NN>-CONTEXT.md`** matching the established shape (see
   `.planning/phases/25-*/25-CONTEXT.md` as the exemplar):
   - Header: phase title, `**Gathered:** <date>`, `**Status:** Ready for planning`
   - `<domain>` — phase boundary: what changes, on which route, and explicitly
     what does NOT change (name the adjacent phases that own excluded work)
   - `<evidence>` — grounding sources with file paths; unproven figures get
     `VERIFY:` lines instead of confident numbers
   - `<defaults>` — inferred Dashboard defaults the planner may assume
   - `<decisions>` — the locked owner choices from step 4, one per gray area
6. **Update STATE.md** (`stopped_at` narrative + `last_updated`; status stays
   `ready_to_plan`), re-check frontmatter, commit both files by explicit path:
   `docs(<NN>): capture phase context`.
7. **Route**: `/lecg-phase <N>`.

## Quality bar

- A decision is captured only when it's executable: "banded swatches, no
  ramps, one legend" — not "keep it clean".
- Every requirement ID the phase covers must be traceable to at least one
  decision or default.
- Name the trap explicitly when two similar paths exist (e.g.,
  `app/(dashboard)/access-analysis` vs
  `app/(dashboard)/users/access-analysis`).
