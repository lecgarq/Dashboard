# Phase 23 Owner Review Checklist — Graph-by-Graph, Whole Workshop Surface

**Purpose:** walk this on the rebuilt `:3000` (23-01, `.next/BUILD_ID` `LIvxWC9W2u6yTmhUsHY3M`,
built 2026-07-14 10:08:56), one panel at a time. The presenter test: can you explain, live,
without opening devtools, what each panel shows, what data backs it, and where coverage is
incomplete?

## Triage rule (read this first)

- **FIX IN PHASE 23:** copy/label fixes, wrong wording, ordering nits, obvious visual defects —
  anything touching NO loader and adding NO data.
- **DEFER TO v2.4:** anything needing a new loader, chart, data source, or schema/taxonomy
  change. Record as a milestone seed; do NOT build it.
- If you dispute a **number** (not a label), that is a data-truth finding → v2.4, unless the
  cause is a display bug (then it is fix-now).
- **Goal: keep the milestone CLOSEABLE. There is no Phase 23.1.**

Verdict column values: `ok` / `fix-now` / `v2.4-seed`.

---

## `/access-analysis` — DEEP, all 23 panels, all 6 tabs

Panel inventory is **23, not 22** (corrected from `23-CONTEXT.md`'s 22-panel count — the Roles
tab has 6 panels, not 5; "Folder Activity by Role" is a distinct, separately-gated
`PremiumSurface` mount, not part of the folder-action heatmap below it).

### Overview tab (5 panels) — leads "Activity over time"

| Panel | The question it answers | Data source / authority | Known caveat | Verdict |
|---|---|---|---|---|
| Activity over time (`OverviewTabPanel.tsx:63-77`) | "Total ACC activity per month across all years. Tick projects above to refocus the line; quiet months dip to zero." | `timelineRows`/`timelineSummary`, activity-derived → `ActivityCoverageBadge` | — | |
| Activity by module (`OverviewTabPanel.tsx:84-144`) | "Total actions recorded in each ACC module." | `moduleSummary`, activity-derived → `ActivityCoverageBadge` | Module-attribution ⓘ caveat: hover/focus tooltip, `data-testid="module-caveat"` (`OverviewTabPanel.tsx:119`) — states the live service-tag vs. `rawAction`-verb split percentage, computed from `moduleSummary.attribution`, never hardcoded | |
| Activity share by project (`OverviewTabPanel.tsx:155-165`) | "Top 10 projects by activity volume, plus Other. Account-level admin activity is excluded — see caption below." | `projectActivitySummary`, activity-derived → `ActivityCoverageBadge` | Account-level exclusion caption (in-component) | |
| Provisioned modules (`OverviewTabPanel.tsx:167-176`) | "Member x project module access grants for the selected projects — what's rolled out, vs. the activity donut's what's used." | `provisionedModuleSummary`, membership-derived → no coverage badge (correct — not activity data) | — | |
| Ingest freshness (`OverviewTabPanel.tsx:183`) | Ops-metadata strip: how fresh is the underlying ingest pipeline (PIPE-01) | `ingestFreshness`, account-wide, not project-filtered | — | |

### Roles tab (6 panels) — leads "Role distribution"

| Panel | The question it answers | Data source / authority | Known caveat | Verdict |
|---|---|---|---|---|
| Role distribution (`RolesTabPanel.tsx:91-111`) | "Roles held across all project memberships." | `roleSummary`, membership (not activity-derived → correctly no coverage badge, `RolesTabPanel.tsx:90` comment) | — | |
| Activity by role (`RolesTabPanel.tsx:114-136`) | "Project activity attributed to the role each person held on that project. Click a role to see who did the work." | `activityActorRows`/`activityByRoleSummary`, activity-derived → `ActivityCoverageBadge` | — | |
| Permission volume by level (`RolesTabPanel.tsx:140-156`) | "Which role holds the most access at each permission level? Counted per folder grant." | `loadPermissionLevel` lazy fetch, membership-derived → no coverage badge (correct) | — | |
| Activity recency by role (`RolesTabPanel.tsx:159-179`) | "Which roles are actually doing work right now, vs. holding access they never use?" | `loadActivityRecency` lazy fetch, activity-derived (coverage in prose caption, not badge) | — | |
| **Folder Activity by Role** (`FolderActivityReveal`, `RolesTabPanel.tsx:183-193`) | Folder-first drill: Folders → Projects → Roles → People | `loadFolderRanking`/`loadFolderDetail`, lazy, collapsed by default | — | |
| Folder action heatmap (`FolderActionHeatmap`, `RolesTabPanel.tsx:197-201`) | What people DO in the busiest folders (views/downloads/uploads/edits) | `loadFolderActionMatrix`, lazy, collapsed by default | — | |

### Users tab (2 panels) — leads "Users by permission level" (when loaded)

| Panel | The question it answers | Data source / authority | Known caveat | Verdict |
|---|---|---|---|---|
| Users by permission level (`UsersTabPanel.tsx:135-151`) | "How many people hold each folder-permission level, counting every user once at their strongest grant — the quickest read on how much of the account can actually change or control content." | `loadPermissionUsers` lazy fetch, membership-derived → no coverage badge | — | |
| Activity recency detail (`UsersTabPanel.tsx:153-201`) | "Who is still actually working in ACC, and who has gone quiet? Sorted most-dormant first by default." | `filteredActivityRecencyRows`, activity-derived | Two live caption `<p>` elements: `data-testid="activity-recency-detail-coverage-caption"` (`UsersTabPanel.tsx:191`, "Activity data covers {covCovered} of {covTotal} ACC projects — memberships come from the DC snapshot.") and `...-semantics-caption` (`UsersTabPanel.tsx:194`, "\"Never active\" = no recorded activity in the ACCDS-crawled window" + data-floor date when present) | |

### Companies tab (3 panels) — leads "Users by company"

| Panel | The question it answers | Data source / authority | Known caveat | Verdict |
|---|---|---|---|---|
| Users by company (`CompaniesTabPanel.tsx:66-86`) | "Project memberships grouped by each member's company." | `companySummary`, membership-derived → no coverage badge (correct) | — | |
| Activity by company (`CompaniesTabPanel.tsx:89-111`) | "Project activity attributed to each person's company. Click a company to see who did the work." | `activityActorRows`/`activityByCompanySummary`, activity-derived → `ActivityCoverageBadge` | — | |
| Folder activity by company (`CompaniesTabPanel.tsx:115-138`) | "Which companies touch which folders — top companies by folder-scoped activity." | `loadFolderScopedActivity`/`loadCompanyFolderBreakdown`, lazy | — | |

### Projects tab (6 panels) — leads "Issue data coverage"

**"Issues by type" is the ONLY v2.3 panel with ZERO recorded owner UAT** (Phase 22 closed on
live-`:3000` evidence 2026-07-14; its `:3100` preflight `checkpoint:human-verify` was never run
— `22-03-SUMMARY.md`, STATE.md Blockers/Concerns). Give it real attention below, not a skim.

| Panel | The question it answers | Data source / authority | Known caveat | Verdict |
|---|---|---|---|---|
| Issue data coverage (`ProjectsTabPanel.tsx:71-88`) | "How much of the issue data can we see into? Every project checked by the latest fetch, honestly bucketed." | `coordinationData.issueCoverage`, live fetch-run coverage | — | |
| Issues over time (`ProjectsTabPanel.tsx:91-110`) | "When are issues actually being raised? Every ACC issue by created month." | `loadIssueFunnel` lazy fetch | Live-computed fetched/total/unavailable coverage caption via `deriveIssueCoverageCaption` (`issueFunnelCounts.ts:132`), consumed via the `coverageProjects` prop — never a hardcoded figure | |
| Issues by status (`ProjectsTabPanel.tsx:112-132`) | "Where does the issue pile sit right now? All fetched issues by their current ACC status, shown exactly as ACC reports them." | `loadIssueFunnel` lazy fetch | Same live coverage caption convention as above | |
| **⚠ Issues by type — ZERO OWNER UAT** (`ProjectsTabPanel.tsx:134-154`, `IssueTypeChart.tsx`) | "What kinds of issues do we actually have? Every fetched issue by its resolved ACC type name — honest buckets for unresolved and untyped issues." | `loadIssueFunnel` lazy fetch (`filteredIssueTypeRows`) | Two distinct, ranked, never-pinned buckets: `UNKNOWN_LABEL = "Unknown type"` (`issueTypeCounts.ts:30`) and `NONE_LABEL = "No type set"` (`issueTypeCounts.ts:32`); plus a never-backfilled guard at `IssueTypeChart.tsx:97-110` that renders "Type names not yet backfilled" + "Run scripts/acc-issue-types-backfill.cjs to resolve issue type names." instead of a wall of 100% Unknown-type bars when GUIDs exist but none resolve | |
| Workflow tools (`ProjectsTabPanel.tsx:156-181`) | "How much are the document Reviews, Transmittals, RFIs, and Submittals workflows actually used? Every recorded action, by type — click one for its per-project breakdown." (one panel shell, 4 donuts) | `workflowToolSummaries` lazy fetch | `ProjectsTabPanel.tsx:165`: "RFI and Submittal events come only from the batch Data Connector feed (the live feed does not report them), so recent weeks may lag." | |
| Model Coordination (`ProjectsTabPanel.tsx:183-200`) | "Coordination-classified issues, by project." | `coordinationData`, live | — | |

### Compare tab (1 panel) — nothing to order

| Panel | The question it answers | Data source / authority | Known caveat | Verdict |
|---|---|---|---|---|
| Folder permission terrain (`CompareTabPanel.tsx:37-52`) | "Follows the project search bar above — 0 selected shows the account-wide overview, 1 shows that project, 2+ stacks the top-staffed selection for comparison." | `loadTerrain`/`loadOverview`, driven by the global picker | Explicit naming-collision note in-copy: this tab's name is unrelated to the terrain's own internal `mode === "compare"` view | |

---

## `/users` — DEEP-ish, VERIFICATION ONLY (no curation edits authorized here)

These 2026-07-13 off-roadmap changes (commit `93722dae`) have never been reviewed. One row per
changed surface, not per widget.

| Surface | What changed | Source | Verdict |
|---|---|---|---|
| KPI header strip | 7 glass tiles: Total users / In ACC / Not in ACC / Internal / External / Active 30d / Admins, flex-wrap so no tile clips | `UsersTableHeader.tsx:146-152` | |
| External ACC collaborators | Non-`hermosillo.com`-domain ACC users appended to the directory under department "External" | `useUsersDirectoryData.ts:267,270-286` (`classifyAffiliation(u.email) !== "external"` filter, `department: "External"`) | |
| Affiliation filter | Internal/External toggle in the directory filter bar | `DirectoryFilterBar.tsx:114,290,464-467` | |
| Company column | New "Company" column in the directory table | `DirectoryTableColumns.tsx:119-121` | |

---

## `/template-mty` — SHORT functional pass

Received a real, never-owner-seen feature: the richer role-similarity graph (commit `b76356f2`,
cluster blobs / curved edges / similarity %) plus a label fix (`2e15233f`, labels stay glued to
their nodes). Source: `app/(dashboard)/template-mty/components/RoleSimilarityGraph.tsx`.

| Check | Verdict |
|---|---|
| Does the role-similarity graph render (cluster blobs, curved edges, similarity % labels)? | |
| Do labels stay glued to their nodes on pan/zoom/interaction? | |
| Can the presenter explain it live without devtools? | |

## `/forma-proposal` — SHORT visual pass

Received only the LECG brand-palette theme commit (`4638020b`, 2 files:
`FormaParticleAccent.tsx`, `HierarchyCanvas.tsx`).

| Check | Verdict |
|---|---|
| Does the LECG brand palette read correctly (no theme drift, no blue/slate cast)? | |
| No visual regression vs. the prior palette pass? | |

---

## Scope correction (grounds `23-CONTEXT.md`'s `VERIFY:`)

`23-CONTEXT.md` marked `/template-mty` and `/forma-proposal` as `VERIFY:`-tagged "not touched."
`git diff v2.2..HEAD` disproves the broad claim: **no v2.3-*requirement* panel landed on either
page, but both received off-roadmap commits during the v2.3 window** (role-similarity graph
richness + label fix on `/template-mty`; brand-palette theme pass on `/forma-proposal`). Do not
carry forward "untouched" as a fact — it is not what the evidence shows.

---

## Curation verdict (Task 1, recorded here for the owner's context)

Every tab's top-of-tab panel was independently re-checked against its tab's stated purpose.
**No within-tab reorder is warranted — zero-diff curation PASS**, matching `23-RESEARCH.md` §A's
own finding: Overview leads with the account-wide activity shape, Roles with the membership
baseline, Users with the sharpest permission-level read, Companies with the company-distribution
baseline, Projects with coverage-precedes-metric (documented convention,
`ProjectsTabPanel.tsx:26-31`), and Compare has a single panel with nothing to order. The 6-tab
IA (Phase 20.1) is confirmed as the answer to ROADMAP criterion #1's "wall of charts" concern —
no grouping/collapse scheme was built or is needed.
