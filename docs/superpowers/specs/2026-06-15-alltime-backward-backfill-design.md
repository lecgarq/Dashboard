# All-time backward backfill campaign — design

**Date:** 2026-06-15
**Status:** Draft (awaiting user review)
**Branch:** feat/access-analysis-redesign

## Goal

Pull each DC-extractable project's full pre-cap history into `AccActivity` so the
dashboard stops missing early activity. The nightly forward job covers the rolling
~12 months (roughly mid-2025 → today); this campaign fills everything *older* than
that cap, spending the daily Data Connector quota efficiently and resuming across
days until every target project is covered back to its start.

## Decisions (locked with owner)

| Question | Decision |
| --- | --- |
| Strategy | **All-time bulk** via `dc-extract-id-list.cjs` (one `CUSTOM` request grabs a project's whole window), not the slow 30-day nightly slices. |
| Scope | **428 known-extractable projects only** (present in `AccDcProject`). The ~724 currently-403 projects are out of reach without an Account Admin grant. |
| Window | **startDate = project start (all-time, `2019-01-01`) → endDate = `2025-06-30`.** The recent rolling year is already owned by the nightly forward job, so we don't re-pull it. |

## Non-goals

- Unlocking the 724 403-locked projects (needs Autodesk Account Admin; out of scope).
- Changing the nightly forward ingest logic. We only *pause* it during the campaign.
- Re-pulling mid-2025 → today (the daily job already covers it).

## Components

Two new files; the extractor is reused unchanged. Each piece has one job.

### 1. `scripts/dc-build-extract-list.cjs` — decides WHAT (new)

Read-only DB query that writes an **ordered ID file** of projects still needing
history.

- **Base set:** active projects that DC has acknowledged (rows in `AccDcProject`).
- **Exclude already-covered:** drop any project whose
  `AccDcBackfillProgress.earliestCovered` is already at/below its floor
  (`projectCreatedAt`, or the `2019-01-01` all-time floor). A project is "done"
  once one successful all-time→June-2025 request has landed.
- **Order:** by recent activity volume (descending) so the most valuable history
  is extracted first if a day's quota runs out.
- **Output:** newline-separated project IDs to a file path (default
  `tmp/dc-extract-list.txt`), plus a printed summary (count, est. requests).
- **Resume mechanism:** re-running this each day regenerates the *remaining* work.
  No separate state needed — `earliestCovered` is the source of truth.

### 2. `scripts/dc-alltime-backfill.ps1` — runs it (new)

Wrapper, mirrors the existing `dc-backfill-*.ps1` style (Set-Location, timestamped
log under `logs/`, `Tee-Object`). It:

- Runs `dc-build-extract-list.cjs` to (re)generate the ID file.
- Sets env and invokes `dc-extract-id-list.cjs`:
  - `DC_IDS_FILE=tmp/dc-extract-list.txt`
  - `DC_START_DATE=2019-01-01T00:00:00.000Z`
  - `DC_END_DATE=2025-06-30T23:59:59.999Z`
  - `DC_MAX_REQUESTS=<day's safe budget, e.g. 20>` — hard cap on quota spent today.
  - `DC_NO_BISECT=1` — these are known-good projects; a 403 mid-run skips that one
    rather than burning units bisecting.
- Logs start/end banners and exit code.

### 3. `scripts/dc-extract-id-list.cjs` — reused as-is (HOW)

Already has every guard we need: `DC_MAX_REQUESTS`, `DC_NO_BISECT`, `DC_DRY_RUN`,
50-project chunking, `earliestCovered` advancement, and `AccDataConnectorJob`
rows so quota counting stays correct. **No changes.**

## Execution sequence

1. **Retention probe (GATE).** Build a 1-project list, run the extractor with
   `DC_DRY_RUN=1` (validate auth + plan, submit nothing), then run it for real for
   that one project. Inspect how far back the returned rows actually reach.
   **This answers the open unknown: does APS actually serve pre-2025 data, or does
   it silently clamp to a retention window?** Do not proceed to the full list until
   this is confirmed.
2. **Pause the nightly cron** by creating `.dc-ingest.disabled` (kill-switch), so
   the 3 AM forward job neither contends for quota nor trips the
   "refuse to start: a request is in-flight" guard.
3. **Run the wrapper** (build list → extract). Day 1 spends up to the safe budget.
   ~9 requests should cover all 428 if jobs are healthy; may spill 1–2 days if jobs
   are slow or some projects 403.
4. **Resume daily** (re-run the wrapper) until `dc-build-extract-list.cjs` reports
   zero remaining projects.
5. **Re-enable the nightly cron** (delete `.dc-ingest.disabled`). Normal forward
   catch-up resumes on a now-complete history base.

## Risks & mitigations

- **Handoff-boundary assumption.** This campaign ends at `2025-06-30` on the
  assumption that the nightly forward job's coverage already reaches back to ~mid-2025.
  If the nightly job's real floor is later (e.g. early 2026), a gap would remain
  between `2025-06-30` and that floor. The plan should confirm the nightly job's
  actual `earliestCovered` floor; if there's a gap, either extend `DC_END_DATE` to
  meet it or run one catch-up pass for the gap window.
- **APS retention unknown.** Mitigated by the probe gate (step 1). If APS clamps,
  we record the real floor and accept it as the achievable target.
- **Single-use refresh-token rotation.** The extractor refreshes *and persists* the
  Autodesk refresh token; a crash mid-refresh is the one thing that could break
  dashboard login (it has before). The 1-project probe surfaces this safely before
  any large run. Recovery path: `scripts/aps-login.cjs`.
- **Admin-CSV quarantine.** The extractor pulls `serviceGroups: ["activities","admin"]`;
  a 50-project admin CSV is *partial* vs. the full-account baseline. The plan must
  verify whether `ingestActivityZip` (used directly here) runs the snapshot-diff that
  would quarantine a partial CSV. If it does, add the equivalent of
  `DC_SKIP_ADMIN_SNAPSHOT` to the wrapper.
- **Quota contention.** Mitigated by pausing the nightly cron (step 2) and by
  `DC_MAX_REQUESTS` bounding each day's spend.

## Validation (definition of done)

- `dc-build-extract-list.cjs` reports **0 remaining** projects.
- Per-project `min(AccActivity date)` reaches the project's floor (or the confirmed
  APS retention floor) for the target window.
- Spot-check: a few projects created before 2025 show rows dated well before
  2025-06-30.
- Dashboard login still works (token not broken); nightly cron re-enabled and its
  next run logs a normal forward catch-up.
