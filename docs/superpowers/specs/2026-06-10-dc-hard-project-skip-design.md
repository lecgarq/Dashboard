# DC Hard Project Skip Design

Date: 2026-06-10

## Goal

Prevent Data Connector activity backfill from spending quota on non-material projects.
The extractor must continue pulling all relevant activity for projects that matter,
but it must hard-skip obvious training, demo, template, test, and sharespace projects
even when those projects remain in `lib/acc/mty-allowlist.json`.

No more DC extraction runs should be started until this gate is implemented and
verified.

## Approved Rule

The project candidate set is:

1. Keep the existing MTY allowlist constraint.
2. Exclude any allowlisted project whose normalized name contains one of these
   low-value terms:

   - `demo`
   - `template`
   - `pre-template`
   - `test`
   - `prueba`
   - `sharespace`
   - `training`
   - `capacitacion`
   - `sandbox`
   - `sample`
   - `takeoff`
   - `vdc`

Normalization removes accents, lowercases, and handles punctuation/spacing so
`Pruebas`, `PRE-TEMPLATE`, `MTY BIM Sharespace`, and `VDC / MONTERREY` are all
excluded.

## Scope

This change applies to the production DC backfill planner path before slices are
created. Excluded projects must never enter `planDailySlice` output, so they
cannot be submitted to APS and cannot consume quota.

This change does not delete existing database rows or historical activity already
ingested for excluded projects. Existing rows can remain for audit/history; the
goal is preventing new quota spend.

## Implementation Shape

Create a small reusable predicate in the ACC extraction layer:

- `normalizeProjectNameForExtractionFilter(name)`
- `isLowValueExtractionProjectName(name)`
- `isDcBackfillEligibleProject(projectId, name)`

Wire the predicate into `lib/acc/dcProgressiveBackfill.ts` where the current MTY
allowlist filter already runs. The filter becomes:

```ts
projects.filter((p) => mtySet.has(p.projectId) && !isLowValueExtractionProjectName(projectName))
```

Because `ProjectProgress` currently does not carry `name`, the planner input must
be extended with an optional project name, and `loadProjectProgress` in
`lib/acc/dcIngest.ts` must hydrate it from `AccDcProject`.

## Priority Planner Alignment

The priority planner currently classifies some low-value names into
`skip_archived_or_demo`, but priority lane is not a hard exclusion. Keep that lane
for reporting, but do not rely on it for quota protection. The hard skip belongs
in slice generation.

## Tests

Add unit coverage for:

1. `planDailySlice` excludes allowlisted projects named demo/template/prueba/etc.
2. Legitimate MTY allowlisted projects still generate slices.
3. Accent/case/punctuation normalization catches `PRUEBA`, `Pruebas`,
   `PRE-TEMPLATE`, `Sharespace`, and `VDC`.
4. `runDcIngest` does not submit a request when the only pending projects are
   excluded low-value names.

## Verification

Before any next live DC run:

1. Unit tests pass for the filter and ingest planner.
2. A dry-run audit lists zero runnable projects matching the excluded keywords.
3. `node scripts/scratch/check-current-allowlist-names.cjs` may still show old
   allowlist entries, but the planner audit must prove they are not runnable.

## Operational Command

After verification, manual continuation should keep using:

```powershell
$env:DC_SKIP_ADMIN_SNAPSHOT='1'
node -r dotenv/config scripts\dc-daily-ingest.cjs
```

Only run this after the hard skip tests and audit pass.
