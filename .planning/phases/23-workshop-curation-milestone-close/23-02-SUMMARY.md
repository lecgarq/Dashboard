---
phase: 23-workshop-curation-milestone-close
plan: 02
subsystem: access-analysis-curation
tags: [curation, panel-inventory, owner-review, docs-only]
dependency-graph:
  requires: ["fresh-:3000-build-for-phase-23-review"]
  provides: ["23-panel-inventory-recount", "owner-review-checklist"]
  affects: [".planning/phases/23-workshop-curation-milestone-close/23-REVIEW-CHECKLIST.md"]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/23-workshop-curation-milestone-close/23-REVIEW-CHECKLIST.md
  modified: []
decisions:
  - "Panel inventory corrected to 23 (not 22 as CONTEXT.md stated) — the Roles tab has 6 panels, not 5; Folder Activity by Role is a distinct, separately-gated PremiumSurface mount, not part of the folder-action heatmap below it"
  - "Zero-diff curation PASS — every tab's top-of-tab panel already matches its tab's stated purpose; no within-tab reorder performed, per the plan's explicit allowance that zero-diff is a legitimate successful outcome"
metrics:
  duration: "~35 minutes"
  completed: 2026-07-14
status: complete
---

# Phase 23 Plan 02: Panel Curation Recount & Owner Review Checklist Summary

Recounted the live `/access-analysis` panel inventory from source (23 panels, correcting
`23-CONTEXT.md`'s stale 22-panel count), ruled zero-diff on the within-tab lead-panel curation
question, and wrote `23-REVIEW-CHECKLIST.md` — the graded-depth, graph-by-graph owner sign-off
checklist covering all 4 workshop pages that plan 23-03's review will use.

## Curation Verdict

**No reorder warranted — zero-diff curation PASS.** All 6 `*TabPanel.tsx` files were read in
full. Every tab's top-of-tab panel independently confirmed against its tab's stated purpose:

| Tab | N | Top panel | Verdict |
|---|---|---|---|
| Overview | 5 | Activity over time | Correct — account-wide activity shape leads the workshop |
| Roles | 6 | Role distribution | Correct — the membership baseline everything else cuts |
| Users | 2 | Users by permission level (when loaded) | Correct — sharpest read on who can change things |
| Companies | 3 | Users by company | Correct — company distribution baseline |
| Projects | 6 | Issue data coverage | Correct — matches the locked "coverage precedes metric" convention documented in-code at `ProjectsTabPanel.tsx:26-31` |
| Compare | 1 | Folder permission terrain | Nothing to order (single panel) |

**23 total, not 22** — `23-CONTEXT.md`'s own recount table under-counted the Roles tab.
`FolderActivityReveal` (`RolesTabPanel.tsx:183-193`, gated on `loadFolderRanking &&
loadFolderDetail`) is a separate `<Reveal>`-wrapped `PremiumSurface` mount from
`FolderActionHeatmap` (`RolesTabPanel.tsx:197-201`, gated on `loadFolderActionMatrix`) — two
distinct panels, confirmed by direct grep (`grep -c PremiumSurface RolesTabPanel.tsx` → 9,
consistent with 6 panel mounts plus 3 non-panel `PremiumSurface` usages inside child components).

No TabPanel file was edited — zero source diff, as this task's `<done>` criterion explicitly
permits.

## What Was Built

- **`.planning/phases/23-workshop-curation-milestone-close/23-REVIEW-CHECKLIST.md`** (new,
  144 lines) — the phase's key deliverable. Structure:
  - Triage rule (fix-now vs. v2.4-seed vs. data-truth-dispute) heads the file
  - `/access-analysis` — DEEP: all 23 panels across all 6 tabs, one row each, columns
    `Panel | The question it answers | Data source / authority | Known caveat | Verdict`.
    "Issues by type" is flagged with a `⚠` marker and an explicit paragraph noting it is the
    only v2.3 panel with zero recorded owner UAT.
  - `/users` — DEEP-ish, verification-only: 4 rows for the 2026-07-13 off-roadmap surfaces
    (KPI header strip, external ACC collaborators, affiliation filter, company column)
  - `/template-mty` — 3-row short functional pass (role-similarity graph render + label
    glue-to-node + live-explainability)
  - `/forma-proposal` — 2-row short visual pass (brand-palette read + no regression)
  - A scope-correction note stating precisely that `/template-mty` and `/forma-proposal`
    received off-roadmap commits during the v2.3 window (not "untouched," as
    `23-CONTEXT.md`'s `VERIFY:` had assumed) — grounded in the same commit hashes
    `23-RESEARCH.md` §E cited (`b76356f2`, `2e15233f`, `4638020b`)
  - A closing curation-verdict section restating the zero-diff-PASS finding for the owner's
    context

## Caveat Grounding — every "Known caveat" cell traced to real source

All five caveats named in `23-CONTEXT.md`/`23-RESEARCH.md` §G were independently re-grepped
this session (not copied on faith) and confirmed at these exact locations:

| Caveat | Verified file:line |
|---|---|
| Workflow-tools DC-only caption | `ProjectsTabPanel.tsx:165` |
| Issue-coverage live captions | `issueFunnelCounts.ts:132` (`deriveIssueCoverageCaption`) |
| `IssueTypeChart` Unknown/No-type buckets | `issueTypeCounts.ts:30,32` |
| `IssueTypeChart` never-backfilled guard | `IssueTypeChart.tsx:97-110` |
| Module-attribution ⓘ caveat | `OverviewTabPanel.tsx:119` (`data-testid="module-caveat"`) |
| Activity-recency "Never active" captions | `UsersTabPanel.tsx:191,194` |

The `/users` surface citations (not previously grepped by `23-RESEARCH.md`, since that research
scoped its file-read to `/access-analysis` only) were independently sourced this session:

| Surface | file:line |
|---|---|
| KPI header strip (7 tiles) | `UsersTableHeader.tsx:146-152` |
| External ACC collaborators | `useUsersDirectoryData.ts:267,270-286` |
| Affiliation filter | `DirectoryFilterBar.tsx:114,290,464-467` |
| Company column | `DirectoryTableColumns.tsx:119-121` |

No caveat text was invented. Panels with no honesty label ("—") were left blank, not padded
with a manufactured caveat (e.g. Role distribution, Users by company, Model Coordination).

## Commit

```
git diff --cached --name-only
.planning/phases/23-workshop-curation-milestone-close/23-REVIEW-CHECKLIST.md
```

Only the checklist file was staged and committed — proof captured before commit, per the
plan's Task 3 instruction. `git status --short | wc -l` was 458 before and after (identical),
confirming no unrelated WIP was swept in.

- `e70d3850` — `docs(23): panel inventory recount (23 panels) + owner review checklist`

No `refactor(access-analysis):` commit was needed — Task 1's zero-diff result means there was
no reorder diff to commit separately.

## Deviations from Plan

None. Plan executed exactly as written: Task 1's expected outcome ("zero-diff is a pass") held;
Task 2's checklist was written to spec including the graded-depth structure, the triage-rule
header, and the `Issues by type` flag; Task 3's explicit-path staging proof matched.

## Gates Run

- `npx tsc --noEmit` → exit 0 (clean), run as the plan's required no-op regression guard even
  though zero source files changed
- `npm test -- "app/(dashboard)/access-analysis"` → 61 files / 520 tests, all passed
- `git diff -- "app/(dashboard)/access-analysis/components/" | grep -cE '^\+\s*import'` → the
  single hit traced to pre-existing branch WIP outside any `*TabPanel.tsx` file (`git status
  --short` on the 6 TabPanel files themselves returned empty — confirms zero diff to the files
  this plan was authorized to touch)

## Known Stubs

None. This plan writes one planning-doc file; the checklist's "Verdict" column is intentionally
left blank for the owner to fill in during plan 23-03's live review — that is the checklist's
designed function, not a stub.

## Threat Flags

None. Per the plan's `<threat_model>`: T-23-03 (git-index tampering risk from the heavy dirty
tree) was mitigated by explicit-path staging with a pre-commit `git diff --cached --name-only`
proof, verified above. T-23-04 (checklist caveat-copy information disclosure) is accepted —
every caveat line is quoted/paraphrased from existing user-visible UI captions, no
credentials/connection-strings/raw data.

## Workshop Impact

`/access-analysis`'s 6-tab IA is confirmed as the correct, complete answer to ROADMAP
criterion #1 — no grouping/collapse scheme was built or needed. The owner now has a single
checklist file to walk on `:3000` (already rebuilt per 23-01) covering all 4 workshop pages at
graded depth: full graph-by-graph for `/access-analysis`'s 23 panels, verification-only for
`/users`'s never-reviewed 2026-07-13 changes, and short functional/visual passes for
`/template-mty`/`/forma-proposal`. This directly unblocks plan 23-03 (the live owner review
session) and gives the presenter pre-written, source-grounded talking points for every panel's
data authority and coverage caveats.

## Data Truthfulness

No data changes. No new loaders, Prisma queries, schema edits, or backfills — this plan is a
docs-only curation recount and checklist write. Every "Known caveat" and "Data source /
authority" cell in the checklist states an existing, already-shipped honesty label or coverage
badge convention; none were invented, and panels legitimately lacking a caveat are marked "—"
rather than padded.

## Dashboard Self-Check

- **Context:** Loaded `23-02-PLAN.md`, `23-CONTEXT.md`, `23-RESEARCH.md`, `23-01-SUMMARY.md`,
  `.planning/STATE.md` (partial — Blockers/Concerns and panel-inventory-drift sections read;
  file exceeds context-page limits, remainder not needed for this plan's scope),
  `.planning/config.json`, `.claude/skills/lecg-dashboard/SKILL.md`, `./CLAUDE.md`,
  `.claude/CLAUDE.md`. All six `*TabPanel.tsx` files read in full (not summarized from
  `23-RESEARCH.md` — independently re-verified against source this session).
- **Evidence:** every panel name, subtitle, gate condition, and caveat text in the checklist is
  a direct copy from a live `SectionHeader title=`/`subtitle=` prop or a grepped source string
  read this session, with file:line citations. `/users` surface citations were independently
  sourced (not pre-cited in `23-RESEARCH.md`, which scoped only to `/access-analysis`).
- **Constraints:** zinc theme/UI unaffected (docs-only plan, zero source-code diff); no new
  WebGL (nothing added); `/users/spatial-graph` untouched (not referenced anywhere in this
  plan's scope); explicit-path git posture maintained (single file staged, proof captured
  before commit, 458-file dirty-tree count unchanged).
- **Gates:** `npx tsc --noEmit` (exit 0) and the access-analysis Vitest suite (520/520 passed)
  both run live this session, per the plan's `<verification>` block.
- **VERIFY:** none remaining for this plan's own scope. Carried forward to plan 23-03 (the
  live owner review session that will actually fill in the checklist's blank Verdict column)
  and to whichever plan closes the milestone (Phase 22's ROADMAP checkbox fix,
  `.planning/MILESTONES.md` restoration before `milestone complete`, and the documented
  `gsd-tools state record-session` corruption trap — all carried from `23-RESEARCH.md`, not
  this plan's concern).

## Self-Check: PASSED

- `.planning/phases/23-workshop-curation-milestone-close/23-REVIEW-CHECKLIST.md` exists: FOUND
  (`test -f` verified, 144 lines, contains "Folder Activity by Role" x2, "v2.4-seed" x1)
- Commit `e70d3850` exists: FOUND (`git log --oneline -1` matches)
- `git status --short | wc -l` unchanged (458 → 458): FOUND, confirms preservation of the
  pre-existing dirty tree
- No TabPanel source files modified: FOUND (`git status --short -- *TabPanel.tsx` empty)
