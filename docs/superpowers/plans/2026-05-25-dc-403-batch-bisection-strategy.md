# P0 — Data Connector 403 Batch Bisection Strategy

> **Status:** READ-ONLY STRATEGY PLAN. No implementation yet. Evaluates options and
> specifies an implementation path if approved. Execution gated on explicit go-decision.

**Goal:** Prevent one (or a few) Data-Connector-inaccessible project(s) from failing an
entire ≤50-project `POST /requests` batch, so the accessible projects in that batch still
get ingested — without wasting quota or corrupting `AccDcBackfillProgress`.

**Context that motivated this:** the 2026-05-25 value-first reserve run processed 4 slices;
2 succeeded (~57k rows) but **2 full batches (50-proj + 15-proj) were 403-skipped wholesale**
on `403 "Invalid user access level for the specified projects/account"`. ~65 projects got
nothing this run even though most are almost certainly accessible — only a few bad projects
sank each batch.

---

## 1. Current 403 behavior in `runDcIngest`

**`dcSubmit` (`lib/acc/dcIngest.ts:180-241`):**
- `429` → throws `QuotaExceededError` (`:206-208`).
- `5xx` → retries up to 4× with exponential backoff (`:226-235`).
- **Any other non-OK status, including `403`** → throws `Error("POST /requests 403: …")`
  immediately (`:236`). No retry, no bisection. (A 403 is deterministic — retrying the
  same project set will 403 again, so retry would be pure quota/time waste.)

**`executePlan` per-slice loop (`lib/acc/dcIngest.ts:1099-1135`):**
- Submit success → `quotaUsed += 1`, persist run row, poll, ingest.
- `QuotaExceededError` → `finalize(... 'quota-paused')` and return (`:1119-1130`).
- **Any other submit error (incl. 403)** → `console.error("[dcIngest] Submit failed for
  slice: …")` then **`continue`** (`:1131-1134`) → the **entire batch of up to 50 projects
  is skipped**, no quota charged, no coverage advanced.
- Final run status is `'partial'` when any slice was skipped (`:1440`).

**Net:** 403 is handled safely (no crash, no quota burn, no coverage corruption) but
**bluntly** — one bad project discards up to 49 good ones for that run. They'll be retried
next day, but will 403 again indefinitely as long as the bad project stays in the bucket.

## 2. Where failed `POST /requests` is handled

Two layers:
- **Throw site:** `dcSubmit` `:236` (`throw new Error('POST /requests {status}: …')`) and
  `:238-240` (gave-up-after-retries). 429 is the only status converted to a typed error
  (`QuotaExceededError`); everything else is a generic `Error` with the status in the message.
- **Catch site:** `executePlan` `:1118-1135`. The branch at `:1131-1134` is the sole handler
  for non-quota submit failures → log + `continue`. **This is the single insertion point**
  for bisection: today it gives up on the slice; instead it could split and re-attempt.

There is no status code on the thrown error object today — only an interpolated string.
Bisection needs to distinguish 403 from other failures, so the design must surface the
status (see §4).

## 3. How the older `dc-custom-chunks` script bisected batches

`scripts/dc-custom-chunks-3leg.cjs` → `processProjectSet(ctx, projectIds, label)` (`:259-303`):
- Submits the set; on success, ingests; returns `{submitted, success}`.
- On error:
  - if `err.status === 429` → **rethrow** (stop; don't bisect a quota failure) (`:281-283`).
  - else mark the `AccDataConnectorJob` row failed, then:
    - if `projectIds.length === 1` → push `{projectId, reason}` to a `skipped[]` list and
      return (the single project is isolated as the culprit) (`:290-292`).
    - else split in half (`mid = ceil(len/2)`) and **recurse** into left and right halves,
      summing results (`:294-301`).
- The top-level `main` collects `skipped[]` and prints it in the summary (`:343-344`).

Key differences from `runDcIngest`: it (a) carried `err.status` (so it could special-case
429), (b) recursed to isolate culprits, (c) accumulated a `skipped[]` denylist for the run.
It bisected on **any** non-429 error, not just 403.

## 4. Whether bisection should apply only to 403

**Recommendation: bisect only on 403 "invalid access level" (and structurally-similar
per-project authorization 403s); do NOT bisect other failures.** Rationale:
- 403 invalid-access is **deterministic and project-specific** — bisection provably isolates
  the culprit and salvages the rest. This is the exact failure class observed.
- `5xx` is transient → already handled by `dcSubmit`'s retry; bisecting would waste quota.
- `429` must **never** bisect (each sub-request burns quota against an exhausted budget) —
  keep the existing `QuotaExceededError` short-circuit ahead of any bisection.
- Poll/ingest failures (post-submit) are not submit-authorization issues; leave their current
  skip behavior.
- Generic 4xx other than 403 (e.g. 400 malformed) won't be fixed by bisection — leave as
  skip, log loudly.

**Required enabler:** give the submit error a machine-readable status. Introduce a typed
`DcSubmitForbiddenError` (carrying `status: 403` and the project set) thrown by `dcSubmit`
at `:236` when `res.status === 403`, mirroring how `QuotaExceededError` is already special-cased.
`executePlan`'s catch then branches: `QuotaExceededError` → pause; `DcSubmitForbiddenError`
→ bisect; else → skip (current behavior).

## 5. How to avoid wasting quota

Bisection multiplies requests, so guardrails are essential:
- **Quota-checked recursion:** before each sub-batch submit, re-check remaining budget
  (`buildQuotaBudget` / `safeRemainingToday`, as the main loop already does). If a bisection
  step would exceed the remaining budget, **stop bisecting**, leave the un-probed projects for
  a future run (they stay uncovered, which is correct), and mark `quota-paused`/`partial`.
- **Depth/width cap:** cap recursion (e.g. stop subdividing below a floor size, or cap total
  extra requests per original batch, e.g. `DC_BISECT_MAX_REQUESTS`). Below the floor, skip the
  residual sub-batch rather than probing single projects, to bound worst-case quota.
- **Single-project isolation only when affordable:** full isolation of one culprit in a
  50-project batch can cost up to ~⌈log2(50)⌉≈6 extra requests in the worst case (one bad
  project) — acceptable; but a batch with many scattered bad projects degrades toward O(n).
  The width cap prevents that pathological case.
- **Successful halves still cost 1 quota each** — that is the intended spend (they ingest real
  data), not waste.
- **Persistent denylist (see §8)** is the real long-term quota saver: once a project is known
  inaccessible, exclude it at planning time so no batch ever 403s on it again.

## 6. How to preserve `AccDcBackfillProgress` correctness

- Coverage must advance **only for projects in a sub-batch that actually ingested
  successfully** — never for a 403-skipped/never-probed project. Today progress updates happen
  only on the success path, so the invariant holds; bisection must preserve it by updating
  progress per **successful sub-batch**, using that sub-batch's exact `projectIds` (not the
  original 50).
- A project isolated as the culprit gets **no coverage change** (it was never successfully
  pulled) — so the next run re-plans it normally (or skips it via denylist).
- Idempotency unchanged: `createMany({ skipDuplicates: true })` means overlapping re-pulls of
  the accessible projects are safe.
- `AccDcBackfillProgress` remains the source of truth; bisection changes *which* projects get
  covered in a run, never the window math (`dcProgressiveBackfill.ts` untouched).

## 7. How to log inaccessible projects

- On each 403 sub-batch that narrows to a single project (or a sub-batch the denylist confirms
  bad), log a structured line: `[dcIngest] inaccessible project pid=<id> name=<name>
  reason=403-invalid-access slice=<window/reason>`.
- Emit a per-run summary: count of batches bisected, extra requests spent, and the list of
  newly-identified inaccessible project IDs (mirrors `dc-custom-chunks`' `skipped[]` summary
  at `:343-344`).
- Surface the count on the `AccDcIngestRun` telemetry row (e.g. a `bisectedRequests` /
  `inaccessibleProjects` field) so the progress monitor can show it. (Schema add — gate behind
  the same decision; optional for v1, can log-only first.)

## 8. Suppression/denylist table vs skip-within-run

Two tiers; recommend **both, phased**:
- **v1 — skip within the run (no schema):** bisection isolates culprits per run and logs them.
  Zero migration, fully reversible. But every subsequent run re-discovers the same bad
  projects, paying the bisection quota tax again — wasteful at steady state.
- **v2 — persistent denylist:** a small table (e.g. `AccDcInaccessibleProject { projectId PK,
  firstSeenAt, lastSeenAt, reason, attempts }`) OR a boolean/`inaccessibleAt` column on the
  existing `AccDcProject` / `AccDcBackfillProgress`. The planner (`dcProgressiveBackfill` input
  prep in `dcIngest`) excludes denylisted projects from slices, so batches stop 403ing
  entirely → bisection rarely fires → quota saved. Include a **re-probe TTL** (e.g. retry a
  denylisted project after N days) because access can be granted later.

**Recommendation:** ship v1 first (behavior win, no schema risk), then add v2 as a follow-up
once v1 confirms the failure rate justifies a table. Reuse the existing pattern: denylist
exclusion happens at the same read-only input-prep layer as `loadProjectProgress` /
`loadPriorityInputs`, keeping `dcProgressiveBackfill.ts` pure.

## 9. Unit / integration test strategy

Bisection logic should be a **pure, injectable function** so it's unit-testable without APS:
- Extract `bisectOnForbidden(projectIds, submitFn, opts)` where `submitFn(ids) => Promise<result>`
  is injected (real = `dcSubmit`+ingest; test = a fake that 403s for a designated "bad" set).
- **Unit tests (pure, mocked submitFn):**
  - single bad project in 50 → isolates it; all 49 others ingest; culprit recorded; request
    count ≤ cap.
  - two scattered bad projects → both isolated; good ones ingest.
  - all-good batch → no bisection, exactly 1 request.
  - all-bad batch → degrades gracefully under the width cap; no infinite recursion.
  - 429 raised mid-bisection → stops immediately, propagates `QuotaExceededError` (never
    bisects a quota failure).
  - budget exhausted mid-bisection → stops, leaves residual unprobed, returns partial.
  - determinism: same inputs → same split sequence (deterministic mid-point).
- **Integration (in `dcIngest.test.ts`, mocked APS layer):** a slice whose submit 403s once
  then succeeds for the good half → assert `AccDcBackfillProgress` advanced ONLY for the good
  sub-batch's projects, quotaUsed counts only successful sub-requests, run status reflects
  partial + bisection summary. Reuse the DI/mock patterns established for the priority wiring.
- **Negative/coverage-correctness:** assert the isolated culprit's progress row is unchanged.
- Full `npm test` + `tsc --noEmit` green; no graph/P6 files touched.

## 10. Rollback strategy

- **Feature flag, default off:** gate bisection behind `DC_403_BISECT=1` (default = current
  blunt skip-the-batch behavior, byte-for-byte). Flip off to revert instantly with no redeploy.
- **No window/quota math change:** bisection lives only inside `executePlan`'s 403 catch
  branch + an injected pure helper; reverting the wiring commit restores the original
  `continue`.
- **v1 is schema-free** → nothing to migrate back. **v2 denylist** (if built) must be additive
  (new table or nullable column) and the planner exclusion gated behind the same/another flag,
  so disabling the flag ignores the table without a down-migration.
- **Data safety:** bisection only *adds* successful ingests (idempotent) and *withholds*
  coverage from failures — it cannot corrupt existing coverage, so rollback can't lose data.

## 11. Decision gate (recommendation)

Recommend **phased**: (A) implement v1 = flag-gated, quota-capped, 403-only bisection with an
injected pure `bisectOnForbidden` helper + logging, default off; trial it the same way as the
priority flag. (B) If logs show a stable set of inaccessible projects, add v2 denylist with a
re-probe TTL to stop paying the bisection tax every run.

**Out of scope / explicitly excluded:** no changes to `dcProgressiveBackfill.ts` window math,
`extractionPriorityPlanner` ranking, `AccDcBackfillProgress` semantics, or any
graph/P6/access-analysis files. `AccDcBackfillProgress` stays the source of truth.

**Awaiting go-decision before any code change.**
