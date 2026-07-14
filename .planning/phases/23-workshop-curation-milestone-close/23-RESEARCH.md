# Phase 23: Workshop Curation & Milestone Close - Research

**Researched:** 2026-07-14
**Domain:** GSD milestone-closing gate for a Next.js/Prisma internal dashboard — no new code domain, pure repo-evidence audit (panel inventory, deploy drift, gate tooling, scope-fence proof, milestone-close mechanics).
**Confidence:** HIGH (every claim below is grounded in a file read, a command run in this session, or a git diff — see inline citations; the few genuine unknowns are marked `VERIFY:`)

## Summary

Phase 23 does no feature work. It has three real jobs, evidenced below: (1) a **panel-ordering** curation pass over a live inventory that is **23 panels, not 22** — CONTEXT.md's own recount under-counted the Roles tab by one panel (it lists "Folder action heatmap" but omits the distinct "Folder Activity by Role" panel that sits directly above it in the same file); (2) a **rebuild-then-sign-off** pass, for which this session found concrete, dated evidence that the live `:3000` build (`.next` BUILD_ID mtime 2026-07-13 16:13:05) predates the `workflow-tools donuts` commit (`b0ce345f`, 2026-07-14 09:20) and sits inside a branch carrying ~100 uncommitted `M`/`D` files across `access-analysis`/`users` — a rebuild is not optional, it is the only way to know what's actually being reviewed; (3) a **milestone-close** write sequence via `gsd-tools milestone complete v2.3`, which this session traced end-to-end in `.claude/gsd-core/bin/lib/milestone.cjs` and found one landmine: `.planning/MILESTONES.md` is git-tracked but **currently deleted from the working tree** (part of the branch's unrelated WIP) — running `milestone complete` against that state will silently fabricate a brand-new file containing only the v2.3 entry, discarding the v2.0/v1.0 history that lives in git HEAD. It must be restored first.

This session also **reproduced the documented `state record-session` STATE-corruption trap** live (see Question F) — running it once mangled `current_phase: 23` to `current_phase: 20` / `current_phase_name: "COMPLETE, 5/5 plans"`. It was reverted with `git checkout -- .planning/STATE.md` before any other work continued. This is now first-hand evidence, not just a memory note: **do not run `gsd-tools state record-session` during this phase.**

`node scripts/repo-map/check.cjs` currently **fails** (exit 1) — not from anything Phase 23 will touch, but from a stale dependency-cruiser baseline still referencing three `scripts/diag-activity-*.cjs` files deleted 2026-07-10 in an off-roadmap cleanup commit (`b95bf5c7`). The baseline needs a `npm run repo-map` refresh before it can serve as Phase 23's criterion-#4 scope-fence gate, or every run will show false ERRORs unrelated to this phase.

`npm test` and `npx tsc --noEmit` are **both currently green** — full suite 2535 passed / 1 skipped / 0 failed (46s), tsc clean. The documented `physicsLayer.test.ts` isolation flake did not reproduce in this run's full-suite pass, and passes in isolation too (45/45, confirmed by direct run). TEST-01/02/03 characterization test files are byte-identical against the `v2.2` tag (empty `git diff`).

`gsd-self-gate.cjs` exists and is real (596 lines, not a stub). It is best used as the **final** milestone-close gate, not the pre-review rebuild: its `validatePhaseArtifact()` hard-requires the target phase's ROADMAP checkbox to be `[x]` AND a `{N}-VERIFICATION.md` with an accepted status — neither can exist for Phase 23 before the phase actually finishes. It also cross-checks `STATE.md`'s `progress.total_phases`/`completed_phases` against **every** phase checkbox in ROADMAP.md (all milestones, 17 total across v2.1/v2.2/v2.3), not just the active milestone's 6 — so it will currently fail that check regardless of Phase 22/23 fixes, because STATE.md's `progress` block is intentionally scoped to v2.3 only (6/5). Route inference for `--rebuild` reads ONLY the ROADMAP Phase-23 section text, which does not mention `/users` — `--route /users` must be passed explicitly or the owner-sign-off surface CONTEXT.md put in scope won't be probed by the automated gate.

`git diff v2.2..HEAD` also disproves one of CONTEXT.md's own `VERIFY:` assumptions: `/template-mty` **did** change since the v2.2 close (8 files, incl. a real feature commit `b76356f2` "richer role-similarity graph"), and `/forma-proposal` picked up 2 files from the LECG brand-palette theme commit (`4638020b`). Neither change is v2.3-requirement work (no ISSUE/PERM/ENG/PIPE panel landed on either page), but neither page is byte-identical to the v2.2 close point either — this needs to be stated precisely in the sign-off/close record, not glossed as "no v2.3 panel landed on either = untouched."

**Primary recommendation:** correct the panel count to 23 before writing the review checklist; use the manual deploy sequence (not `gsd-self-gate.cjs --rebuild`) for the phase's first-plan rebuild; restore `.planning/MILESTONES.md` from git before running `gsd-tools milestone complete v2.3`; never run `gsd-tools state record-session`; run `npm run repo-map` once before relying on `repo-map:check` as evidence.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Panel ordering/curation | Browser/Client (`*TabPanel.tsx`) | — | Pure JSX reorder inside existing client components; no data-layer change |
| Rebuild + deploy | Build/Ops (Task Scheduler, `next build`) | — | `npm run build` + Windows Scheduled Task restart, no app-tier code |
| Gate validation | GSD tooling (`gsd-tools.cjs`, `gsd-self-gate.cjs`) | Ops (Task Scheduler probe) | Node scripts running outside the Next.js runtime, reading/writing `.planning/*` |
| Owner sign-off capture | Human process (Claude Discretion checklist) | Docs (`23-VERIFICATION.md`) | Not a code artifact — a structured conversational review recorded to disk |
| Milestone-close writes | GSD tooling (`.planning/*` files) | — | `MILESTONES.md`, `ROADMAP.md` archive, `STATE.md`, `PROJECT.md` — all planning-layer, zero app-tier change |

No capability in this phase touches API/Backend or Database/Storage tiers — this is the expected shape for a milestone-closing gate.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Rebalancing panel counts across tabs is an explicitly REJECTED goal.** The apparent "imbalance" (Projects 6, Users 2, Compare 1) is a false problem: a tab with two strong panels is not broken, and padding thin tabs to even out arithmetic is manufactured work.
- **Tab order is CORRECT as-is and does not change:** Overview → Roles → Users → Companies → Projects → Compare. It encodes a widening-to-narrowing funnel. **Overview leads the workshop.**
- **Nothing gets cut or demoted.** Every panel answers a distinct question and earns its place. Curation is ordering, not deletion.
- **Net remaining curation work:** verify each tab leads with its strongest panel, and reorder *within* a tab only where it does not. A zero-diff curation result is a legitimate, successful outcome — do not invent reordering.
- Owner reviews **all panels across all 6 tabs**, one at a time, on a rebuilt `:3000`. This is the last gate before milestone close.
- **`/users` is IN SCOPE for sign-off** (verification only, no curation edits). Its 2026-07-13 off-roadmap changes (directory summary tiles, external collaborators, affiliation filter, company column) have never been reviewed.
- **`IssueTypeChart` gets explicit attention.** It is the only panel in v2.3 with zero recorded owner UAT.
- **Findings triage:** fix in Phase 23 = copy/label/ordering/visual defects touching no loader and adding no data. Defer to v2.4 = anything needing a new loader/chart/data source/schema change, recorded as a milestone seed, not built.
- **Explicit goal: keep the milestone CLOSEABLE.** Do not insert a Phase 23.1.
- **Rebuild `:3000` is the FIRST plan of the phase**, before any review. Standard sequence: Task Scheduler stop → `npx tsc --noEmit` → `npm run build` → restart → `/api/health` 200 probe. No isolated `:3100` preflight this time — the review target IS `:3000`.
- Preserve the 6-tab IA, zinc theme, existing chart/theme utilities, all existing loaders. No new WebGL on data surfaces. `/users/spatial-graph` untouched.
- Explicit-path commits with `git diff --cached --name-only` proof (branch carries heavy unrelated WIP).
- **No data changes in this phase.** No new loaders, no new Prisma queries, no schema edits, no backfills.
- If the owner disputes a NUMBER (not a label) during review, that is a data-truth finding — triage as v2.4 work unless the cause is a display bug.

### Claude's Discretion

- Whether any within-tab reorder is actually warranted (and the exact ordering if so).
- The structure/format of the graph-by-graph review checklist handed to the owner.
- Milestone-close artifact mechanics: MILESTONES.md entry, STATE snapshot, PROJECT.md Active → Validated promotion, ROADMAP v2.4 seeds, config reset.
- Whether to run `scripts/gsd-self-gate.cjs --phase 23 --rebuild` as the gate driver vs. the manual deploy sequence.

### Deferred Ideas (OUT OF SCOPE)

- **Any new panel, loader, or data source surfaced during the review** → v2.4 seeds. Do not build in this phase.
- **Playwright/dev-server infra fix** (carried from 20.1-07): `playwright.config.ts`'s `webServer.command` hardcodes `next dev --webpack`, which 500s on this machine; `--turbopack` deterministically corrupts CSS. E2e specs needing a dev server remain blocked. Belongs in a future infra phase.
- **Phase 17 SPLIT-04 owner visual sign-off** (carried from v2.2): accepted on a test-basis/DOM-golden basis only; no production code mounts the surface. Out of v2.3 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

None new — Phase 23 carries zero new requirement mapping. It is the milestone-closing curation/verification gate that collectively closes ISSUE-01–05, PERM-01, ENG-01, and PIPE-01 (all already `Complete` in `.planning/REQUIREMENTS.md`, traceability table confirms 8/8 mapped, Phase 23 row explicitly states "no new requirement mapping"). This research supports the *verification* of that closure, not new implementation.
</phase_requirements>

## Standard Stack

Not applicable — zero new libraries, zero new npm dependencies (CONTEXT.md locked: "No data changes in this phase"). All tooling used is already in the repo: `next build`/`next start`, `vitest`, `npx tsc`, the repo's own `scripts/repo-map/check.cjs`, and `.claude/gsd-core/bin/gsd-tools.cjs`.

## Package Legitimacy Audit

Not applicable — this phase installs no external packages.

---

## A. Live Panel Inventory + Within-Tab Render Order

**CONTEXT.md's count is wrong by 1: the true total is 23 panels, not 22.** Verified by reading all six `*TabPanel.tsx` files under `app/(dashboard)/access-analysis/components/` in full this session.

### Overview — 5 panels (OverviewTabPanel.tsx) — CONTEXT.md count CONFIRMED correct

| # | Panel | Mount (file:line) | Gate |
|---|-------|--------------------|------|
| 1 | Activity over time | `OverviewTabPanel.tsx:63-78` | `timelineRows ?` |
| 2 | Activity by module | `OverviewTabPanel.tsx:83-145` | always (moduleSummary required) |
| 3 | Activity share by project (left of 2-up row) | `OverviewTabPanel.tsx:155-166` | `projectActivitySummary` |
| 4 | Provisioned modules (right of 2-up row) | `OverviewTabPanel.tsx:167-177` | `provisionedModuleSummary` |
| 5 | Ingest freshness | `OverviewTabPanel.tsx:183` | `ingestFreshness !== undefined` |

**Top panel: Activity over time.** This is the account-wide activity shape — correctly leads.

### Roles — 6 panels (RolesTabPanel.tsx) — **CONTEXT.md count is WRONG (claimed 5)**

CONTEXT.md's Evidence table lists: "Role distribution · Activity by role · Permission volume by level · Activity recency by role · Folder action heatmap" — **5 names, omitting "Folder Activity by Role"** (`FolderActivityReveal`), which is a distinct, separately-gated, `PremiumSurface`-wrapped panel that renders directly above the folder-action heatmap, not part of it. Verified independently:

```
grep -n "PremiumSurface|export function" FolderActivityReveal.tsx FolderActionHeatmap.tsx
→ FolderActivityReveal.tsx:95   <PremiumSurface variant="base" ...>
→ FolderActionHeatmap.tsx:142   <PremiumSurface variant="base" ...>
```

Two separate `PremiumSurface` mounts, two separate top-level `<Reveal>` wraps in `RolesTabPanel.tsx` (lines 183-193 and 197-200). These are two panels, not one.

| # | Panel | Mount (file:line) | Gate |
|---|-------|--------------------|------|
| 1 | Role distribution | `RolesTabPanel.tsx:91-111` | always |
| 2 | Activity by role | `RolesTabPanel.tsx:114-136` | `activityActorRows` |
| 3 | Permission volume by level | `RolesTabPanel.tsx:140-156` | `loadPermissionLevel` |
| 4 | Activity recency by role | `RolesTabPanel.tsx:159-179` | `loadActivityRecency` |
| 5 | **Folder Activity by Role** (`FolderActivityReveal`) | `RolesTabPanel.tsx:183-193` | `loadFolderRanking && loadFolderDetail` |
| 6 | Folder action heatmap (`FolderActionHeatmap`) | `RolesTabPanel.tsx:197-200` | `loadFolderActionMatrix` |

**Top panel: Role distribution.** Both lazy folder panels (5, 6) are documented "collapsed by default" (component doc comment, `RolesTabPanel.tsx:181-182,195-196`) — this is existing lazy-mount behavior, not a curation change to make.

### Users — 2 panels (UsersTabPanel.tsx) — CONTEXT.md count CONFIRMED correct

| # | Panel | Mount (file:line) | Gate |
|---|-------|--------------------|------|
| 1 | Users by permission level (`PermissionUsersDonut`) | `UsersTabPanel.tsx:135-151` | `loadPermissionUsers` |
| 2 | Activity recency detail (DataTable) | `UsersTabPanel.tsx:153-201` | always (component returns `null` above this if `loadActivityRecency` absent) |

**Top panel: Users by permission level** (when present, which is the normal case).

### Companies — 3 panels (CompaniesTabPanel.tsx) — CONTEXT.md count CONFIRMED correct

| # | Panel | Mount (file:line) | Gate |
|---|-------|--------------------|------|
| 1 | Users by company | `CompaniesTabPanel.tsx:66-86` | always |
| 2 | Activity by company | `CompaniesTabPanel.tsx:89-111` | `activityActorRows` |
| 3 | Folder activity by company | `CompaniesTabPanel.tsx:115-138` | `loadFolderScopedActivity && loadCompanyFolderBreakdown` |

**Top panel: Users by company.**

### Projects — 6 panels (ProjectsTabPanel.tsx) — CONTEXT.md count CONFIRMED correct (workflow-tools counted as one 4-donut panel)

| # | Panel | Mount (file:line) | Gate |
|---|-------|--------------------|------|
| 1 | Issue data coverage | `ProjectsTabPanel.tsx:71-88` | `coordinationData?.issueCoverage` |
| 2 | Issues over time | `ProjectsTabPanel.tsx:91-110` | `loadIssueFunnel` |
| 3 | Issues by status | `ProjectsTabPanel.tsx:113-132` | `loadIssueFunnel` |
| 4 | Issues by type (`IssueTypeChart` — the never-UAT'd panel) | `ProjectsTabPanel.tsx:135-154` | `loadIssueFunnel` |
| 5 | Workflow tools (Reviews/Transmittals/RFIs/Submittals, 4 donuts, one panel shell) | `ProjectsTabPanel.tsx:160-181` | `workflowToolsLoading \|\| workflowToolSummaries` |
| 6 | Model Coordination | `ProjectsTabPanel.tsx:184-200` | `coordinationData` |

**Top panel: Issue data coverage** — correct, matches the locked "coverage precedes metric" convention (comment at `ProjectsTabPanel.tsx:26-31`).

### Compare — 1 panel (CompareTabPanel.tsx) — CONTEXT.md count CONFIRMED correct

| # | Panel | Mount | Gate |
|---|-------|-------|------|
| 1 | Folder permission terrain | `CompareTabPanel.tsx:37-52` | `terrainProjects && terrainProjects.length > 0 && loadTerrain && loadOverview` |

### Corrected total

| Tab | CONTEXT.md count | Verified count |
|---|---|---|
| Overview | 5 | 5 ✓ |
| Roles | 5 | **6** ✗ (missing "Folder Activity by Role") |
| Users | 2 | 2 ✓ |
| Companies | 3 | 3 ✓ |
| Projects | 6 | 6 ✓ |
| Compare | 1 | 1 ✓ |
| **Total** | **22** | **23** |

**Planner action:** update the panel count everywhere it's cited (the review checklist, any milestone-close prose) to 23, and add "Folder Activity by Role" as its own line item in the Roles-tab review — it was never reviewed as a distinct panel because it was never counted as one.

**On the curation question itself** ("does each tab lead with its strongest panel?"): every verified top-of-tab panel above already matches its tab's stated purpose (Overview→activity shape, Roles→role distribution, Users→permission level, Companies→company distribution, Projects→coverage-precedes-metric). Research finds no evidence compelling a within-tab reorder — consistent with CONTEXT.md's own expectation that curation "is nearly a no-op." Whether to reorder anything is Claude's discretion per the locked decision; the research does not find a case for it.

---

## B. Build Drift — Does `:3000` Match Branch HEAD?

**No, and the gap is large enough that a rebuild is mandatory, not precautionary.**

Evidence (all read-only, no rebuild/stop performed):

```
git log -1 --format="%H %ci"
→ e7a64f9cc5178fc73f12e925f61b65eccf888d18 2026-07-14 09:31:12 -0600   (current HEAD)

.next/BUILD_ID mtime  → Monday, July 13, 2026 4:13:05 PM   (build produced 2026-07-13 16:13)
.next/ dir mtime      → Monday, July 13, 2026 4:13:17 PM
```

`scripts/start-local.ps1` (the Task Scheduler entrypoint, `.claude/skills/lecg-dashboard/references/deploy-sequence.md` confirms it drives production) runs `npx prisma migrate deploy`, then checks `Test-Path .next\BUILD_ID` — if present, it **skips building** and goes straight to `npm start` (production server serving the existing `.next`). So `:3000` is definitely serving the `.next` build stamped 2026-07-13 16:13, not anything built since.

Commit-timestamp cross-check:

```
874565b6  2026-07-13 11:58:26 -0600  feat(access-analysis): roles-per-level strip + no-activity-in-a-year callout   → BEFORE the 16:13 build
b0ce345f  2026-07-14 09:20:01 -0600  feat(access-analysis): workflow-tools donuts (Reviews/Transmittals/RFIs/Submittals)  → AFTER the 16:13 build, by commit timestamp
```

STATE.md documents (not independently re-verified by this session, cited as prior-session evidence) that the workflow-tools donuts code was "deployed-but-uncommitted since 2026-07-13" — i.e. the code likely existed in the working tree at build time even though its `git commit` landed the next morning. That still does not prove parity: `git status --short` (this session) shows **~100 files** with uncommitted `M`/`D` changes across `app/(dashboard)/access-analysis/*` and `app/(dashboard)/users/*` (e.g. `moduleOverrides.ts`, `roleActivityCounts.ts`, `activityRecencyCounts.ts`, `folderActivityByCompanyCounts.ts`, `issueFunnelCounts.ts`, plus several deleted `app/(dashboard)/users/*.tsx` files) that exist in the CURRENT working tree but cannot be dated relative to the 2026-07-13 16:13 build — there is no git history for uncommitted changes, so it is impossible to know from evidence alone whether today's working tree matches what `.next` was built from.

**Conclusion:** the served build is definitively stale relative to `git log` HEAD (missing the docs-only commits at minimum, and likely missing the actual `b0ce345f` code if it wasn't yet in the working tree at 16:13), AND the current working tree itself has diverged further from that build via ~100 uncommitted file changes of unknown timing. **CONTEXT.md's locked decision to rebuild `:3000` FIRST, before any review, is correct and necessary** — this is not a case where the rebuild could be skipped as redundant.

**Task Scheduler state (read-only check, this session):** `LECG Dashboard Local` = `Running`, `LECG Postgres Local` = `Ready` (normal for a logon-triggered task once its process is up), port 3000 is `Listen`ing. The site is live and servable right now on the stale build — the rebuild will cause the documented brief downtime window.

---

## C. `scripts/gsd-self-gate.cjs` — Read In Full, 596 Lines, Real (Not a Stub)

### What it does, exactly, in order

1. Parses `--phase`, `--rebuild`, `--route`, `--strict-health`, `--json`, `--no-report`.
2. Reads `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/config.json`.
3. **`validateConfig`**: requires `workflow.nyquist_validation === true`, `workflow.ai_integration_phase === true`, `workflow.build_command` must NOT match `/npm\s+run\s+build/`, warns (non-fatal) if `workflow.human_verify_mode !== "end-of-phase"`. **Current `.planning/config.json` passes all of these** (`nyquist_validation: true`, `ai_integration_phase: true`, `build_command: "npx tsc --noEmit"`, `human_verify_mode: "end-of-phase"` — read this session).
4. **`validateStateAgainstRoadmap`**: `extractRoadmapPhases()` regex-scans the **entire** ROADMAP.md for every `- [ ]/[x] **Phase N: Title** - ...` line, across **all milestones** (v2.1 through v2.3), not just the active one. Verified by direct grep this session: **17 total phase-checkbox lines, 15 checked (`[x]`), 2 unchecked — Phase 22 and Phase 23.** It then requires `STATE.md` frontmatter `progress.total_phases === 17` and `progress.completed_phases === 15` (once Phase 22 is checked) — but STATE.md's frontmatter is **intentionally milestone-scoped**: `total_phases: 6`, `completed_phases: 5`. **This will always fail** under the script's current logic, independent of any Phase 22/23 checkbox fix, because the script counts cumulatively across the whole roadmap history and STATE.md counts only the active milestone. Also requires `frontmatter.status` to be one of a fixed lifecycle set (`planning, in_progress, executing, verifying, complete, completed, blocked, not_started, "not started"`) — **current STATE.md has `status: active`, which is NOT in that set**, so this check fails today regardless of anything else.
5. **`validatePhaseArtifact`**: requires the target phase's ROADMAP checkbox to be `[x]` AND a `{phase}-VERIFICATION.md` file to exist with frontmatter `status` in `{passed, owner_approved, owner-approved, approved, complete}`. **Confirmed this session (`ls` on every phase dir):** Phase 22 has no `22-VERIFICATION.md`; Phase 23 has none yet either (expected — phase hasn't started). If `--phase` is omitted, it defaults to the **last `[x]`-checked** phase in ROADMAP — currently Phase 21.1 (since 22/23 are unchecked), which DOES have a `21.1-VERIFICATION.md` and would pass this specific gate, but would infer the WRONG routes (see below) and validate against the wrong phase entirely.
6. **`validateGsdHealth`**: shells out to `gsd-tools.cjs query validate.health`. **Confirmed this session: `{"status":"healthy","errors":[],"warnings":[]}`** — this gate currently passes.
7. **Route inference**: `inferRoutesForPhase()` always includes `/api/health`, then regex-scans the **ROADMAP Phase-N section text only** (not CONTEXT.md, not STATE.md) for literal `/users`, `/access-analysis`, `/template-mty`, `/forma-proposal` substrings. The Phase 23 ROADMAP section (read this session) mentions `/access-analysis` (criterion 1) and `/template-mty` (criterion 2, "and `/template-mty` if any v2.3 panel landed there") but **does NOT mention `/users` anywhere** — so the auto-inferred route set for `--phase 23` is `{/api/health, /access-analysis, /template-mty}`, **missing `/users`**, even though CONTEXT.md explicitly puts `/users` in sign-off scope. `--route /users` must be passed explicitly.
8. **If `--rebuild`**: stops the Windows Scheduled Task (checks `LECG Dashboard Local` then `LECG Dashboard`, matching `deploy-sequence.md`'s documented task name), kills anything still bound to port 3000, runs `npx tsc --noEmit` (restart-and-abort on failure), runs `npm run build` (restart-and-abort on failure), restarts the scheduled task, then polls the inferred routes up to 90s waiting for all to return `status < 500`. This is functionally identical to the manual deploy sequence, automated — **and it stops the task before building, matching the CRITICAL "never build while `:3000` is live" rule.**
9. **Important:** the rebuild step runs **unconditionally** when `--rebuild` is passed, regardless of whether the earlier config/state/phase-artifact/health gates already failed — those failures just accumulate into the final report. So `--phase 23 --rebuild` run today would actually perform a real rebuild+restart+route-probe, but the JSON report's `ok` field would be `false` because of the ROADMAP-checkbox/VERIFICATION.md/STATE-count failures above.
10. Writes a report to `{phaseDir}/{phase}-SELF-GATE.json` (or `-SELF-GATE-CHECK.json` without `--rebuild`).

### Recommendation: use it as the FINAL milestone-close gate, not the first-plan rebuild

The script's `validatePhaseArtifact` structurally cannot pass for an in-progress phase (it requires the ROADMAP checkbox AND a VERIFICATION.md that only exist once the phase is already verified). Using it for the plan 23-01 pre-review rebuild would perform the rebuild correctly but always report `FAIL`, which is a confusing, misleading artifact for no benefit over the manual sequence.

**Recommended sequencing:**

- **Plan 23-01 (first plan, pre-review rebuild):** use the manual deploy sequence from `.claude/skills/lecg-dashboard/references/deploy-sequence.md` (Task Scheduler stop → `npx tsc --noEmit` → `npm run build` → restart → `/api/health` probe). Do not use `gsd-self-gate.cjs` here.
- **Final plan (milestone close):** after (a) `git checkout -- .planning/ROADMAP.md`-equivalent fix marking Phase 22 AND Phase 23 checkboxes `[x]`, (b) writing `22-VERIFICATION.md` and `23-VERIFICATION.md` with an accepted `status`, and (c) accepting that STATE.md's milestone-scoped `progress` block will not satisfy the script's cumulative-count check as currently written (a real, pre-existing tool/convention mismatch, not something Phase 23 can fix without editing the script itself — out of scope for this phase), run:
  ```
  node scripts/gsd-self-gate.cjs --phase 23 --route /users --rebuild
  ```
  as a fail-**documented** (not fail-closed, given the known state-count mismatch) final gate — inspect its JSON report for the config/health/route results specifically, and treat the STATE-count failure as a known, pre-existing tooling gap to note in the phase's verification record rather than a real regression.

---

## D. Test-Suite Baseline

Both commands run live this session (read-only, no code changed):

```
npx tsc --noEmit          → exit 0, no output (clean)

npm test                  → Test Files  329 passed | 1 skipped (330)
                             Tests       2535 passed | 1 skipped (2536)
                             Duration    46.13s
```

**0 failures in this run.** The documented `physicsLayer.test.ts` isolation flake (`app/(dashboard)/users/access-analysis/physicsLayer.test.ts`, logged in `22-issue-type-resolution/deferred-items.md`) **did not reproduce** in this full-suite run — consistent with its own documentation ("passes in isolation, fails only under full-suite run ordering/shared-state pressure" — i.e. intermittent, not deterministic). Confirmed separately by running it alone:

```
npx vitest run "app/(dashboard)/users/access-analysis/physicsLayer.test.ts"
→ Test Files  1 passed (1)
  Tests       45 passed (45)
```

**Honest framing for the planner:** the current baseline is 100% green, but the flake is documented as order-dependent — a re-run under different machine load could still surface it. If Phase 23's own gate run shows exactly 1 failure and it's this file, that matches the known, already-logged, non-blocking pattern; if any OTHER file fails, that is a new finding requiring triage before close (per CONTEXT.md's data-truth findings-triage rule).

**TEST-01/02/03 byte-identical check** (criterion #3, "characterization tests TEST-01/02/03 stay byte-identical"):

```
git diff v2.2 -- lib/server/acc-hot-cache.test.ts                                    → empty (TEST-01, OOM guard)
git diff v2.2 -- lib/server/__tests__/folderPermissionTerrainView.test.ts             → empty (TEST-02)
git diff v2.2 -- lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts       → empty (TEST-03)
git status --short (all three)                                                       → clean, not in the dirty working tree either
```

All three are byte-identical since the `v2.2` tag (`5974d6f2`) — criterion #3's byte-identical requirement is currently satisfied. **Gate command for the plan:** re-run the same three `git diff v2.2 -- <path>` commands as evidence at close time.

---

## E. v2.3 Scope-Fence Evidence

**Base commit used: the `v2.2` tag (`5974d6f2`, "chore: close v2.2 Structural Refactors milestone")** — this is the last commit before the v2.3 milestone opened (`.planning/PROJECT.md` confirms v2.3 opened 2026-07-02, immediately after v2.2 shipped 2026-07-02), so `git diff v2.2..HEAD` captures exactly the v2.3-milestone-timeframe committed history. (This does NOT capture the ~100 files of *uncommitted* working-tree WIP — that is a separate, larger, unscoped set; git diff against a tag can only reason about commits.)

### 1. No new WebGL/R3F import on `/access-analysis`

```
git diff v2.2..HEAD -- "app/(dashboard)/access-analysis/" | grep -iE "^\+.*(three|@react-three|r3f|webgl)"
→ only prose/comment/test-name matches containing the English word "three" (e.g. "the three lazy loaders",
  "the three ENG-01/PERM-01/UAT-6 loaders") — zero real import statements.
```
**Confirmed: no new WebGL import landed on `/access-analysis` since v2.2.**

### 2. `/users/spatial-graph` untouched

```
git diff --stat v2.2..HEAD -- "app/(dashboard)/users/spatial-graph"
→ (empty output)
```
**Confirmed: zero committed changes to `/users/spatial-graph` across the whole v2.3 milestone.**

### 3. Did `/template-mty` or `/forma-proposal` receive ANY v2.3-era change? — **YES to both. CONTEXT.md's assumption needs correction.**

```
git diff --stat v2.2..HEAD -- "app/(dashboard)/template-mty/"
→ 8 files changed, 379 insertions(+), 263 deletions(-)
  (permissionAccess.test.ts, ModuleAccessChart.tsx, PermissionAccessChart.tsx,
   RoleSimilarityGraph.tsx [+263 net], TemplateAnalysisCharts.tsx, moduleAccess.ts,
   permissionAccess.ts, roleSimilarity.ts)

git log v2.2..HEAD --oneline -- "app/(dashboard)/template-mty/..."
→ 116941af refactor(structure): move route-owned shared modules to lib/acc (BND-03 groups 3+4)
  2e15233f fix(template-mty): role-similarity labels stay glued to their nodes
  b76356f2 feat(template-mty): richer role-similarity graph — cluster blobs, curved edges, similarity %
  0aa4a58d test(template-mty): align permission-access ranks with the 6-tier legend

git diff --stat v2.2..HEAD -- "app/(dashboard)/forma-proposal/"
→ 2 files changed, 3 insertions(+), 3 deletions(-)
  (FormaParticleAccent.tsx, HierarchyCanvas.tsx)

git log v2.2..HEAD --oneline -- "app/(dashboard)/forma-proposal/"
→ 4638020b feat(theme): apply LECG brand palette across chart tokens and workshop accents
```

**Correction to CONTEXT.md:** none of these five commits map to a v2.3 requirement (ISSUE-01–05/PERM-01/ENG-01/PIPE-01) — CONTEXT.md's narrow claim ("no v2.3 panel landed on either") is technically true. But the broader implication ("Not in scope... not touched") is **false**: `/template-mty` received a real feature commit (`b76356f2`, cluster-blob role-similarity graph richness) plus a bug fix, and `/forma-proposal` received a cross-cutting theme commit. `RoleSimilarityGraph.tsx`'s imports were checked — `react`, `next-themes`, `framer-motion`, ECharts helpers, and `TIER_COLORS`/`TIER_LEGEND` from `access-analysis/folderTerrain` — **no `three`/`@react-three`/`@cosmos.gl` import, so no new WebGL was introduced there either.**

**Recommendation for the phase/close record:** state precisely — "no v2.3-*requirement* panel landed on `/template-mty` or `/forma-proposal`; both pages did receive off-roadmap commits during the v2.3 window (role-similarity graph enhancement, brand-palette theme pass) that are outside this phase's scope to review or revert." Do not write "untouched" — that claim is now disproven by evidence, and a future reader/owner spot-check would catch the discrepancy.

### 4. `node scripts/repo-map/check.cjs` — currently FAILS (exit 1), pre-existing baseline drift, not new

```
node scripts/repo-map/check.cjs
→ WARN: dependency-cruiser has 2 warning(s).
  WARN: ast-grep has 267 finding(s), checked against baseline for blocking rules.
  ERROR: dependency-cruiser baseline references missing file: scripts/diag-activity-coordination.cjs.
  ERROR: dependency-cruiser baseline references missing file: scripts/diag-activity-module-audit.cjs.
  ERROR: dependency-cruiser baseline references missing file: scripts/diag-activity-types.cjs.
Exit code: 1
```

Root-caused this session:

```
git log --oneline --diff-filter=D -- scripts/diag-activity-coordination.cjs scripts/diag-activity-module-audit.cjs scripts/diag-activity-types.cjs
→ b95bf5c7 chore(cleanup): delete 18 spent one-shot scripts   (2026-07-10 15:45:51 -0600, after v2.2 tag)
```

The three scripts were legitimately deleted in an off-roadmap cleanup commit; only `scripts/diag-activity-service-xtab.cjs` still exists (confirmed via `ls`). The `dependency-cruiser` baseline JSON (`.tools/repo-map/baselines/dependency-cruiser-baseline.json`) was never regenerated after that deletion, so `check.cjs` now fails on stale file references — **not** on any real new boundary violation or WebGL/spatial-graph regression.

**Planner action:** run `npm run repo-map` (full regeneration) once, early in the phase, before relying on `npm run repo-map:check` as evidence for criterion #4. Otherwise every gate run will show 3 false ERRORs unrelated to Phase 23's actual scope.

---

## F. Milestone-Close Artifact Mechanics

Traced end-to-end by reading `.claude/gsd-core/bin/lib/milestone.cjs` (the compiled source behind `gsd-tools.cjs milestone complete`) this session — not guessed.

### The command

```
node .claude/gsd-core/bin/gsd-tools.cjs milestone complete v2.3 [--name "New Graphs"] [--force] [--archive-phases]
```

(`milestone` has exactly one subcommand: `complete` — confirmed via `gsd-tools.cjs milestone` with no args, which returns `Error: Unknown milestone subcommand. Available: complete`.)

### What it does, read from source

1. **Pre-flight guard** (skippable with `--force`): if `STATE.md`'s `milestone:` frontmatter equals the version being completed (`v2.3` — it does), it scans the ROADMAP's v2.3 section for every `#### Phase N` heading and checks a matching directory exists under `.planning/phases/`. **All 6 v2.3 phase dirs exist** (20, 20.1, 21, 21.1, 22, 23 — confirmed via `ls`), so this guard should pass without `--force`. Note: this guard checks directory **existence**, not the `[x]` checkbox state — Phase 22's unchecked ROADMAP box does NOT block `milestone complete`, but should still be fixed for `gsd-self-gate.cjs` and general documentation accuracy (see Question C).
2. **Archives** `ROADMAP.md` → `.planning/milestones/v2.3-ROADMAP.md` (full copy) and `REQUIREMENTS.md` → `.planning/milestones/v2.3-REQUIREMENTS.md` (with an added archive header), and renames `.planning/v2.3-MILESTONE-AUDIT.md` into the archive dir **if it exists** (it currently does not).
3. **Auto-generates and inserts a new `## v2.3 <name> (Shipped: <date>)` entry into `.planning/MILESTONES.md`**, scanning every `*-SUMMARY.md` across the v2.3 phase dirs for a frontmatter `one-liner` field (falling back to the first line of the body) to build a "Key accomplishments" bullet list, and counting phases/plans/tasks automatically from files on disk.

   **CRITICAL FINDING:** `.planning/MILESTONES.md` **is git-tracked** (`git show HEAD:.planning/MILESTONES.md` returns 38 lines with `## v2.0` and `## v1.0` entries) **but is currently absent from the working tree** — `ls .planning/MILESTONES.md` fails with "No such file or directory." This is part of the branch's documented "`.planning/` migration deletions" WIP (STATE.md Blockers/Concerns: "Branch is `feat/access-analysis-redesign` with heavy uncommitted WIP + the `.planning/` migration deletions in the working tree"). The script's own logic (`if (fs.existsSync(milestonesPath)) {...} else { writeFileSync(...) }`) means that **if `milestone complete` is run against the current working tree, it will silently create a brand-new `MILESTONES.md` containing ONLY the v2.3 entry**, discarding the v2.0/v1.0 history that exists in git HEAD. **Also worth noting: v2.1 and v2.2 were never logged to MILESTONES.md either** (`git show HEAD:.planning/MILESTONES.md` only has v2.0/v1.0 sections) — a pre-existing documentation gap, not something this phase created.

   **Required planner action, in order:** (a) `git checkout -- .planning/MILESTONES.md` to restore the tracked v2.0/v1.0 file BEFORE running `milestone complete`, so the new v2.3 entry is inserted (reverse-chronological, after the header) rather than replacing the file; (b) decide (Claude's discretion, flagged not decided by this research) whether to also backfill v2.1/v2.2 entries by hand in the same edit, since they were never logged and this is the natural point to close that gap.

4. **Updates `STATE.md`**: attempts to replace a body `**Status:**`-style field (via `stateReplaceFieldWithFallback`, which targets bold-markdown body lines, not the YAML frontmatter `status:` key) and to overwrite the entire `## Current Position` section with a generic 4-line "Phase: Milestone v2.3 complete / Plan: — / Status: Awaiting next milestone / Last activity: ..." block, plus append/update an "## Operator Next Steps" section pointing at `/gsd:new-milestone`. It does **not** touch the "## Accumulated Context" bullet history (decisions/lessons list) — that survives. `VERIFY:` whether STATE.md's actual body structure contains a `**Status:**`-pattern line for the replace to target (this session did not trace `stateReplaceField`'s exact regex to confirm a match/no-op); if it's a no-op, the script logs a `[gsd-tools] WARNING:` to stderr rather than failing — the planner should watch for that warning when this step runs and treat the frontmatter `status:` field as needing a manual check/edit regardless.
5. **`--archive-phases`** (optional): moves (renames, does not copy) all 6 v2.3 phase directories into `.planning/milestones/v2.3-phases/`. This matches the documented retention convention from `PROJECT.md` ("Completed v1.0-v2.2 phase and milestone artifacts were removed from the working tree during the repository cleanup") — recommend using it for consistency with prior milestone closes, but this is Claude's discretion per CONTEXT.md, not a locked decision.

### The `state record-session` trap — CONFIRMED, REPRODUCED LIVE THIS SESSION

Per project memory (`feedback_phase_complete_cli_unreliable.md`): "gsd phase complete is unreliable... blanks STATE.md; doesn't write ROADMAP; ALSO `state record-session` corrupts frontmatter (v1.0 mis-stamp); diff+repair STATE after ANY gsd-tools STATE write."

This session ran `node .claude/gsd-core/bin/gsd-tools.cjs state record-session` while probing tooling (an error on this researcher's part — the command executes rather than merely showing usage when invoked without a subcommand argument). The result, confirmed via `git diff -- .planning/STATE.md`:

```diff
-current_phase: 23
-current_phase_name: Workshop Curation & Milestone Close
+current_phase: 20
+current_phase_name: COMPLETE, 5/5 plans
```

Frontmatter was mangled — `current_phase` regressed from `23` to `20`, and `current_phase_name` was overwritten with a garbage value (`"COMPLETE, 5/5 plans"`, clearly a body-text fragment misassigned to a title field). Reverted immediately with `git checkout -- .planning/STATE.md` before continuing research; verified clean afterward.

**This is now directly reproduced, not just documented from memory.** The planner must **not** call `gsd-tools state record-session` at any point in Phase 23 execution or close. Any STATE.md write performed by GSD tooling (`milestone complete`, `phase complete`, or any other STATE-touching command) must be diffed against the pre-write version and manually repaired if frontmatter fields are wrong, per the standing memory guidance — this session's reproduction confirms that guidance is still accurate and current.

---

## G. Owner Sign-Off Review Structure

Concrete checklist STRUCTURE (columns only — content is the planner's/owner's job), grounded in what the panels actually show, verified this session:

| Column | Purpose | Source of truth |
|---|---|---|
| Tab | Which of the 6 tabs | Section headers above |
| Panel name | Exact on-screen title | `SectionHeader title=` prop at each mount site cited in Question A |
| Question answered | What the panel tells the presenter | `SectionHeader subtitle=` prop (already written, descriptive, in every panel — e.g. `ProjectsTabPanel.tsx:99-100` "When are issues actually being raised?") |
| Data source / coverage authority | Which loader + coverage badge | `ActivityCoverageBadge` presence (activity-derived panels only — membership panels like Role/Company distribution correctly have none, per the existing convention documented in-code, e.g. `RolesTabPanel.tsx:90` comment "membership (not activity-derived → no coverage badge)") |
| Known caveat | Honest-labeling text already in source | See honesty-label citations below |
| First-run verdict | Owner's live call | Free text / approved-with-notes / defer-to-v2.4 |

### Honesty labels named in CONTEXT.md §data_truth — verified present in source, file:line

| Label | File:line | Verified text |
|---|---|---|
| Workflow-tools DC-only caption | `ProjectsTabPanel.tsx:165` | "RFI and Submittal events come only from the batch Data Connector feed (the live feed does not report them), so recent weeks may lag." |
| Issue-coverage captions (fetched/total/unavailable, live-computed) | `issueFunnelCounts.ts:132` (`deriveIssueCoverageCaption`, exported function) | Consumed live by `IssueTimelineChart`/`IssueStatusChart`/`IssueTypeChart` via `coverageProjects` prop — never a hardcoded figure (grep-confirmed no literal coverage numbers in the three chart components) |
| `IssueTypeChart` "Unknown type"/"No type set" guards | `issueTypeCounts.ts:30` (`UNKNOWN_LABEL = "Unknown type"`), `issueTypeCounts.ts:32` (`NONE_LABEL = "No type set"`) | Two distinct, ranked, never-pinned buckets (doc comment `issueTypeCounts.ts:15-16` confirms distinctness) |
| `IssueTypeChart` never-backfilled guard | `IssueTypeChart.tsx:97-110` | Renders "Type names not yet backfilled" notice instead of a wall of Unknown-type bars when GUIDs exist but none resolve |
| Module-attribution ⓘ caveat | `OverviewTabPanel.tsx:92-138` (Radix `Tooltip`, `data-testid="module-caveat"` at line 119) | Live service/verb split computed from `moduleSummary.attribution`, division-by-zero guarded (`pct()` helper, line 59) |
| Activity-recency "Never active" band | `UsersTabPanel.tsx:56` (table cell fallback), `UsersTabPanel.tsx:191-197` (two dedicated caption `<p>` elements: `data-testid="activity-recency-detail-coverage-caption"` and `...-semantics-caption`) | "Never active" = no recorded activity in the ACCDS-crawled window (data-floor-qualified when `dataFloor` is present) |

All five CONTEXT.md-named honesty labels exist in source exactly where CONTEXT.md expects them — no correction needed here, only citation.

---

## Architecture Patterns

No new pattern is introduced. Recommended project structure is unchanged — this phase edits ordering inside existing `*TabPanel.tsx` files (if any reorder is found warranted) and writes only `.planning/*` artifacts otherwise. No `Pattern N` sections apply.

### Anti-Patterns to Avoid

- **Trusting CONTEXT.md's panel count without re-verifying against source** — this research found it under-counted by 1 (Roles tab). Any plan/checklist that copies "22 panels" forward without correction will silently under-review one panel.
- **Running `gsd-tools state record-session` mid-phase** — reproducibly corrupts STATE frontmatter (see Question F). Use targeted `state.cjs` field-update paths, or manual edits with diff review, instead.
- **Running `gsd-tools milestone complete v2.3` before restoring `.planning/MILESTONES.md`** — silently fabricates a new file, discarding v2.0/v1.0 history.
- **Treating `gsd-self-gate.cjs`'s FAIL report as blocking during mid-phase rebuilds** — it is structurally unable to pass before the phase is ROADMAP-checked and has a VERIFICATION.md; using it earlier just produces a confusing false-negative.

## Don't Hand-Roll

Not applicable in the traditional sense (no new library-replaceable problem exists in this phase). The closest analogue: don't hand-roll a new milestone-close script or manual MILESTONES.md edit process — `gsd-tools milestone complete` already exists and does the archiving/append correctly once the working-tree-deletion landmine (Question F) is cleared.

## Runtime State Inventory

Not applicable — Phase 23 is not a rename/refactor/migration phase (no string rename, no data migration). Skipped per the trigger condition in the researcher instructions.

## Common Pitfalls

### Pitfall 1: Reviewing against a stale `.next` build

**What goes wrong:** the owner signs off on a surface that doesn't reflect the actual code on disk, and a defect gets shipped believing it was reviewed.
**Why it happens:** `start-local.ps1` only rebuilds if `.next/BUILD_ID` is absent — a stale-but-present build is served forever until an explicit rebuild.
**How to avoid:** rebuild is locked as the FIRST plan of the phase (already in CONTEXT.md) — this research confirms the evidence that makes that lock necessary (16-hour-plus gap between build time and HEAD, ~100 uncommitted files of unknown build-time state).
**Warning signs:** any panel the owner reports as "missing" or "different from what I remember testing" during review — check whether it's simply not in the rebuilt `.next` yet.

### Pitfall 2: Trusting `gsd-self-gate.cjs`'s exit code as the sole pass/fail signal

**What goes wrong:** a legitimate rebuild+deploy succeeds mechanically, but the script's JSON report says `ok:false` because of unrelated ROADMAP/STATE bookkeeping gaps, causing the planner to wrongly believe the deploy itself failed.
**Why it happens:** the script bundles config/state/phase-artifact/health validation with the actual rebuild mechanics in one report, and (as this research found) at least one of those bookkeeping checks (STATE progress counts vs. cumulative ROADMAP checkbox count) cannot currently pass for this repo's milestone-scoped STATE.md convention.
**How to avoid:** read the JSON report's `checks` array, not just top-level `ok` — separate "did the rebuild/route-probe succeed" from "did the bookkeeping gates pass."
**Warning signs:** `ok:false` with `checks` showing all rebuild-phase entries `ok:true`.

### Pitfall 3: Assuming ROADMAP checkbox state reflects reality

**What goes wrong:** Phase 22 is fully shipped (3/3 plans, `SUMMARY.md`s written, STATE.md says complete) but its ROADMAP.md checkbox is still `[ ]` — the exact "checkbox lag" pattern `22-03-SUMMARY.md` itself warns about ("the ROADMAP checkbox and SUMMARY are the only durable signal that a plan closed").
**Why it happens:** a session ended between the last code commit and the close-out write for Phase 22, and the checkbox flip never happened even after STATE.md was later reconciled (2026-07-14).
**How to avoid:** Phase 23 should fix the Phase 22 ROADMAP checkbox to `[x]` as part of its own housekeeping (it is currently the single most concrete, low-risk fix this research surfaced) — verify with `grep -nE '^- \[[ xX]\] \*\*Phase 22:' .planning/ROADMAP.md` before and after.
**Warning signs:** any GSD tool that counts "complete phases" from ROADMAP checkboxes (as `gsd-self-gate.cjs` does) undercounting relative to STATE.md's prose.

## Code Examples

Not applicable — no new code patterns to demonstrate; all citations above are existing-code evidence, not templates for new code.

## State of the Art

Not applicable — no external library/API version questions in this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `stateReplaceFieldWithFallback`'s "Status" target in `milestone complete` may be a no-op against this repo's current STATE.md body structure (not independently traced to a regex match/no-match this session) | F | Low — the script logs a stderr warning either way; worst case the frontmatter `status:` field needs a manual follow-up edit, which the planner should check for regardless |
| A2 | Whether the owner wants v2.1/v2.2 backfilled into MILESTONES.md at the same time as the v2.3 entry, given they were never logged | F | Low-medium — a documentation completeness question, not a correctness risk; flagged for planner/owner decision, not assumed either way |

## Open Questions

1. **Should `.planning/MILESTONES.md`'s v2.1/v2.2 gap be backfilled in this phase, or left as a separate future documentation task?**
   - What we know: the file (as tracked in git HEAD) only has v2.0 and v1.0 entries; v2.1 and v2.2 shipped and were never logged there.
   - What's unclear: whether this is in-scope "milestone-close artifact mechanics" (locked as Claude's discretion by CONTEXT.md) or scope creep beyond v2.3's close.
   - Recommendation: treat as low-cost, high-value — backfill both in the same edit that adds the v2.3 entry, using the existing v2.0 entry's format as the template (phases/plans/tasks stats are recoverable from git history/tags `v2.1`/`v2.2`).

2. **Does the owner want `/template-mty`/`/forma-proposal` added to the sign-off pass, given this research disproved CONTEXT.md's "not touched" assumption?**
   - What we know: both pages received real, committed, off-roadmap UI changes during the v2.3 window (role-similarity graph feature, brand-palette theme).
   - What's unclear: whether those changes have already been informally reviewed/approved outside the GSD phase record (plausible — brand-palette work has a memory entry noting it was applied and deployed 2026-07-06, before this session).
   - Recommendation: surface this precisely to the owner during discuss/plan — "these two pages weren't touched by v2.3 REQUIREMENTS work but did pick up two off-roadmap commits; do you want them in this review pass or are they already covered?" rather than silently expanding or silently omitting.

## Environment Availability

| Dependency | Required By | Available | Version/State | Fallback |
|------------|------------|-----------|---------|----------|
| `LECG Dashboard Local` Scheduled Task | Deploy/rebuild | ✓ | State: Running (checked this session) | — |
| `LECG Postgres Local` Scheduled Task | App DB connectivity | ✓ | State: Ready (logon-triggered, normal) | — |
| Port 3000 | Live review target | ✓ | Listening (checked this session) | — |
| `gsd-tools.cjs` | Milestone-close writes | ✓ | Health: `{"status":"healthy"}` (checked this session) | — |
| `scripts/gsd-self-gate.cjs` | Optional final gate | ✓ | 596 lines, read in full this session | Manual deploy sequence + manual VERIFICATION.md |
| `scripts/repo-map/check.cjs` | Criterion #4 evidence | ✓ (but currently FAILS, stale baseline) | Exit 1 — 3 missing-file ERRORs | `npm run repo-map` full regen before relying on it |

No missing dependencies with no fallback.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` (confirmed this session) — section included per instructions. This is a curation/close phase: the observable signals are gate command exit codes, live-route HTTP probes, git-diff scope proofs, and captured owner sign-off — not unit tests (none of ROADMAP's 4 success criteria describe new business logic).

### Phase Requirements → Observable Verification Map

| ROADMAP Criterion (as reinterpreted by CONTEXT.md) | Observable Signal | Command / Evidence |
|---|---|---|
| #1 — panel review, tab IA already answers the "wall of charts" risk; ordering-only, zero-diff is a pass | Git diff scope proof | `git diff --stat -- "app/(dashboard)/access-analysis/components/*TabPanel.tsx"` at close — either empty (zero-diff pass) or shows only reorder-shaped hunks (no new imports, no new props) |
| #2 — owner sign-off on `/access-analysis` (6 tabs, 23 panels) + `/users`, post-rebuild | Live-route HTTP probe + captured sign-off | `/api/health` returns 200 (or `gsd-self-gate.cjs --rebuild --route /users` route-probe results); owner sign-off checklist (Question G structure) filled and saved to the phase dir |
| #3 — `npm test` green (TEST-01/02/03 byte-identical + all v2.3 aggregate tests), `tsc --noEmit` exits 0 | Gate command exit codes | `npx tsc --noEmit` → exit 0 (confirmed this session); `npm test` → 0 failed (confirmed this session, 2535/1 skipped); `git diff v2.2 -- <TEST-01/02/03 paths>` → empty (confirmed this session) |
| #4 — no new WebGL on `/access-analysis`, `/users/spatial-graph` untouched across the whole v2.3 milestone | Git diff scope proof + repo-map gate | `git diff v2.2..HEAD -- "app/(dashboard)/access-analysis/"` grep for WebGL imports → none (confirmed this session); `git diff --stat v2.2..HEAD -- "app/(dashboard)/users/spatial-graph"` → empty (confirmed this session); `npm run repo-map:check` after a `npm run repo-map` refresh |

### Sampling Rate

- **Per task commit (if any code reorder happens):** `npx tsc --noEmit` (minimal tier per `dashboard-verification-sequence.md`).
- **Per plan:** the relevant tier from `dashboard-verification-sequence.md` — Standard for any shared-module touch (unlikely this phase), Full for any UI/panel-order change, Rebuild tier for the deploy plan.
- **Phase gate:** full `npm test` + `npx tsc --noEmit` green, `npm run repo-map:check` green (after refresh), owner sign-off captured, before `/gsd-verify-work` / milestone close.

### Wave 0 Gaps

None — existing test infrastructure (Vitest, `npx tsc --noEmit`, `npm run repo-map:check`) already covers everything this phase's success criteria require. No new test framework or fixture is needed.

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json` (absent = enabled per instructions), but this phase makes no code change that touches authentication, session management, access control, input validation, or cryptography — it is a curation/ordering + deploy/close phase over already-shipped, already-reviewed panels. No new ASVS category applies. Existing ASVS posture for `/access-analysis` (auth-gated Server Actions, no direct Prisma-in-UI per `CONCERNS.md` §2.1 resolved) is unchanged by this phase and does not need re-verification here.

## Sources

### Primary (HIGH confidence — repo files/commands read or run this session)

- `.planning/phases/23-workshop-curation-milestone-close/23-CONTEXT.md` — locked decisions, discretion, deferred ideas
- `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` — full reads
- `.planning/codebase/CONCERNS.md` — full read, boundary-risk cross-check
- `.claude/skills/lecg-dashboard/references/deploy-sequence.md`, `dashboard-verification-sequence.md` — full reads
- `.planning/phases/22-issue-type-resolution/deferred-items.md`, `22-03-SUMMARY.md` — full reads
- `app/(dashboard)/access-analysis/components/{Overview,Roles,Users,Companies,Projects,Compare}TabPanel.tsx` — full reads, line-cited
- `app/(dashboard)/access-analysis/components/FolderActivityReveal.tsx`, `FolderActionHeatmap.tsx` — grepped for panel-shell confirmation
- `app/(dashboard)/access-analysis/issueTypeCounts.ts`, `IssueTypeChart.tsx`, `issueFunnelCounts.ts` — grepped for honesty-label citations
- `scripts/gsd-self-gate.cjs` — full 596-line read
- `scripts/start-local.ps1` — full read
- `.claude/gsd-core/bin/lib/milestone.cjs` — full read
- Commands run live this session: `git log`, `git show`, `git diff`, `git status`, `npx tsc --noEmit`, `npm test`, `npx vitest run` (isolated flake test), `node scripts/repo-map/check.cjs`, `node .claude/gsd-core/bin/gsd-tools.cjs query validate.health`, `Get-ScheduledTask`/`Get-NetTCPConnection` (PowerShell), and the accidental-then-reverted `state record-session` reproduction

### Secondary (MEDIUM confidence)

- STATE.md's claim that workflow-tools donuts were "deployed-but-uncommitted since 2026-07-13" — cited as prior-session documentary evidence, not independently re-verified against a historical filesystem snapshot (impossible to verify after the fact)

### Tertiary (LOW confidence)

- None — all substantive claims in this document trace to a file read or command run in this session, or are explicitly marked `VERIFY:`

## Metadata

**Confidence breakdown:**
- Panel inventory (Question A): HIGH — full source reads of all 6 TabPanel files, cross-checked against CONTEXT.md's own table
- Build drift (Question B): HIGH for the stale-build fact (BUILD_ID mtime vs. HEAD commit time is unambiguous); MEDIUM for "is the working tree the same as build time" (cannot be proven from git alone, working-tree diffs are undated)
- Gate tooling (Question C): HIGH — full script read, all claims traceable to specific line ranges
- Test baseline (Question D): HIGH — commands run live this session with captured output
- Scope-fence (Question E): HIGH — git diff/log commands run live this session with captured output
- Milestone-close mechanics (Question F): HIGH — full script source read; MEDIUM on the one unresolved `stateReplaceField` body-matching detail (flagged `VERIFY:`)
- Owner sign-off structure (Question G): HIGH — every cited honesty label was grepped/read in source this session

**Research date:** 2026-07-14
**Valid until:** This research is time-sensitive to the exact working-tree/build state observed 2026-07-14 (build drift, uncommitted file list, test-suite pass). Re-verify Questions B and D immediately before executing plan 23-01 if any session gap occurs between this research and phase execution — do not treat the build-drift/test-pass evidence as durable beyond the current session.

## Dashboard self-check

- **Context:** `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/codebase/CONCERNS.md`, `23-CONTEXT.md`, `22-*-SUMMARY.md`/`deferred-items.md`, `deploy-sequence.md`, `dashboard-verification-sequence.md` — all read this session, all current (no stale/missing flags needed).
- **Evidence:** every path, line number, commit hash, and command output cited above was read or run in this session (see Sources). No invented routes/APIs/tRPC procedures/packages — this phase touches none.
- **Constraints applied:** zinc theme/no-new-WebGL verified via import grep (not assumed); `/users/spatial-graph` out-of-scope boundary verified via empty git diff; explicit-path-only git posture maintained throughout (single accidental `state record-session` write was reverted via `git checkout -- .planning/STATE.md`, explicit single path, no `-A`/`.`).
- **Gates:** `npx tsc --noEmit` (exit 0), `npm test` (2535/1/0), `node scripts/repo-map/check.cjs` (exit 1, root-caused as stale baseline, not a real violation) all run live this session as research evidence, not as phase-completion claims.
- **VERIFY:** (1) whether `stateReplaceFieldWithFallback`'s "Status" body-field match succeeds or no-ops against this repo's current STATE.md structure during `milestone complete` — check the stderr output when that command runs; (2) whether the owner wants `/template-mty`/`/forma-proposal` added to sign-off scope given the disproven "untouched" assumption (Open Question 2); (3) whether v2.1/v2.2 should be backfilled into MILESTONES.md alongside v2.3 (Open Question 1).
