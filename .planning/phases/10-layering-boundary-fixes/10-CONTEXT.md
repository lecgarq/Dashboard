# Phase 10: Layering & Boundary Fixes - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Repair layering boundaries without adding product capability. Four fixes, all
machine-verifiable:

- **BND-01** — `app/(dashboard)/access-analysis/coordinationActions.ts` no longer
  imports `@/server/db` directly; the clash drill-down query runs through a tRPC
  procedure. `ast-grep` rule `direct-prisma-in-ui` returns 0 matches.
- **BND-02** — pure activity-classification logic moves to
  `lib/acc/activityClassification.ts`, re-exported by
  `app/(dashboard)/access-analysis/moduleOverrides.ts`; the four
  `scripts/diag-activity-*.cjs` import from `lib/`. The four `scripts→app`
  dependency-cruiser warnings on the `moduleOverrides` path clear.
- **BND-03** — non-spatial-graph `lib→app` reverse edges are eliminated;
  spatial-graph-coupled edges are documented as deferred.
- **BND-04** — client `app→server` direct imports are corrected; acceptable
  Server Component/Action edges are documented.

`/access-analysis` and `/template-mty` must behave **identically** after this
phase. No new analytics, no UI/theme change, no spatial-graph files touched.

</domain>

<evidence>
## Grounding Sources

- `.claude/skills/lecg-dashboard/SKILL.md` — source roots, zinc-dark taste,
  no-new-WebGL-on-data-surfaces rule, `npx tsc --noEmit`-before-rebuild gate.
- `.planning/PROJECT.md` — v2.1 scope: spatial-graph excluded; guardrails-first;
  Prisma DB is the analytics source of truth.
- `.planning/REQUIREMENTS.md` — BND-01..BND-04 wording, including the explicit
  carve-out that BND-02/BND-03 cover **only** non-spatial-graph edges and that
  moving `internalDomains.ts` / `graphNodesFromUsers.ts` /
  `instanceFeatureTokens.ts` is out of scope.
- `.planning/ROADMAP.md` Phase 10 — the four success criteria (ast-grep 0,
  repo-map 0 `scripts→app`, lib→app edges only-spatial-graph-remaining,
  app→server audited+documented).
- `.planning/codebase/CONCERNS.md` §2.1, §2.2, §7.1, §7.2 — file-level evidence.
- Source (read this session): `coordinationActions.ts` is a `"use server"`
  action `loadProjectClashes(projectId)` doing an `auth()`-gated
  `accIssue.findMany` (+ `accProjectMember`/`accDcUser` name resolution,
  `take: 500`), called from `app/(dashboard)/access-analysis/mainCharts.tsx` on
  drill-down expand. Existing homes already present:
  `server/routers/acc-members.ts`, `server/routers/clash.ts`, and
  `lib/server/coordinationByProjectView.ts` (+ `.test.ts`).
- VERIFY: exact current exports of `moduleOverrides.ts`
  (`classifyActivity`, `donutModules`, `CATEGORY_LABELS`, `n`) and the exact
  import lines in the four `scripts/diag-activity-*.cjs`.
- VERIFY: full `lib→app` and client `app→server` edge lists from a fresh
  `node scripts/repo-map/check.cjs` — CONCERNS cites counts (20 / 29) but not the
  enumerated edges. The architecture-summary is dated 2026-06-19; re-run before planning.
- VERIFY: whether `server/routers/clash.ts` is clash-sim (separate domain) or a
  viable home for the coordination drill, before creating a new router file.
- VERIFY: `root.ts` router composition to confirm how a new `acc-coordination`
  router (or added `acc-members` procedure) registers.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Scope line is **fixed**: only non-spatial-graph edges. `internalDomains.ts`,
  `graphNodesFromUsers.ts`, `instanceFeatureTokens.ts` stay deferred — they live
  under `/users/spatial-graph` route files.
- **Zero behavior change** is the contract: the clash query stays the same
  auth-gated `accIssue.findMany` (same `select`/`where`/`orderBy`/`take: 500`);
  `classifyActivity`/`donutModules`/`CATEGORY_LABELS`/`n()` move **verbatim** and
  `moduleOverrides.ts` re-exports them so every UI import path is unchanged.
- Follow existing patterns: tRPC procedures in `server/routers/`, pure logic in
  `lib/acc` / `lib/server`. No new abstractions beyond what the fix requires.
- No theme/UI work; ECharts and zinc theme untouched (this phase changes no
  rendered output).
- Gate order: `npx tsc --noEmit` → `node scripts/repo-map/check.cjs` → ast-grep
  `direct-prisma-in-ui` → `npm test` → rebuild + Task Scheduler restart on `:3000`.

</defaults>

<decisions>
## Implementation Decisions

### BND-01 — clash query re-homing (Claude's Discretion: "best approach")
- Extract the per-project clash drill query into a `lib/server` helper (next to
  `coordinationByProjectView.ts`), exposed via a **new `server/routers/acc-coordination.ts`
  tRPC procedure**. Preferred over growing `acc-members.ts`; preferred over
  `clash.ts` unless VERIFY shows `clash.ts` is the coordination domain (not
  clash-sim).
- Keep `coordinationActions.ts` as a **thin Server Action** that calls the
  procedure server-side (server-side caller / direct helper call). Do **not**
  convert the call site to a client `useQuery` hook — `mainCharts.tsx`'s
  lazy-load-on-expand behavior and timing stay identical.
- Rationale recorded for Luis (who deferred this as plumbing): this satisfies the
  literal "runs through a tRPC procedure" wording, returns 0 ast-grep matches,
  and is the lowest-risk path for the live demo (no call-site change).

### BND-03 / BND-04 — edge-removal aggressiveness (user decision: Conservative)
- Remove only edges whose fix stays **out of** `/users/spatial-graph` files.
- Any `lib→app` or client `app→server` edge that could only be removed by editing
  a spatial-graph module is **documented as spatial-graph-deferred** (in the
  repo-map check output narrative and/or a CONCERNS note), not fixed.
- Acceptable Server Component/Action `app→server` edges are documented (comment or
  CONCERNS note) rather than "fixed" — they are legitimate.

### Test depth (Claude's Discretion: "you decide" → light)
- Add **light pin tests only on the code that moves**: a Vitest test asserting
  `classifyActivity`/`donutModules`/`CATEGORY_LABELS` produce identical output
  after the `lib/acc/activityClassification.ts` extraction, and a test pinning the
  clash-query result shape returned by the new tRPC procedure.
- Heavy monolith/terrain characterization stays in **Phase 14** — do not pull it
  forward.

### Claude's Discretion (open during planning/exec)
- Exact new router/helper file names and the procedure name (confirm against
  `root.ts` and avoid inventing).
- Whether the thin Server Action calls the procedure via a tRPC server-side caller
  or imports the `lib/server` helper directly (both clear the gate; pick the one
  that matches existing repo convention).
- Where deferred-edge documentation lives (CONCERNS note vs. inline comment).

</decisions>

<specifics>
## Specific Ideas

- Treat Luis as the workshop presenter: the deliverable is "the demo still works
  exactly the same, but the boundaries are clean." Any visible change to
  `/access-analysis` clash drill-down or module donut is a failure, not a feature.

</specifics>

<workshop>
## Workshop Impact

- Surfaces touched in code: `/access-analysis` (clash drill-down Server Action +
  module-classification source). No rendered behavior should change.
- `/template-mty` shares terrain logic but is **not** modified in this phase
  (its shared-query extraction is REF-02, deferred to Phase 14 guardrails).
- Net workshop effect: invisible to the audience; the win is maintainability and a
  clean boundary baseline for Phases 13/14.

</workshop>

<data_truth>
## Data Truthfulness

- No data changes. Same Prisma models (`accIssue`, `accProjectMember`,
  `accDcUser`), same queries, same coverage. This phase moves code, not data.
- Data-coverage labeling is Phase 11 (TRUTH-*), explicitly independent of this phase.

</data_truth>

<deferred>
## Deferred Ideas

- Moving `internalDomains.ts` / `graphNodesFromUsers.ts` /
  `instanceFeatureTokens.ts` into `lib/` — spatial-graph-coupled; out of v2.1 scope.
- `folderPermQuery.ts` shared extraction (REF-02) and the monolith splits (REF-01)
  — deferred; Phase 14 ships their characterization tests.
- Aggressive "0 edges everywhere" boundary cleanup that touches spatial-graph —
  belongs to a future spatial-graph milestone.

</deferred>

<verification>
## Verification Expectations

- `npx tsc --noEmit` before any rebuild.
- `node scripts/repo-map/check.cjs` — 0 `scripts→app` warnings on the
  `moduleOverrides` path; `lib→app` output lists only spatial-graph-coupled edges
  as remaining/deferred.
- `ast-grep` rule `direct-prisma-in-ui` — 0 matches.
- `npm test` green, including the new light pin tests for the moved classifier and
  the clash-query shape.
- Rebuild + Task Scheduler restart on `:3000`; spot-check the `/access-analysis`
  clash drill-down and module donut render identically.
- Guardrails: zinc theme untouched, no new WebGL, `/users/spatial-graph` files not
  modified.

</verification>

---

*Phase: 10-layering-boundary-fixes*
*Context gathered: 2026-06-23*
