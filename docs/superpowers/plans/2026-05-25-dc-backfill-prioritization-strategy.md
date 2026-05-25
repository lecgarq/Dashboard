# P0 — DC Backfill Prioritization Strategy

> **Status:** IMPLEMENTATION COMPLETE (2026-05-25) on branch `feat/access-analysis-redesign`.
> All 5 tasks in §10 shipped. Feature flag default OFF (`DC_PRIORITY_BACKFILL` unset =
> fair breadth-first, byte-for-byte unchanged). Enable with `DC_PRIORITY_BACKFILL=1`.
> Tasks shipped: (1) pure reorder adapter (`dcBackfillPriority.ts`), (2) fairness reserve
> (`composePrioritizedSlices` + `resolveFairnessReserve`), (3) read-only loader
> (`loadPriorityInputs`), (4) flag-gated wiring + fallback in `resolveSlicesForBudget`,
> (5) observability logging + flag docs in cron header.

**Goal:** Decide whether to keep the current *fair, breadth-first* Data Connector
backfill or upgrade to a *value-first* ordering that spends scarce quota on the
highest-value projects first — by feeding the existing `extractionPriorityPlanner`
ranking into the existing `dcProgressiveBackfill` slice planner.

**Architecture (proposed, if approved):** Leave the progressive backward/forward
slice *math* untouched. Insert a single deterministic **re-ordering seam** between
slice planning and quota truncation so that high-value projects' slices are
presented to `limitSlicesToBudget` first. Add a starvation guard so low-priority
projects are never indefinitely deferred.

**Tech Stack:** TypeScript, Prisma (Postgres adapter `@prisma/adapter-pg`), Vitest,
date-fns, APS Data Connector v1 REST API.

---

## 1. Current backfill architecture

**Entry point → planner → executor chain:**

| Layer | File | Responsibility |
|---|---|---|
| Cron entry | `scripts/dc-daily-ingest.cjs` | Kill-switch pre-flight (`.dc-ingest.disabled`), Prisma init, calls `runDcIngest`, maps status → exit code |
| Orchestrator | `lib/acc/dcIngest.ts` → `runDcIngest()` | Discovery, progress load, plan, quota-limit, execute, snapshot, finalize |
| Slice planner (pure) | `lib/acc/dcProgressiveBackfill.ts` → `planDailySlice()` | Breadth-first backward + forward 30-day slices, bucketed into ≤50-project requests |
| Quota model (pure) | `lib/acc/dcQuota.ts` → `buildQuotaBudget()` | Safe budget / reserve / hard-cap math |
| Coverage ledger | Prisma model `AccDcBackfillProgress` | Per-project `earliestCovered` / `latestCovered` / `newProjectFlag` / `projectCreatedAt` |
| Priority ranker (pure, **not in ingest path**) | `lib/acc/extractionPriorityPlanner.ts` → `buildExtractionPriorityPlan()` | Lanes + score ranking for the dashboard |

**Control flow inside `runDcIngest` (verified line references):**

1. `loadProjectProgress(prisma)` — `dcIngest.ts:463`. Returns `ProjectProgress[]`
   from `prisma.accDcBackfillProgress.findMany()` **with no `orderBy`** → rows come
   back in unspecified DB order. This is the "fair / blind" behavior today.
2. `planDailySlice(progress, yesterday)` — `dcIngest.ts:698`. Pure function in
   `dcProgressiveBackfill.ts:127`. For each project emits:
   - **new-project** slice (one 30-day window) when `newProjectFlag` / no coverage;
   - **backward** slice `[max(earliest-30d, projectCreatedAt), earliest]` when history remains;
   - **forward** slice `[latest-1d, yesterday]` when behind.
   Slices sharing an identical `(start|end|reason)` are bucketed and chunked into
   ≤`PROJECT_BATCH_LIMIT` (50) project IDs. **Bucketing preserves input order**
   (`dcProgressiveBackfill.ts:138-147`).
3. `buildQuotaBudget({ usedToday, dailySafeRequestBudget })` — `dcIngest.ts:740`.
4. `limitSlicesToBudget(plan.slices, quotaBudget.safeRemainingToday)` — `dcIngest.ts:744`.
   **Takes the first N slices that fit remaining quota; the rest become
   `deferredRequests`.** → **Slice ordering is the lever that decides who gets quota.**
5. `executePlan(...)` — `dcIngest.ts:763`. Submits each slice to APS, ingests CSVs,
   and calls the progress-update path. If `deferredRequests > 0`, final status is
   `quota-paused` (resume next day); else `success`.

**Key property:** correctness is owned by the `AccDcBackfillProgress` ledger plus
`applySliceCompletion` (`dcProgressiveBackfill.ts:171`) and `createMany({ skipDuplicates: true })`.
Ordering changes *which* slices run on a given day, never *what window* a slice covers.

## 2. Current quota budget

From `lib/acc/dcQuota.ts`:

- `DAILY_QUOTA_CAP = 25` — APS hard cap (requests / UTC-day / user).
- `DAILY_SAFE_REQUEST_BUDGET = 20` — default daily spend; leaves a 5-request reserve.
- Reserve (21–25) is reachable only via `DC_DAILY_SAFE_BUDGET` env override
  (`dcIngest.ts:737`), clamped to `[0,25]`. Documented as a manual recovery lever;
  not set in the cron environment.
- One successful `POST /requests` = one quota unit (`dcProgressiveBackfill.ts:63`,
  estimatedQuota = slice count).
- Quota spent today = `loadQuotaUsedToday` (`dcIngest.ts:499`): sums
  `AccDcIngestRun.quotaUsed` + legacy `AccDataConnectorJob` rows for the current UTC day.
- Exhaustion (budget hit or HTTP 429) → `quota-paused`, clean exit, auto-resume next
  day (`dcIngest.ts:748`, `:880`, `:909`).

**Observed live state (2026-05-25):** 12 of 20 safe budget already spent today across
4 runs (8 safe remaining; 13 to hard cap).

## 3. Remaining request estimate

Computed read-only by `scripts/scratch/quota-remaining-estimate.cjs` against the live
local Postgres (no DC API calls), using the same window math as `dcProgressiveBackfill.ts`:

| Quantity | Value |
|---|---|
| Total projects | 428 |
| Low-value / archived / demo skipped | 111 |
| Real candidate projects | ~317 |
| Uninitialized (need first 30-day pull) | 0 |
| Projects needing **backward** history | 129 → **1,257** 30-day slices |
| Projects needing **forward** catch-up | 317 → **317** slices (pack well) |
| Per-project slice total (worst case, no packing) | 1,574 |
| Packed estimate (forward/new batched 50/req) | **~1,260 requests** |
| Calendar time @ 20/day (safe) | **~63 days** |
| Calendar time @ 25/day (hard cap) | **~51 days** |

**Cost asymmetry that motivates this plan:** forward slices share the same end date
(yesterday) → ~50 projects collapse into 1 request (cheap). Backward slices have
*project-specific* `earliestCovered` → they rarely share a window and almost never
pack → **the 1,257 backward slices are the entire long tail.** Ordering only matters
because that tail spans ~7–9 weeks; *which* projects get their history in week 1 vs
week 9 is exactly the decision.

## 4. Project prioritization criteria

Reuse the criteria already encoded in `extractionPriorityPlanner.ts` (no new taxonomy):

**Lanes** (`ExtractionPriorityLane`, `extractionPriorityPlanner.ts:3`), ranked
`use_quota_first` (0) → `needs_activity_backfill` (1) → `needs_permissions_crawl` (2)
→ `good_coverage` (3) → `skip_archived_or_demo` (4).

**Score components** (`scoreProject`, `:175`):
- Member count tier: +20 / +15 / +10 / +5 (`scoreMemberCount`, `:116`).
- Activity recency: +40 if zero rows, +25 if ≤3 active days, +10 if ≤10.
- Formal backfill state: uninitialized +35, new_project +30, stale +25, partial +10.
- Folder crawl not ok/partial: +8.
- Missing expected services (`docs, issues, rfis, submittals, sheets`): +3 each, cap +12.
- Low-value (archived/inactive or name matches
  `/\b(demo|template|test|sandbox|training|capacitacion|migracion)\b/i`): −100.

**Deterministic tiebreak** (`:307`): `laneRank` → `score` desc → `memberCount` desc →
`projectName` locale compare. **Determinism is a hard requirement** for resumability (§7).

**Decision criterion for this plan:** value = member count + activity intensity +
coverage gap. The ranker already expresses this; we consume its `rank`/`lane`, not
re-derive it.

## 5. Where `extractionPriorityPlanner` is currently used

- **Production:** exactly one call site — `server/routers/acc-sync.ts:555`
  (`buildExtractionPriorityPlan(...)`), a tRPC query that powers a dashboard
  "where to spend quota" view. **It does not touch the ingest/cron path.**
- **Tests:** `lib/acc/extractionPriorityPlanner.test.ts`.
- Its `quotaPlan.batches` output (`extractionPriorityPlanner.ts:322-334`) builds
  ≤50-project batches **against a single fixed analysis window** (`from..to`), **not**
  the progressive backward/forward windows. **Therefore its batches must NOT be used
  as the ingest plan directly** — doing so would ignore per-project coverage and
  re-pull already-covered windows. We consume only its **ranking**.

## 6. How it would plug into `dcProgressiveBackfill` / `dcIngest`

**Design principle:** keep `dcProgressiveBackfill.ts` pure and untouched. Add ordering
as a thin, pure, testable adapter, applied *after* `planDailySlice` and *before*
`limitSlicesToBudget`.

**Chosen seam — sort `plan.slices` by project priority before truncation:**

- Build a `priorityByProjectId: Map<string, number>` (lower = more important) from
  `buildExtractionPriorityPlan(...).rankedProjects[].rank`.
- A slice can carry up to 50 project IDs; its sort key = the **best (min) rank** among
  its members, with deterministic tiebreaks (reason order
  `new-project` < `forward` < `backward`, then earliest `start`, then first projectId).
- Sort a copy of `plan.slices` with that comparator, then pass the sorted array to
  `limitSlicesToBudget`. **No change to window math, bucketing, or quota math.**

**Why this seam (vs reordering `progress` before `planDailySlice`):** sorting
`progress` would change bucket *membership* order and could split a high-value project
across batch boundaries unpredictably. Sorting *slices* leaves buckets intact and
makes "the 20 we run today" a clean prefix of a priority-sorted list — which is exactly
what `limitSlicesToBudget` already consumes.

**New inputs required in the ingest path:** `buildExtractionPriorityPlan` needs
`projects` (name/status/createdAt/folderCrawlStatus/memberCount), `activity`
(rows/activeDays/services/lastActivityAt), and `backfillProgress`. `dcIngest` today
loads only `backfillProgress`. Add read-only local-DB queries mirroring those in
`server/routers/acc-sync.ts:555` (reuse the same query shapes). These are local
Postgres reads — **zero DC quota cost**.

**Starvation guard (required, see §7):** reserve a small fixed fraction of each day's
runnable budget for a round-robin over the *oldest-progressed* projects
(`updatedAt asc`), so the lowest-priority backward gaps still advance. Proposed:
`reservedFairnessRequests = max(1, floor(runnableToday * 0.2))`. Tunable via
`DC_FAIRNESS_RESERVE`. The fairness slot picks from projects NOT already selected by
the priority prefix that day.

**Feature flag:** gate the entire reordering behind `DC_PRIORITY_BACKFILL=1`
(default off → byte-for-byte current behavior). This is the rollback lever (§9).

## 7. Risks

1. **Quota waste.**
   - *Risk:* reordering causes a project to be pulled in fragments (history advances a
     little, then quota jumps elsewhere), producing many small windows.
   - *Reality:* the progressive planner always resumes from `earliestCovered`, so a
     half-done project simply continues later — **no re-pull, no wasted request.**
   - *Residual:* priority *thrash* (score depends on activity which changes daily)
     could spread quota thin across many projects without finishing any. *Mitigation:*
     order by **lane first** (coarse, stable) then score; lanes change slowly.

2. **Duplicate pulls.**
   - *Risk:* emitting overlapping windows.
   - *Reality:* reordering never changes window math (`dcProgressiveBackfill.ts`
     untouched). `applySliceCompletion` + `createMany({ skipDuplicates: true })` make
     re-runs idempotent. *Test:* assert reordering preserves the exact multiset of
     `(projectId,start,end,reason)` vs the unordered plan (§8 T2).

3. **Starving low-priority projects.**
   - *Risk:* value-first by construction defers low-value backward history; if
     high-value projects always have backward gaps, low-value ones never advance.
   - *Mitigation:* the §6 fairness reserve (≥20% of daily runnable budget on
     oldest-`updatedAt` projects). *Test:* a project with the worst score still
     appears in the runnable set within N days (§8 T4).

4. **Breaking resumability.**
   - *Risk:* `quota-paused`/resume assumes deterministic ordering; nondeterministic
     ties would interleave runs unpredictably.
   - *Reality:* correctness survives any order (ledger is source of truth), but
     **predictability** requires deterministic comparators. *Mitigation:* total-order
     comparator with full tiebreaks (§4); no `Math.random`, no `Date.now()` inside the
     sort key. *Test:* same inputs → identical slice order across repeated calls (§8 T3).

5. **(Added) New DB reads add latency / failure surface.**
   - *Mitigation:* wrap the priority-input load in try/catch; on any failure, **fall
     back to current unordered behavior** and log a warning. Priority is an
     optimization, never a correctness dependency.

## 8. Test strategy

All pure-function tests in Vitest; no DC API, no network. New file
`lib/acc/dcBackfillPriority.test.ts` for the adapter; extend `lib/acc/dcIngest.test.ts`
for wiring + fallback.

- **T1 — ranking → order:** given a priority map, slices whose best member rank is
  smaller sort earlier. Assert exact order.
- **T2 — invariance:** the reordered slice list is a permutation of the input
  (same multiset of `(projectIds-set,start,end,reason)`); nothing added/dropped/merged.
- **T3 — determinism:** calling the reorder twice on identical input yields identical
  order (covers tie handling).
- **T4 — fairness reserve:** with budget B and reserve r, at least `r` slices come
  from the oldest-`updatedAt` non-prefix projects; a min-score project surfaces within
  N days in a multi-day simulation.
- **T5 — quota respected:** after reorder, `limitSlicesToBudget(sorted, remaining)`
  still runs exactly `min(slices, remaining)` and reports the rest as deferred.
- **T6 — flag off:** with `DC_PRIORITY_BACKFILL` unset, slice order is byte-for-byte
  identical to current (golden test against the unordered plan).
- **T7 — fallback:** if the priority-input load throws, ingest proceeds with unordered
  slices and emits the warning (mock the loader to throw).
- **Regression:** full `npm test` green; targeted `dcProgressiveBackfill.test.ts`,
  `dcQuota.test.ts`, `dcIngest.test.ts`, `extractionPriorityPlanner.test.ts` unchanged.

## 9. Rollback strategy

- **Primary:** `DC_PRIORITY_BACKFILL` flag. Unset/`0` → exact current behavior. No
  redeploy needed beyond clearing the env var in the cron task.
- **Code-level:** the reorder is one isolated call between `planDailySlice` and
  `limitSlicesToBudget`; reverting the wiring commit restores the original two lines.
- **Data safety:** none of this writes new columns or migrates data; the
  `AccDcBackfillProgress` ledger semantics are unchanged, so rollback cannot corrupt
  coverage state. A run mid-flight when the flag flips simply resumes unordered next day.
- **Verification after rollback:** T6 golden test + one dry-run log diff showing slice
  order matches the unordered plan.

## 10. Implementation tasks (DO NOT EXECUTE until §11 approval)

> TDD, frequent commits. Surgical staging — commit by explicit path only (never `-A`);
> check `git diff --cached --name-only` before each commit. **Do not touch T1/P5/P6
> graph files or active graph workflows.**

### Task 1: Pure reorder adapter
**Files:** Create `lib/acc/dcBackfillPriority.ts`; Test `lib/acc/dcBackfillPriority.test.ts`
- [ ] **Step 1 — failing test (T1, T2, T3):** write tests asserting priority order,
  permutation-invariance, and determinism for `orderSlicesByPriority(slices, priorityByProjectId)`.
- [ ] **Step 2 — run, expect FAIL** (`npx vitest run lib/acc/dcBackfillPriority.test.ts`): "not a function".
- [ ] **Step 3 — implement** `orderSlicesByPriority(slices: Slice[], priorityByProjectId: Map<string,number>): Slice[]`
  returning a sorted copy; key = min member rank (missing rank → `+Infinity`),
  tiebreak reason(`new-project`<`forward`<`backward`) → `start` asc → first projectId.
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit** `lib/acc/dcBackfillPriority.ts` + test (`feat(dc): pure priority slice-reorder adapter`).

### Task 2: Fairness reserve
**Files:** Modify `lib/acc/dcBackfillPriority.ts`; extend its test (T4)
- [ ] **Step 1 — failing test:** `selectRunnableWithFairness(sortedSlices, budget, reserve, ageRankByProjectId)`
  returns `budget` slices, ≥`reserve` of them from oldest-age non-prefix projects.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement** the reserve split (priority prefix `budget - reserve`,
  fill remainder from oldest `updatedAt`, dedupe).
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit** (`feat(dc): fairness reserve for backfill selection`).

### Task 3: Read-only priority-input loader
**Files:** Modify `lib/acc/dcIngest.ts` (new local fn near `loadProjectProgress:463`); extend `lib/acc/dcIngest.test.ts`
- [ ] **Step 1 — failing test:** `loadPriorityInputs(prisma)` returns `{ projects, activity, backfillProgress, ageByProjectId }`
  shaped for `buildExtractionPriorityPlan` (mock Prisma).
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement** using the same query shapes as `server/routers/acc-sync.ts:555` (read-only).
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit** (`feat(dc): read-only priority inputs loader for ingest`).

### Task 4: Flagged wiring + fallback
**Files:** Modify `lib/acc/dcIngest.ts:744` region; extend `lib/acc/dcIngest.test.ts` (T5, T6, T7)
- [ ] **Step 1 — failing tests:** flag-off golden (order == unordered plan); flag-on
  reorders; loader-throws → unordered + warning.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:** when `process.env.DC_PRIORITY_BACKFILL === '1'`, build
  `priorityByProjectId` from `buildExtractionPriorityPlan(loadPriorityInputs(...))`,
  `orderSlicesByPriority` then `selectRunnableWithFairness`, all in try/catch falling
  back to current `plan.slices`. Then call `limitSlicesToBudget` as today.
- [ ] **Step 4 — run, expect PASS;** then full `npm test`.
- [ ] **Step 5 — commit** (`feat(dc): flag-gated value-first backfill ordering`).

### Task 5: Observability + docs
**Files:** Modify `lib/acc/dcIngest.ts` log lines; update this plan's status; note env vars in `scripts/dc-daily-ingest.cjs` header
- [x] **Step 1:** log chosen ordering mode, top-5 selected project names+ranks, and
  fairness picks per run.
- [x] **Step 2:** document `DC_PRIORITY_BACKFILL` and `DC_FAIRNESS_RESERVE` in the cron script header.
- [x] **Step 3 — commit** (`docs(dc): document priority-backfill flags + logging`).

## 11. Decision gate (recommendation)

**Recommendation:** **Phase it.** (1) First run a *forward-first* pass to bring all 317
projects current — cheap, packs well, ~2–3 days. (2) Then enable
`DC_PRIORITY_BACKFILL=1` so the ~1,257-slice backward tail is spent value-first with a
fairness reserve. This gets leadership's top projects their 2-year history in week 1–2
instead of week 9, without permanently starving the rest.

**Keep-as-is is defensible** if "every project current" matters more than "deep history
now" and nobody is waiting on specific projects — it needs zero engineering and finishes
the full backfill in ~7–9 weeks regardless.

**Awaiting go-decision before any code change.** Options: (A) keep fair breadth-first;
(B) forward-first sprint only; (C) implement §10 value-first upgrade (phased, recommended).
