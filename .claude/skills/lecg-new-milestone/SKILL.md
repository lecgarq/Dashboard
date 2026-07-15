---
name: lecg-new-milestone
description: Open a new LECG Dashboard milestone — gather goals, update PROJECT.md, write REQUIREMENTS.md and ROADMAP.md, reset STATE.md. Use whenever Luis says "new milestone", "start vNext", "what's next after this milestone", names a new version like "v2.5", or the current milestone just closed and he describes new goals — even without the word "milestone".
---

# lecg-new-milestone

Open a new milestone cycle on the existing `.planning/` structure. Brownfield
only — this project always has history; never re-initialize.

Read `../lecg-dashboard/references/lecg-workflow-conventions.md` first.

If the previous milestone has not been audited and archived yet (no
`.planning/milestones/<vPrev>-*.md`, no MILESTONES.md retrospective entry),
run `/lecg-close-milestone` first.

## Inputs to load (before asking anything)

- `.planning/STATE.md` — Deferred Items, blockers, last milestone's loose ends
- `.planning/PROJECT.md` — Active candidates, Validated list, constraints
- `.planning/MILESTONES.md` — history; next version number
- `.planning/ROADMAP.md` — last phase number (numbering continues, never resets)
- `.planning/codebase/CONCERNS.md` — debt worth scheduling. If the codebase
  docs' date stamps predate the last milestone's close, suggest
  `/lecg-map-codebase` before roadmapping on stale architecture.

## Process

1. **Seed the discussion.** Present a short list of candidate directions built
   from Deferred Items + PROJECT.md Active seeds + CONCERNS debt, with a
   recommended pick. Luis chooses or supplies his own goal. Do not interrogate
   about facts already in those files — ask only about desired outcome and
   scope edges.
2. **Update PROJECT.md.** Promote last milestone's validated work, set the new
   milestone's goal and Active items. Keep standing constraints intact (Prisma
   DB analytics source, zinc theme, no new WebGL on data surfaces, workshop
   four-page focus) unless Luis explicitly changes them.
3. **Write REQUIREMENTS.md.** Scoped to this milestone. Each requirement gets a
   stable ID (`XXX-NN`, category prefix like DIM/PERF/FILT matching prior
   usage), a one-line statement, and its data authority (which Prisma
   model/source proves it can be built). Requirements that depend on
   under-covered data say so explicitly.
4. **Write ROADMAP.md.** 3–6 phases, numbered continuing from the last phase.
   Per phase: goal (user-visible outcome on a named page/route), requirement
   IDs covered, success criteria, and a `UI hint` where relevant. Every
   requirement ID maps to exactly one phase — show the coverage count
   (e.g., "18/18 mapped"). Get Luis's approval on the phase breakdown before
   writing STATE.
5. **Reset STATE.md** by Edit: new `milestone`/`milestone_name`, first phase as
   `current_phase`, `status: ready_to_plan`, `current_plan: null`, fresh
   `stopped_at` narrative (schema v2 — progress is derived from artifacts,
   never stored). Re-read frontmatter after writing (corruption hotspot).
   Preserve Deferred Items that remain relevant; drop ones absorbed into the
   new requirements.
6. **Commit** planning files by explicit path:
   `docs(planning): open <vX.Y> <name> milestone`.
7. **Route.** Next: `/lecg-discuss-phase <N>` (or `/lecg-phase <N>` if the
   first phase has no gray areas).

## Judgment calls

- If the milestone is mostly mechanical (dep updates, cleanup), compress:
  fewer phases, requirements can be terse. Granularity should match risk.
- New analytics ideas must be derivable from the existing Prisma DB; if a seed
  requires data we don't have (e.g., locked DC projects), record it as deferred
  with the blocker named, not as a requirement.
