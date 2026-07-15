# LECG Workflow Conventions

Shared rules for the project-owned `lecg-*` lifecycle skills. `.planning/` is
plain project memory; edit it directly and do not depend on an external runtime.

## Planning artifacts

| Artifact | Path |
|---|---|
| Project state | `.planning/STATE.md` |
| Project record | `.planning/PROJECT.md` |
| Requirements | `.planning/REQUIREMENTS.md` |
| Roadmap | `.planning/ROADMAP.md` |
| Milestone history | `.planning/MILESTONES.md` |
| Milestone archives | `.planning/milestones/vN.N-{REQUIREMENTS,ROADMAP}.md` |
| Phase context | `.planning/phases/NN-slug/NN-CONTEXT.md` |
| Phase plans | `.planning/phases/NN-slug/NN-MM-PLAN.md` |
| Plan summaries | `.planning/phases/NN-slug/NN-MM-SUMMARY.md` |
| Phase verification | `.planning/phases/NN-slug/NN-VERIFICATION.md` |
| Phase baseline (when a phase captures one) | `.planning/phases/NN-slug/NN-BASELINE.md` |
| Codebase map | `.planning/codebase/*.md` |

## STATE schema v2

STATE frontmatter stores only what artifacts cannot answer:

```yaml
lecg_state_version: 2
milestone: v2.4
milestone_name: <name>
current_phase: 25
current_phase_name: <name>
status: ready_to_plan | executing
current_plan: null | "NN-MM"
stopped_at: "<one narrative string naming the exact next command>"
last_updated: "<ISO timestamp>"
```

There is no stored `progress` block and no `last_activity*` fields — they were
always stale and misled autonomous resumes. **Progress is derived on every
read**: count `*-PLAN.md` vs matching `*-SUMMARY.md` files in the active
`.planning/phases/NN-*/` directory, and completed-phase checkboxes in the
active milestone's ROADMAP section. If a skill needs a progress figure, it
computes it; it never trusts or writes one.

## State safety

- Edit `STATE.md` surgically; do not regenerate it from memory.
- Preserve the schema-v2 frontmatter keys and the established `ready_to_plan`
  and `executing` statuses unless a deliberate migration updates every consumer.
- After a write, re-read the frontmatter and check for missing delimiters,
  duplicate keys, or dropped fields.
- Trust plans, summaries, the current diff, and git history over stale state
  prose after a crash.

## Dirty-tree and commit safety

- Run `git status --short` before work and preserve unrelated WIP.
- Stage explicit paths only. Never use `git add -A`, `git add .`, `git add -u`,
  or `git commit -a` on this tree.
- Before every commit, inspect `git diff --cached --name-only` and unstage
  anything outside scope.
- After delegated work, inspect the tree and diff unexpected files before
  accepting them.

## Codebase-memory evidence

- Start with `index_status`. Run fast indexing only when the Dashboard project
  is absent or its indexed Git HEAD differs from `git rev-parse HEAD`.
- Use `detect_changes` for working-tree WIP, `search_graph` and `trace_path` for
  callers/dependencies, and `get_architecture` only for broad changes.
- Confirm graph findings with direct source reads and `rg`. A missing graph
  result never proves that code does not exist.
- Keep `node scripts/repo-map/check.cjs` as the deterministic architecture gate;
  codebase-memory does not replace it.
- If MCP is unavailable or its tools are not surfaced by the client, use its
  CLI when installed, then fall back to direct repository inspection. Never
  block ordinary work on the graph.
- Keep the graph machine-local. Do not commit its cache or database.

## Evidence and gates

- Verify every named path, procedure, model, env var, command, and test from
  the current repository. Prefix unresolved claims with `VERIFY:`.
- Use real roots (`app/`, `components/`, `lib/`, `server/`, `prisma/`,
  `scripts/`, `services/`), not a generic `src/` placeholder.
- Select the smallest sufficient gates from
  `dashboard-verification-sequence.md`.
- Run `npx tsc --noEmit` for application code and before every build.
- Use the isolated `:3100` harness for production-build browser verification;
  never disrupt the always-on `:3000` service for an ordinary code check.

## Deploy policy (autoDeploy)

`.planning/config.json` `"autoDeploy": true` means phase completion ships:
when every plan in a phase is summarized and all of its gates passed, run the
full `deploy-sequence.md` (stop the `LECG Dashboard Local` task, `npx tsc
--noEmit`, `npm run build`, restart, probe the changed route) without asking,
and record the probe result in `NN-VERIFICATION.md`.

- On build or probe failure: restart the scheduled task on the old `.next`,
  report the failure, and do **not** advance STATE past the phase.
- Mid-phase or ad-hoc rebuilds still require explicit intent (`/lecg-ship`).
- With `autoDeploy` absent or false, offer the rebuild instead of running it.

## Process-skill ownership (superpowers)

The superpowers plugin is installed and complements — never replaces — the
lecg lifecycle:

- **Bugs, failing gates, unexpected behavior** during any phase: use
  `superpowers:systematic-debugging` before proposing a fix. This is the
  lifecycle's debugging discipline; there is deliberately no lecg-debug skill.
- **Lifecycle stages stay lecg-owned**: `lecg-discuss-phase` supersedes
  `brainstorming`, `lecg-phase` planning supersedes `writing-plans`, and
  `NN-VERIFICATION.md` supersedes `verification-before-completion` for phase
  work. Use the superpowers variants only for work outside the phase
  lifecycle (ad-hoc requests, spikes).

## Completion

Report exact changes and checks. Separate regressions from pre-existing
failures. Do not claim deploy, UAT, performance, or owner approval without
direct evidence.
