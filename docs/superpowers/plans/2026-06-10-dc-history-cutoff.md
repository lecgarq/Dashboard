# DC History Cutoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let manual DC history runs plan backward from a fixed cutoff date such as 2026-06-06 instead of spending quota on current forward catch-up after that date.

**Architecture:** Add a small cutoff-date resolver to the DC ingest module, using the existing `planDailySlice(projects, ceilingDate)` API as the planning ceiling. The planner already emits new-project slices ending at the supplied ceiling and only emits forward slices up to that ceiling, so the change belongs in `runDcIngest` where the ceiling is chosen.

**Tech Stack:** TypeScript, Vitest, existing ACC Data Connector planner/orchestrator.

---

## File Structure

- Modify `lib/acc/dcIngest.ts`: export `resolveBackfillCeilingDate`, parse `DC_BACKFILL_CUTOFF_DATE`, and use it instead of hardcoded yesterday.
- Modify `lib/acc/dcIngest.test.ts`: add focused tests for cutoff parsing and orchestration behavior.
- Modify `scripts/dc-daily-ingest.cjs`: document `DC_BACKFILL_CUTOFF_DATE`.
- Modify `scripts/scratch/run-dc-ingest-no-rebuild.cjs`: log cutoff env so manual runs show which ceiling is active.

---

### Task 1: Cutoff Resolver

- [ ] **Step 1: Write RED tests**

Add tests in `lib/acc/dcIngest.test.ts` proving:
- no env var resolves to end-of-yesterday UTC;
- `DC_BACKFILL_CUTOFF_DATE=2026-06-06` resolves to `2026-06-06T23:59:59.999Z`;
- future cutoff values are clamped to end-of-yesterday UTC;
- invalid values throw a clear error.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd test -- lib/acc/dcIngest.test.ts
```

Expected: FAIL because `resolveBackfillCeilingDate` is not exported.

- [ ] **Step 3: Implement resolver**

Add `resolveBackfillCeilingDate(now = new Date(), raw = process.env.DC_BACKFILL_CUTOFF_DATE)` to `lib/acc/dcIngest.ts`.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm.cmd test -- lib/acc/dcIngest.test.ts
```

Expected: PASS.

---

### Task 2: Orchestrator Uses Cutoff

- [ ] **Step 1: Write RED run test**

Add a `runDcIngest` test where `DC_BACKFILL_CUTOFF_DATE=2026-06-06`, a project has `latestCovered=2026-06-07`, and the run finalizes an empty plan with `sliceWindowEnd=2026-06-06T23:59:59.999Z`. This proves June 7+ is not planned as forward/current work.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd test -- lib/acc/dcIngest.test.ts
```

Expected: FAIL because `runDcIngest` still uses yesterday.

- [ ] **Step 3: Wire resolver into run**

Replace `const yesterday = yesterdayUtc();` with `const ceilingDate = resolveBackfillCeilingDate(startedAt);` and pass that to `planDailySlice`. Store `sliceWindowEnd: ceilingDate` in empty-plan results.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm.cmd test -- lib/acc/dcIngest.test.ts
```

Expected: PASS.

---

### Task 3: Operational Docs and Verification

- [ ] **Step 1: Document env flag**

Add `DC_BACKFILL_CUTOFF_DATE=YYYY-MM-DD` to the daily ingest wrapper comments and log it in the no-rebuild scratch runner.

- [ ] **Step 2: Run focused verification**

Run:

```powershell
npm.cmd test -- lib/acc/dcProjectEligibility.test.ts lib/acc/dcProgressiveBackfill.test.ts lib/acc/dcIngest.test.ts
node --check scripts/scratch/run-dc-ingest-no-rebuild.cjs
node --check scripts/scratch/audit-dc-runnable-projects.cjs
```

Expected: all commands exit 0.

- [ ] **Step 3: Read-only audit with cutoff**

Run:

```powershell
$env:DC_BACKFILL_CUTOFF_DATE='2026-06-06'; node scripts/scratch/audit-dc-runnable-projects.cjs
```

Expected: no excluded keyword projects are runnable. No DC extraction requests are submitted.

- [ ] **Step 4: Commit**

Commit only the cutoff resolver, tests, docs, and plan.
