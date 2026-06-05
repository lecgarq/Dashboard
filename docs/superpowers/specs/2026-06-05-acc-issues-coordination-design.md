# ACC Issues extraction & Model-Coordination classification — design

**Date:** 2026-06-05 · **Branch:** feat/access-analysis-redesign · **Status:** approved (via decision Q&A), ready to plan

## Problem

The `/access-analysis` activity donut shows a **Model Coordination** slice built by routing 8 `issue-*`
activity verbs to that module *by name*. The 2026-06-05 deep dive (`scripts/diag-activity-*.cjs`,
recorded in `2026-06-03-modules-by-activity-design.md`) proved this is a **misattribution**: Autodesk's
activity schema cannot separate clash issues from Build/field issues — 100% of those verbs carry
`service=issues`, and `AccActivity.details` is an opaque integer with no clash identity. Model
Coordination has **no dedicated activity stream**; its ~966 rows are really Build issues.

The real signal for Model Coordination is the **count of clash-generated issues**, which the activity
feed does not carry. ACC *does* auto-write a recognizable signature when a clash becomes an issue:

- **Title** ends with the clash id in brackets, e.g. `… Basic Wall [7256324]`.
- **Description** is auto-filled, e.g. `1 clash between Security Devices, AXIS P3267-LVE in
  VYD_PREPATEC_R24_V3.rvt - {3D - luis.cortesWXLY7} and ARCH-A-PREPATEC-2024_V3.rvt - {3D - luis.cortesWXLY7}`.

## Goal

Extract **all issues from all accessible projects** into the DB (a full, reusable dataset), classify
which are Model-Coordination clash issues using a title→description heuristic **validated against
Autodesk's authoritative clash endpoint**, and surface an honest coordination-issue **count** on
`/access-analysis`.

## Decisions (from the user, 2026-06-05)

1. **Scope** = full issues dataset — extract + store every issue from every accessible project; the
   coordination flag is one field. Enables the count plus future issue features (assignees, root cause,
   status history) with no re-fetch.
2. **Detection** = heuristic **+ clash-endpoint validation** (authoritative cross-check).
3. **Refresh** = one-time backfill first; scheduling deferred until the numbers are proven.
4. **Pipeline** = **two-pass** (issues+heuristic, then clash validation) — resumable, auditable, stores
   both signals separately.
5. **Project relation** = loose `String` (no enforced FK) — the 3-leg Issues API can reach member-only
   projects absent from `AccProject`; resilience over premature strictness.
6. **Title threshold** = **any** trailing `[digits]` (max recall), with a `confidence` tag (`high` for
   ≥4-digit ids, `low` for short) so false positives stay queryable instead of silent.
7. **Description strictness** = **corroborated** (ACC's exact lead phrase, or `clash between…and…`
   backed by two `{3D - user}` model markers) — avoids compounding false positives.

## Architecture

```
Pass 1  (all accessible projects)        Pass 2  (MC-enabled projects only)
┌────────────────────────────┐           ┌─────────────────────────────────┐
│ Issues API list per project │           │ clash/v3 modelsets → assigned   │
│ → classifyCoordination()    │   ──►      │  → true clash issueIds          │
│ → upsert AccIssue           │           │ reconcile vs AccIssue by issueId│
└────────────────────────────┘           │ → clashValidated, FN recovery,  │
   pure classifier (title→desc)            │   projectMcEnabled              │
                                           └─────────────────────────────────┘
```

Two pure units (`classifyCoordination`, `reconcileClashes`) behind two I/O scripts. Auth + project
enumeration are shared helpers reused from the existing `mc-*` scripts.

## Section 1 — Storage schema

```prisma
model AccIssue {
  id             String   @id          // ACC issue UUID
  projectId      String                // ACC Construction-Admin project GUID (loose; logical join AccProject.id)
  displayId      Int?                  // human #number
  title          String
  description    String?
  status         String?               // open / closed / answered / …
  issueTypeId    String?
  issueSubtypeId String?
  createdBy      String?               // autodesk id
  createdAt      DateTime?
  deleted        Boolean  @default(false)

  // coordination classification
  isCoordination     Boolean @default(false)
  coordinationSource String?           // "title" | "description" | "clash-endpoint"
  confidence         String?           // "high" | "medium" | "low"
  clashId            String?           // bracket digits, when present
  clashValidated     Boolean @default(false)  // confirmed by clashes/assigned
  projectMcEnabled   Boolean @default(false)  // set in Pass 2: project has model sets

  rawJson    Json?                      // full API payload — forensics + future fields
  fetchRunId String?
  fetchedAt  DateTime @default(now())

  @@index([projectId])
  @@index([isCoordination])
  @@index([clashId])
  @@index([fetchRunId])
  @@index([projectId, isCoordination])  // per-project coordination count
}

model AccIssueFetchRun {
  id                String   @id @default(cuid())
  startedAt         DateTime @default(now())
  finishedAt        DateTime?
  projectsTotal     Int?
  projectsOk        Int?
  projectsForbidden Int?     // 403 — luis not a member; expected
  issuesUpserted    Int?
  coordinationCount Int?
  status            String   @default("running")  // running | done | failed
}
```

Rationale: `rawJson` future-proofs the dataset (no re-fetch for later features); `coordinationSource`
+ `confidence` + `clashValidated` kept separate so the title heuristic's accuracy is auditable against
ground truth. `projectMcEnabled` denormalizes Pass-2 project state onto the issue so the headline count
and audit query stay single-table and fast. No FK to `AccProject` (decision 5).

## Section 2 — Detection & classifier logic

Pure, no I/O — `lib/acc/coordinationClassifier.ts`:

```ts
const TITLE_CLASH_RE  = /\[(\d+)\]\s*$/;                              // ANY trailing [number]
const DESC_LEAD_RE     = /^\s*\d+\s+clash(?:es)?\s+between\b/i;        // "1 clash between …"
const DESC_BETWEEN_RE  = /\bclash(?:es)?\s+between\b[\s\S]*?\band\b/i; // "clash between … and …"
const MODEL_VIEW_RE    = /-\s*\{\s*3D\s*-\s*[^}]+\}/gi;               // " - {3D - luis.cortesWXLY7}"

export interface CoordinationVerdict {
  isCoordination: boolean;
  source: "title" | "description" | null;   // Pass 2 may add "clash-endpoint"
  clashId: string | null;
  confidence: "high" | "medium" | "low" | null;
}

export function classifyCoordination(i: { title?: string | null; description?: string | null }): CoordinationVerdict {
  const t = TITLE_CLASH_RE.exec((i.title ?? "").trim());
  if (t) {
    const confidence = t[1].length >= 4 ? "high" : "low";
    return { isCoordination: true, source: "title", clashId: t[1], confidence };
  }
  const d = i.description ?? "";
  if (DESC_LEAD_RE.test(d))
    return { isCoordination: true, source: "description", clashId: null, confidence: "high" };
  if (DESC_BETWEEN_RE.test(d) && (d.match(MODEL_VIEW_RE) ?? []).length >= 2)
    return { isCoordination: true, source: "description", clashId: null, confidence: "medium" };
  return { isCoordination: false, source: null, clashId: null, confidence: null };
}
```

**Robustness hierarchy:** the title rule is language-proof (`[7256324]` is a bare number, identical in
any UI language); the description rule is English-only (a Spanish-configured project auto-writes
"conflicto entre … y …" and is intentionally missed here); Pass 2's `issueId` reconciliation is the
language- and edit-proof net behind both.

**Test matrix (the unit suite, TDD):**

| Case | Input | Expected |
|---|---|---|
| Real clash (title) | title `… Basic Wall [7256324]` | `true, title, clashId=7256324, high` |
| Real clash (desc) | desc `1 clash between … and …{3D-}…{3D-}` | `true, description, high` |
| Multi-clash plural | desc `3 clashes between …` | `true` |
| Room-number FP | title `Door schedule [204]` | `true` but `confidence=low` (audit catches) |
| Hand-typed "and" | desc `replace the slab and beam` | `false` |
| Spanish auto-text | desc `1 conflicto entre … y …`, no bracket | `false` → Pass 2 net |
| Empty / null | `{}` | `false`, all null |

## Section 3 — Extraction mechanics

**Shared** (`lib/acc/apsAuth.ts`, extracted from `mc-*` scripts): `refreshAndPersistFromDb("data:read")`
— refresh luis's token from `Account`, **persist the rotated refresh_token** (single-use; dropping the
rotation breaks dashboard login). Project universe = the `AccProject` table.

**Pass 1** — `scripts/acc-issues-backfill.cjs`:
```
create AccIssueFetchRun(status=running)
for each project in AccProject (skip projects already complete this run):
   paginate GET construction/issues/v1/projects/{id}/issues
            ?limit=100&offset=N&fields=id,displayId,title,description,status,issueTypeId,issueSubtypeId,createdBy,createdAt
            (loop while offset < pagination.totalResults)   // explicit fields → optimizer can't drop description
   for each issue: verdict = classifyCoordination(issue); upsert AccIssue {…, rawJson, …verdict, fetchRunId}
   catch 403 → projectsForbidden++ (skip); 429/5xx → backoff+retry, else mark incomplete
update run telemetry
```

**Pass 2** — `scripts/acc-issues-validate-clashes.cjs`:
```
for each project (containerId == projectId):
   GET clash/v3/.../modelsets → if none, skip (no MC); else set projectMcEnabled=true for its issues
   for each model set: paginate clashes/assigned → collect issueIds
   reconcile (pure reconcileClashes):
      matched         → clashValidated = true
      clash-only (FN) → isCoordination = true, coordinationSource = "clash-endpoint"
      heuristic-only on MC project (possible FP) → keep, surfaced by audit query
update run
```

Build-time verifications (confirmed against the GET_issues API spec): the list endpoint returns
`description` natively (pin it via `fields=`); pagination is offset-based (`limit`/`offset`/
`totalResults`); this is the live Issues API, so the DC ~25/day quota does **not** apply — standard
per-minute throttling, sequential-with-backoff.

## Section 4 — Output & dashboard integration

Follows the existing RSC pattern (no tRPC/API routes): a server loader + a prop.

**`lib/server/coordinationView.ts`** (5-min cache, mirrors `moduleActivityView.ts`):
```ts
export interface CoordinationSummary {
  totalIssues: number;
  coordinationCount: number;   // validated ∪ heuristic-on-MC-project
  validatedCount: number;      // clashValidated = true
  byStatus: { status: string; count: number }[];
  byProject: { projectId: string; projectName: string; count: number }[]; // top N
  auditCount: number;          // low-confidence, unvalidated
}
```

**`page.tsx`**: add `loadCoordinationSummary()` to the existing `Promise.all`, pass `coordination` into
`<AccessAnalysisCharts/>`.

**`<CoordinationPanel>`** inside `AccessAnalysisCharts` (reuse `ChartPanel` + `chartColors`): headline
coordination count ("X validated by clash data"), status donut, top-projects bar, and a subtle
"N low-confidence hits pending review" footnote.

**Linked follow-up (separate change):** correct the activity donut — drop the name-based Model
Coordination routing in `moduleOverrides.classifyActivity` (those `issue-*` verbs → Build), so the
activity donut measures honest volume and coordination lives here as a count.

**Canonical queries:**
```sql
-- Heuristic Audit: low-confidence, unvalidated coordination hits (review sandbox)
SELECT id, "projectId", "displayId", title, "coordinationSource", "clashId", confidence
FROM "AccIssue"
WHERE "isCoordination" = true AND "clashValidated" = false AND confidence = 'low'
ORDER BY "projectMcEnabled" DESC, "projectId", "displayId";

-- Core coordination count (headline), single-table
SELECT count(*) FROM "AccIssue"
WHERE "isCoordination" = true AND ("clashValidated" = true OR "projectMcEnabled" = true);
```

## Section 5 — Testing & rollout

**Unit (TDD, pure):** `coordinationClassifier.test.ts` (the Section 2 table, written first);
`reconcileClashes.test.ts` (`(storedIssues, clashIssueIds) → {validated, falseNeg, falsePos}`, synthetic).

**Single-project smoke test — the gate before any full run:**
```
node scripts/acc-issues-backfill.cjs        --project=13010c62-8128-49a5-a9e1-7e6767735f07 --dry-run
node scripts/acc-issues-validate-clashes.cjs --project=13010c62-8128-49a5-a9e1-7e6767735f07 --dry-run
```
Dry-run writes nothing; prints coordination count, sample flagged titles + rule fired, and Pass-2
precision/recall (matched / false-neg / false-pos) vs the clash ground truth. **Win condition:** on this
known MC-heavy PREPATEC project, heuristic and clash-endpoint counts agree (or gaps are explainable —
edited titles, Spanish text), verified against ACC's own UI, before the full scan.

**Rollout:**
1. Migration `AccIssue` + `AccIssueFetchRun` (mind the local pgvector migrate caveat — raw `ALTER` + resolve if needed).
2. Unit suite green + `tsc` clean (evidence before claims).
3. Single-project dry-run reconciles → user sign-off.
4. Full Pass 1 → Pass 2; check `AccIssueFetchRun` telemetry + eyeball the audit bucket.
5. Wire `<CoordinationPanel>`, then rebuild to deploy (`npm run build` + restart — **not** under the running :3000).

## Out of scope (YAGNI)

Scheduled/incremental sync (deferred until proven); member-only projects absent from `AccProject`;
non-English description matching (title rule + Pass 2 cover it); editing the live roles/modules
components; the activity-donut Model-Coordination correction (linked follow-up, separate change).

## Sources

ACC Issues API `GET projects/{projectId}/issues` (offset pagination, `fields` param, `description` in
list payload); ACC Model Coordination clash endpoints `clash/v3/.../modelsets`, `clashes/assigned`
(proven in `scripts/mc-list-assigned.cjs`); activity misattribution evidence in
`docs/superpowers/specs/2026-06-03-modules-by-activity-design.md` + `scripts/diag-activity-*.cjs`.

## Implementation addendum (2026-06-05, shipped + deployed)

Four corrections vs the design above, learned by running it against the live API/data:

1. **DROP the `fields=` param** (Section 3, line ~173). It corrupts `deleted` (returns `true` for every
   issue, even active ones) AND under-returns issues by ~3,000. The no-fields list returns the full
   ~42-field object with correct `deleted` and `description` natively — so we store the genuinely full
   `rawJson`. Fixed in `acc-issues-backfill.cjs`.
2. **Model-set listing endpoint is `bim360/modelset/v3/containers/{id}/modelsets`** (service base
   `modelset`, not `clash/v3`). The assigned-clashes endpoint stays `clash/v3`.
3. **Final data:** 14,233 issues; **1,765 clash-validated** Model-Coordination issues (0 false positives;
   825 recovered by Pass 2 that the English heuristic missed — Spanish auto-text + edited titles). Coverage
   is a FLOOR: 427 accessible projects, 123 credential-blocked (`docs/forbidden-projects.md`). Surfaced as
   a panel footnote.
4. **Dashboard pivot (Section 4 superseded).** Per owner, the standalone `<CoordinationPanel>` was replaced
   by an **integrated companion under the module-activity donut**, sharing the one project picker; and the
   "linked follow-up" activity-donut correction was DONE as part of this (issue-* → Build, `*-collection` →
   Data Management, `modelCoordination` dropped from `donutModules()`). New units: `coordinationCounts.ts`
   (pure `summarizeCoordination`), `lib/server/coordinationByProjectView.ts` (per-(project,status) rows +
   coverage), `components/CoordinationByProject.tsx`. Removed: `CoordinationPanel.tsx`, `coordinationView.ts`.
   Gates: unit 1498 / tsc 0; rebuilt + redeployed.
