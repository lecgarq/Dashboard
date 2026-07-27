# Modules-by-activity donut — design

**Date:** 2026-06-03 · **Branch:** feat/access-analysis-redesign · **Status:** approved (via decision Q&A), building

## Goal

A donut chart on `/access-analysis`, in the exact style of the existing **roles** donut, that
shows the **9 ACC modules** sized by **total activity** in each. Sibling to the roles chart
(roles distribution by membership → module distribution by activity volume).

## Data reality (measured 2026-06-03, local PG)

`AccActivity`: 989,827 rows · 641,908 attributed (64.9%) · 1,208 active users · 212 projects ·
168 distinct raw actions. Every raw action resolves to a canonical module via the existing
taxonomy (`resolveActionId` → `getAction().moduleId`); coverage 99.9% (11 raw actions / 1,063
rows unmapped — mostly `issue-*` variants).

| Module | Activity volume | Distinct users | Activity types |
|---|--:|--:|--:|
| Data Management | 781,754 | 1,167 | 73 |
| Build | 164,731 | 340 | 47 |
| Design Collaboration | 39,039 | 125 | 13 |
| Preconstruction | 3,188 | 99 | 11 |
| Model Coordination | 27 | 3 | 4 |
| Datum | 25 | 4 | 9 |
| AutoSpecs / Design / Insight | 0 | 0 | 0 |

Distinct `(projectId, rawAction)` pairs: 2,809 (~207 KB raw / ~35 KB gzip).

## Decisions (from the user)

1. **Slice metric** = total activities per module (volume). Data Management dominates (~79%);
   that is the honest shape, the drill-down rescues the small modules.
2. **Project filter** = same checkbox-dropdown picker as the roles chart; donut re-filters live.
3. **Activity detail** = hover tooltip lists top activity types; click a module to expand its
   full activity-type list.

## Architecture (mirrors the roles pattern)

Ship compact rows from the server, re-bucket on the client (same as roles ships per-membership
rows and re-runs `summarizeRoles`). The 2,809-row payload makes this the simple, correct path —
project filtering and the per-module drill-down both fall out of the client-side resolution.

- **`lib/server/moduleActivityView.ts`** (server-only, 5-min cache): one
  `accActivity.groupBy(["projectId","rawAction"])` + `accDcProject` names → rows of
  `{ projectId, projectName, rawAction, count }`. Empty/unknown `projectId` → "Account-level"
  pseudo-project. Includes unattributed rows (it's volume, not users).
- **`app/(dashboard)/access-analysis/moduleCounts.ts`** (pure, unit-tested): `summarizeModules(rows)`
  resolves each `rawAction` → module, returns `{ slices, total, activeModules, zeroModules, typesByModule }`.
  Unmapped actions fold into a pinned `Unmapped` bucket (like roles pins `Unknown`).
- **`projectFilter.ts`**: generalize the three pure helpers (generics over `{projectId, projectName}`)
  so both charts reuse them; roles behaviour unchanged.
- **`components/ProjectPicker.tsx`** (new, reusable): the checkbox-dropdown picker, extracted so the
  modules chart gets the identical UI; count noun parameterized ("activities" vs "memberships").
- **`components/ModulesPieChart.tsx`**: ECharts donut mirroring `RolesPieChart` — stable per-module
  color map, title "Module activity", center = total activities, ranked legend (count + %),
  greyed "not used" chips for the 3 zero modules, **click a module → drill-down panel** of its
  activity types. No top-N slider (only ~6 active modules).
- **`components/ModulesByProject.tsx`**: wrapper = `ProjectPicker` + `ModulesPieChart`, re-runs
  `summarizeModules` on the selected projects.
- **`page.tsx`**: load the module view, render `<ModulesByProject>` below the roles section.

## Out of scope (YAGNI)

Top-N slider; per-user/distinct-user metrics; editing the live roles components.

## Addendum 2026-06-05 — full activity classification (`moduleOverrides.classifyActivity`)

Every raw action is now mapped at query time to `{ module, label, category }`; **0 of 171 distinct
actions are Unmapped** (verified against live DB, 1,046,075 rows). Kept local to the donut (the
shared cosmos taxonomy is untouched). Two axes: **module** (donut slice) and **action category**
(Content changes / Workflow / Access & permissions / Viewing & exports / Deletions) — the drill-down
groups activity types by category.

Research-backed decisions (sources below):
- Coordination `issue-*` events (attach, work-completed, ready-to-inspect, suggestion-generated,
  detach, respond, answered, void) → **Model Coordination** (Autodesk records coordination issues as
  issue-* events).
- New **Admin Actions** module = all 12 excel-Preconstruction actions (assign/remove-*, *-permission,
  notify-final-members, edit-project, create-project-company). Preconstruction kept but empty;
  AutoSpecs/Design likewise reserved.
- `EXTRA_ACTIONS` (DB actions absent from the excel catalog): `add-version-to-set`, `create-set`,
  `calibrate-entity` → **Data Management** (Sheets version-sets + Docs measurement calibration are
  Docs features, matching the existing `create-version-set` → Data Management); `create-project`,
  `add-member`, `setting-update` → **Admin Actions**.
- `CATEGORY_OVERRIDES` fix the handful of catalog actions whose excel `groupId` is `unknown`
  (e.g. `receive-entity-from-project-with-automation`, the Datum attribute actions) so nothing
  meaningful lands in "Other".

Robust to extraction: the ingest is unchanged — the donut maps the lossless `rawAction`, so all
future Data Connector pulls classify automatically.

Sources: Autodesk Data Connector Activity Data Schema (help.autodesk.com `guid=Data_Connector_Activity_Data_Schema`);
ACC Sheets Version Sets (help.autodesk.com BUILD `guid=Version_Sets`); ACC Docs measurement/calibration
(help.autodesk.com Docs-Files `Feature_Markups_Files_Docs`).

## Addendum 2026-06-05 — deeper dive: the `service` field & the Model-Coordination problem

Investigation only (no code changed). Stress-tested `classifyActivity` against the live DB
(1,046,075 rows, 171 distinct `rawAction`) and Autodesk's schema docs. Diagnostics:
`scripts/diag-activity-types.cjs`, `diag-activity-service-xtab.cjs`, `diag-activity-coordination.cjs`
(read-only, reusable).

**Confirmed healthy:** 0 Unmapped, 0 "Other" — every action resolves to a real module *and* a real
category. The `rawAction` axis is airtight.

**The blind spot — `AccActivity.service` is ignored.** `service` is Autodesk's *own* product
attribution (the schema is literally organised into per-service tables: docs, issues, rfis,
submittals, sheets, admin, bridge). It is populated on **425,489 rows (40.7%)**; the other 59.3%
are null (legacy single-file extractions). Our classifier derives the module purely from the action
string and never consults `service`, so the two have never been cross-checked. Cross-tab found
**9,271 rows (0.89%)** where Autodesk's `service` implies a different module than we assign:

| Move | Rows | Verdict |
|---|--:|---|
| Model Coordination → Build (`issue-attach`, `issue-work-completed`, …) | 939 | **bug — fix** |
| Data Management → Build (`response-create`/`comment-create`, `service=rfis`) | 299 | **bug — fix** |
| Design Collab → Data Mgmt (`view-sheet`/`publish-sheet`, `service=sheets`) | ~4,760 | arguable (Sheets is its own service) |
| Admin Actions → Data Mgmt (`assign-permission`, `service=docs`) | 830 | **keep** (intentional synthetic module) |
| Design Collab → Data Mgmt (`send/receive-entity-to-project`, `service=docs`) | ~2,420 | **keep** (real cross-team share) |

**Model Coordination is a misattribution.** The 2026-06-05 addendum above routes 8 `issue-*` verbs to
Model Coordination on the theory "coordination issues are recorded as issue-* events." Going deeper
refutes the *separability*, not the fact: Autodesk's schema design doc states the `issues_activities`
table "treats all issues uniformly without a 'type' or 'source' field to differentiate clash detection
issues from standard field/build issues." In our data **100% of those 8 verbs carry `service=issues`**
(the Build Issues service) and `details` is an opaque integer id — there is no in-data coordination
marker. Model Coordination has **no dedicated activity stream** in this dataset; its ~966 rows are
Build issues. Recommendation: stop name-routing to Model Coordination (relabel honestly or drop the
slice) — highest-confidence fix.

**Recommended refinement (NOT yet implemented — needs brainstorming/approval).** Make `service` a
*surgical override*, never a replacement:
1. Thread `service` into the pipeline: `loadModuleActivity` groups by
   `["projectId","rawAction","service"]`; `classifyActivity(rawAction, service?)` takes it.
2. When `service` is present, let it correct the two genuine bugs (issues→Build incl. the ex-Model-
   Coordination verbs; rfis-generic-verbs→Build). Keep Admin Actions and Design-Collab-share as
   deliberate. Decide Sheets (Data Mgmt vs Design Collab) on product grounds.
3. Null-service rows (59.3%) stay on the action-string taxonomy unchanged — it already classifies the
   docs/files bulk (`view-entity`, `upload-entity`, `copy-file`) correctly.

Net effect is tiny (<1% of volume) but removes a phantom module and two clear mislabels. Robust to
future extractions: still maps the lossless `rawAction`, now with `service` as a tiebreaker when present.

Sources: Autodesk activities schema design doc (`developer.api.autodesk.com/data-connector/v1/doc/schema?name=activities`);
ACC Data Connector activity support (`aps.autodesk.com/blog/accbim-360-insight-data-connector-api-supports-activities`);
"What data is extracted by data connector data schema in ACC" (autodesk.com support article).
