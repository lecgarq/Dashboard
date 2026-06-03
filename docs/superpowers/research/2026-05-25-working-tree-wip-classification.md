# Working-Tree WIP Classification (2026-05-25)

> **Status:** Read-only research report. **No cleanup applied.** Nothing staged, restored, reset,
> deleted, or committed in producing this. This document is the *only* file written.
> **Author:** Terminal **T2** (docs-only). **Boundary:** T1 owns P7 planning + graph implementation;
> those files are listed in §8 as **do-not-touch**.
> **Companions:** [`../workflows/surgical-staging-workflow.md`](../workflows/surgical-staging-workflow.md) ·
> [`../workflows/multiterminal-coordination-workflow.md`](../workflows/multiterminal-coordination-workflow.md) ·
> [`../codebase-map/active-wip-boundaries.md`](../codebase-map/active-wip-boundaries.md).

## Purpose

Classify the large uncommitted working tree on `feat/access-analysis-redesign` into safe categories so
Luis can later decide, per group, what to **commit / ignore / archive / leave untouched / delete-later**.
This is a map, not an action. Every recommendation in §9 is a proposal for a *future* session.

## Snapshot (read-only inspections)

| Inspection | Result |
|---|---|
| `git branch --show-current` | `feat/access-analysis-redesign` |
| `git rev-list --count deploy..HEAD` | **280** commits ahead of `deploy` |
| `git diff --cached --name-only` | **empty** — nothing is staged (index is clean; no staging-index hazard right now) |
| `git diff --stat` (tracked, unstaged) | **218 files**, +6043 / −5856 |
| Untracked (`--others --exclude-standard`), excl. `.next-dev/` + `docs/archive/` | **186 files** |
| `.gsd/` tracked deletions | **~80 files** — relocated, not lost (see §5) |

> **Key safety fact:** the index is currently empty, so an explicit-path commit today would not silently
> sweep in a previously-staged file. That can change the moment any terminal runs `git add`; re-verify
> `git diff --cached --name-only` before *any* future commit (surgical-staging-workflow §4).

---

## 1. Real feature code

All runtime code below is **read-only for T2** and much of it is **T1/graph-owned** (see §8). Listed here
for classification only.

### 1a. Access Analysis graph  — ⚠️ T1 / graph-owned, do NOT touch
- `app/(dashboard)/users/AccUsersGraph.tsx` (M, +506/−…)
- `app/(dashboard)/users/accGraph3d.ts` (M) + `accGraph3d.test.ts` (M)
- `app/(dashboard)/users/accGraphFilters.ts` (M) + `accGraphFilters.test.ts` (M)
- `app/(dashboard)/users/accGraphOrganicLayout.ts` (M, +286 new layout)
- `app/(dashboard)/users/accGraphParts.tsx` (M)
- `app/(dashboard)/users/graphRenderers.ts` (M) + `graphRenderers.test.ts` (??)
- `app/(dashboard)/users/threeGraphRenderer.ts` (M)
- `app/(dashboard)/users/cosmosUtils.test.ts` (M)
- `app/(dashboard)/users/spatial-graph/page.tsx` (M) + `spatial-graph/SpatialGraphOnly.tsx` (??)
- `app/(dashboard)/users/access-analysis/` — `AccessAnalysisPage.tsx`, `AccessEventsChart.tsx`,
  `HybridAnalyticsSurface.tsx`, `MosaicCoordinatorContext.tsx`, `analyticsFindings.ts`,
  `duckdbClient.ts`, `graphSql.ts`, `page.tsx`, `__tests__/GraphInteractions.test.tsx` (all M)
- `app/(dashboard)/users/page.tsx`, `UsersDirectoryClient.tsx`, `AccProfileSection.tsx`,
  `dashboard/DashboardSidePanel.tsx` (M)
- New (??): `AccessAnalysisShellClient.tsx`, `LassoAnalyticsPanel.tsx`, `ComplianceScanPanel.tsx`,
  `PermissionRiskPanel.tsx`, `DeferredAnalyticsSection.tsx`, `VgPlotChart.tsx`, `VgplotFacetChart.tsx`,
  `mosaicSelections.ts`, `selectionAggregates.ts`, `analyticsQueries.ts`, `useMergedAccUsers.ts`,
  `directoryRenderWindow.ts`, plus matching `*.test.ts(x)`

### 1b. DC ingest / backfill  — runtime, read-only; partly T1-owned (`activityCategories.ts`)
- `lib/acc/dcActivityCsvIngest.ts` + `.test.ts` (M), `dcAdminCsvIngest.ts` + `.test.ts` (M)
- `lib/acc/activityCategories.ts` (M) — **T1-owned** (activity-mix consumer) per boundaries doc
- `lib/acc/folderCrawl.test.ts`, `modules.ts`, `productsTierMap.ts(+test)`, `timelineBucketing.ts(+test)`,
  `quick-sync-extraction.ts`, `userSimilarity.ts` (M)
- New (??): `lib/acc/activityAttribution.ts`, `activityActorClassification.ts`, `companyAnalytics.ts`,
  `deepFindings.ts`, `governanceCompliance.ts`, `projectHealth.ts`, `userEngagement.ts`, `dcEta.ts`,
  `dcControl.ts`, `cachePolicy.ts` (+ matching tests)
- `server/routers/acc-sync.ts` (M, +579), `acc-activity.ts` (M, +190), `acc-folders.ts`, `acc-members.ts`
  (M, +572) — new router tests (??): `acc-sync.test.ts`, `acc-folders.test.ts`,
  `acc-activity.coverage.test.ts`, `acc-members.products.test.ts`, `users.folder-access.test.ts`, etc.

### 1c. Charts / dashboard  — runtime, read-only (active redesign WIP)
- `components/trello/*` (CalendarView, CardDialog, TableView, TimelineView, TrelloBoardView) (M)
- `components/families/*` (FamilyDetailPanel, KanbanBoard) (M)
- `components/dashboard/*` (ChatPanel, GlobalSearch, MailPanel) (M)
- `components/layout/*` (Header, Sidebar, SyncFreshnessPill, navigation.ts) (M) + `navigation.test.ts` (??)

### 1d. Sync center  — new feature, untracked
- `app/(dashboard)/sync-center/page.tsx`, `components/sync-center/SyncCenterClient.tsx`,
  `SyncCenterStatusPanel.tsx` (+ test), `lib/acc/syncCenterState.ts` (+ test), `app/api/dev/prewarm-acc/`

### 1e. Electron  — new, untracked
- `electron/main.cjs` (single file)

### 1f. Themes / colors  — new + modified
- `components/theme/ThemeProvider.tsx`, `ThemeToggle.tsx` (??), `lib/colors/trello.ts`,
  `useTrelloLabelColor.ts` (??), `app/globals.css` (M, +200 — dark-mode tokens), `app/layout.tsx` (M)

> The whole `/access-analysis` charts + graph redesign is **not merged to `deploy`** and may still be in
> flux (active-wip-boundaries §“Charts WIP”). Treat 1a–1f as the live feature branch — do not stage
> piecemeal without the owning terminal's sign-off.

---

## 2. Documentation / workflow files
- `docs/superpowers/plans/2026-05-25-p6-enriched-dimensions-runtime-wiring.md` (M)
- New plan/spec/research docs (??): `plans/2026-05-13-spatial-graph-2d-redesign.md`,
  `plans/2026-05-22-p2-dimension-registry-foundation.md`,
  `plans/2026-05-22-p3-dimension-registry-runtime-integration.md`,
  `research/2026-05-21-graph-consolidation-audit.md`,
  `specs/2026-05-13-spatial-graph-similarity-redesign-design.md`,
  `specs/2026-05-21-deep-findings-compliance-design.md`,
  `specs/2026-05-21-graph-consolidation-design.md`
- Audit/governance docs (??): `docs/activity-attribution-audit.md`,
  `docs/activity-coverage-matrix-audit.md`, `docs/extraction-priority-plan-audit.md`,
  `docs/governance-baseline-v1.md`
- Planning (??/M): `.planning/ROADMAP.md` (M), `.planning/v1.0-MILESTONE-AUDIT.md` (??),
  `.planning/phases/04-interactions-analytics-bridge/04-02-SUMMARY.md` (??)
- `DARK_MODE.md` (??) — root-level dark-mode conventions doc
- **This report** is the only doc T2 is writing this session.

---

## 3. Scratch / probe scripts
- `scripts/scratch/*` — **~85 untracked `.cjs` probes** (acc-anomaly-*, acc-level2..8-*, check-*, count-*,
  extract-*, submit-*, option-c-*, find-*, ingest-*, etc.). Clearly ad-hoc investigation tooling.
  `scripts/scratch/` is **already covered by `/scratch/` in `.gitignore`? No** — `.gitignore` ignores
  top-level `/scratch/`, **not** `scripts/scratch/`, so these show as untracked (see §7).
- Top-level `scratch/*` (tracked **deletions**): `create-editor.js`, `find-editor.ts`, `find-users.js`,
  `find-users-raw.js`, `reorg.js`, `set-password.js`, `smoke-test.mjs` — old scratch, now deleted (the
  `/scratch/` ignore rule means once removed they stay out). See §5.
- Loose probe/one-off scripts at `scripts/` root (??): `count-acc-data.cjs`/`.mjs`, `check-domains.ts`,
  `audit-acc-activity-taxonomy.ts`, `sync-status-check.cjs`, `dc-promote-test-one.cjs`,
  `dc-test-yesterday.cjs`, `reasearch.txt` (misspelled scratch note at repo root).

---

## 4. Generated / build artifacts (never commit)
- `.next-dev/` (??) — **thousands** of files (webpack cache, manifests). Pure build output.
- `__pycache__/` — **~24 tracked `.pyc` deletions** under `scripts/` and `services/lod-engine/` (already
  gone from the tree; `.gitignore` covers `__pycache__/` + `*.py[cod]`).
- Logs (tracked **deletions**): `error.log`, `output.log`, `ngrok.log`, `ngrok_err.log` — `*.log` is
  ignored, so these were tracked before the rule and are now removed.
- knip outputs (tracked **deletions**): `knip-baseline.log`, `knip-baseline-post-gap.log`,
  `knip-baseline-post-p2.log`, `final-knip-results.log`, `knip_out.json`, `knip_report.json`,
  `dead-files.json`.
- Screenshots (tracked **deletions**): `Screenshot 2026-05-06 195615.png` (`.gitignore` covers
  `/Screenshot*.png`), plus `check-output.txt`.
- `.playwright-mcp/` (tracked **deletions**): `console-…log`, `page-…yml` (ignored by `/.playwright-mcp/`).
- No `test-results/` or `playwright-report/` present in the tree (both already ignored).

---

## 5. Tracked deletions that need a decision

These are **deletions already in the working tree** (status `D`, unstaged). They are **baseline WIP — not
created by this session.** Per baseline-WIP rule: *observe, never absorb, never revert.*

- **`.gsd/` tree (~80 files):** `ARCHITECTURE.md`, `DECISIONS.md`, `JOURNAL.md`, `ROADMAP.md`, `SPEC.md`,
  `STACK.md`, `STATE.md`, `TECHNICAL_DEBT.md`, `TODO.md`, all `examples/`, `milestones/**`, `templates/**`.
  **These are not lost** — there is an untracked relocation at
  `docs/archive/planning/2026-05-18/gsd/**` (verified) that mirrors them. So this is an **archive move**,
  not a destruction. Decision: commit the deletion **together with** adding the archive copy, as one
  cleanup commit.
- **`patches/@cosmos.gl+graph+3.0.0-beta.8.patch`** (D) — superseded; a `…beta.9.patch` exists untracked
  (§6). Decision: deletion + add of the new patch belong in one commit (a `patch-package` version bump).
- **`.dc-ingest.disabled`** (D) — the DC kill switch. Per memory, this file *auto-deletes on Luis's PC*
  (root cause unknown). Its appearing as a `D` here is consistent with that. **DC-runtime adjacent —
  classify only, do not act.** Decision: confirm DC is intentionally enabled before committing the removal.
- **Old scratch deletions** — top-level `scratch/*` (§3), `__pycache__/*.pyc`, logs, knip outputs,
  screenshots, `.playwright-mcp/*` (all also in §4). Decision: safe cleanup commit *if* Luis confirms none
  are still referenced.

---

## 6. Untracked files that look commit-worthy
These are genuine new source/tests/docs that belong in the repo (subject to owner sign-off; many are
graph/runtime → §8):
- **New tests** sitting next to existing modules: `next.config.test.ts`, `scripts/run_dev_stack.test.ts`,
  the `server/routers/*.test.ts` set, `lib/acc/*.test.ts` set, `app/(dashboard)/users/**/*.test.ts(x)` set.
- **New feature source** (§1d sync-center, §1e electron, §1f theme/colors, §1a–1b new analysis/DC modules).
- **New docs** (§2).
- **`patches/@cosmos.gl+graph+3.0.0-beta.9.patch`** — pairs with the §5 patch deletion.
- **`scripts/start-local.ps1`** — the documented deploy entry point (per memory, Task Scheduler runs it).
  Likely **should be tracked**.
- Operational scripts that look keep-worthy: `scripts/progress-monitor.cjs` (the standalone monitor app),
  `scripts/sync-acc-users.ts`, `scripts/dc-daily-ingest.ps1`, `scripts/dc-backfill-730d.ps1`,
  `scripts/dc-backfill-resume.ps1`, `scripts/dc-custom-chunks-3leg.cjs`, `scripts/dc-promote-all.cjs`,
  `Start-Monitor.cmd`.

---

## 7. Untracked files that look ignore-worthy
- **`.next-dev/`** — not matched by `.gitignore` (it lists `/.next/`, `/.next-e2e/`, `/out/` but **not**
  `.next-dev/`). This is the single biggest source of untracked noise → strong candidate for a
  `.gitignore` addition.
- **`.vscode/settings.json`** — editor-local config; usually ignored (or committed deliberately if shared).
- **`scripts/scratch/**`** — `.gitignore` ignores top-level `/scratch/` but **not** `scripts/scratch/`, so
  ~85 probe scripts leak in as untracked. Candidate: add `scripts/scratch/` to `.gitignore` (and decide
  whether a few are worth promoting out of scratch first).
- **`reasearch.txt`** (root) — looks like a stray scratch note; ignore or delete-later.
- **`app/api/dev/`** — a dev-only prewarm route; confirm whether it should ship or stay local.

> Per task constraints, **no `.gitignore` change is made here.** These are candidates only.

---

## 8. Do-NOT-touch — T1 / P7 / graph (and forbidden-for-T2) areas
Hard boundaries for this session. Read to classify; never edit, stage, restore, or commit.
- **P7 planning** (T1-owned): any new P7 plan/spec/research doc T1 is authoring under
  `docs/superpowers/plans|specs/` or `.planning/`. None is visibly committed yet — if a `*p7*` doc
  appears, it is T1's.
- **Graph implementation** (§1a) — all `accGraph*`, `graphRenderers*`, `threeGraphRenderer`,
  `AccUsersGraph`, `spatial-graph/**`, and the `access-analysis/**` graph surfaces (lasso, camera,
  renderers, edge layers, physics, `graphSql`, `HybridAnalyticsSurface`, `MosaicCoordinatorContext`).
- **T1 P5-C activity files** (per active-wip-boundaries §“T1-owned”): `activityAggregate.*`,
  `activityCategories.ts`, `acc-hot-cache.ts` activity path, `dcUserAssembly.ts`, `acc-dc-graph.ts`,
  `graphTables.ts`, `featureSnapshot.ts`, `interactionTypes.ts`, `AccessAnalysisShell.tsx`, their tests.
- **All runtime code** (`app/**`, `server/**`, `lib/**`, `components/**`, `hooks/**`) is read-only for T2.
- **`prisma/schema.prisma`**, generated areas, root `CLAUDE.md`, `.claude/skills/`.
- **DC ingest runtime** — `.dc-ingest.disabled` and `scripts/dc-ingest-*.cjs` / `acc-sync.ts`: classify by
  reading only; do not act.

---

## 9. Recommended next actions (proposals only — apply in a later, owner-approved session)

| Group | Files | Recommended action |
|---|---|---|
| **Commit as cleanup** | `.gsd/**` deletions **+** add `docs/archive/planning/2026-05-18/gsd/**` | One commit: archive move. Verify the archive copy is complete first. |
| **Commit as cleanup** | `patches/…beta.8.patch` (D) **+** `…beta.9.patch` (add) | One commit: patch-package bump. |
| **Commit as cleanup** | `__pycache__/*.pyc`, `*.log`, knip outputs, screenshots, `.playwright-mcp/*` deletions | Safe removals (all `.gitignore`-covered going forward). |
| **Commit as feature** | §1d sync-center, §1e electron, §1f theme/colors, new analysis/DC modules + their tests | Per-feature commits, **explicit-path only**, owned-terminal sign-off. Graph/§8 files excluded. |
| **Commit as infra** | `scripts/start-local.ps1`, `scripts/progress-monitor.cjs`, keep-worthy DC ops scripts (§6) | Track the durable operational scripts. |
| **Add to `.gitignore`** | `.next-dev/`, `.vscode/`, `scripts/scratch/`, `reasearch.txt` | Stop the untracked noise (deferred — not this session). |
| **Archive under `docs/archive`** | already done for `.gsd/` (relocated); consider same for stale audit `.md`s if superseded | Move, don't delete, anything with historical value. |
| **Leave untouched** | All §8 graph/P7/T1 files, `.dc-ingest.disabled`, any in-flux charts WIP | Owner-only. T2 never edits. |
| **Delete later (not now)** | `scripts/scratch/**` probes once mined, top-level `reasearch.txt`, dev-only `app/api/dev/` if not shipping | Confirm no references first; never `git clean`. |

### Standing guardrails for whoever executes cleanup
1. **Explicit-path staging only.** No `git add -A` / `.` / `-u` / `git commit -a`.
2. **Re-check `git diff --cached --name-only` before every commit** — index is empty *now*, but any
   `git add` changes that.
3. **Never** `git restore` (no `--staged`), `git checkout -- <path>`, `git reset --hard`, or `git clean`
   on this tree — it carries 280 commits of WIP plus uncommitted work that is not yours to destroy.
4. **Deletions you didn't make are baseline** (the `.gsd/` set): commit them only as a deliberate,
   reviewed cleanup, not as a side effect.
5. **Coordinate with T1** before staging anything in §1a/§8.

---

## Appendix — raw counts
- `git diff --stat` total: **218 files**, +6043 / −5856.
- Untracked, meaningful (excl. `.next-dev/`, `docs/archive/`): **186 files**.
- `scripts/scratch/` untracked probes: **~85**.
- `.gsd/` tracked deletions: **~80** (relocated to `docs/archive/planning/2026-05-18/gsd/`).
- `__pycache__` `.pyc` deletions: **~24**.
- Commits ahead of `deploy`: **280**. Index: **clean (0 staged)**.
</content>
</invoke>
