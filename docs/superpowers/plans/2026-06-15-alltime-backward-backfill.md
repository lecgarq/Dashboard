# All-time Backward Backfill Campaign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill every DC-extractable project's pre-cap history (project start → 2025-06-30) into `AccActivity`, using the existing all-time extractor, gated by a one-project retention probe and bounded by the free daily quota.

**Architecture:** Two new helpers wrap the *unchanged* `scripts/dc-extract-id-list.cjs`. A pure selection function (`lib/acc/selectBackfillProjects.ts`) decides *which* projects still need history; a read-only reporter (`scripts/dc-coverage-report.cjs`) and a list-builder (`scripts/dc-build-extract-list.cjs`) feed an ordered ID file to a PowerShell wrapper (`scripts/dc-alltime-backfill.ps1`). Re-running the builder = the resume mechanism (state lives in `AccDcBackfillProgress.earliestCovered`).

**Tech Stack:** Node `.cjs` scripts via `tsx/cjs`, Prisma + `@prisma/adapter-pg` (local Postgres 18), Vitest for the pure unit, PowerShell wrapper for Task Scheduler / manual runs, APS Data Connector v1 (3-leg auth).

---

## Locked decisions (from the spec)

- **Scope:** 428 known-extractable projects = `AccProject.status='active'` ∩ has a row in `AccDcProject`.
- **Window:** `DC_START_DATE = 2019-01-01T00:00:00.000Z` (all-time floor) → `DC_END_DATE = 2025-06-30T23:59:59.999Z`.
- **Quota:** ~9 requests total (`⌈428/50⌉`); fits one free UTC-day. `DC_MAX_REQUESTS` caps each day; `DC_NO_BISECT=1` (known-good set).
- **Resolved risk:** no admin-CSV quarantine on this path — `ingestActivityZip` only inserts rows (verified `lib/acc/ingestActivityZip.ts`).

## File structure

- **Create** `lib/acc/selectBackfillProjects.ts` — pure: given active/acknowledged/coverage/activity maps + a floor date, returns the ordered list of project IDs still needing backfill. No DB, no I/O.
- **Create** `lib/acc/__tests__/selectBackfillProjects.test.ts` — Vitest unit tests for the pure function.
- **Create** `scripts/dc-coverage-report.cjs` — read-only census + per-project date-range reporter (Task 1 census, probe check, final validation). Mutates nothing.
- **Create** `scripts/dc-build-extract-list.cjs` — DB I/O: loads the maps, calls `selectBackfillProjects`, writes the ordered ID file, prints a summary.
- **Create** `scripts/dc-alltime-backfill.ps1` — wrapper: regenerates the list, sets env, invokes `dc-extract-id-list.cjs`, logs.
- **Reuse unchanged** `scripts/dc-extract-id-list.cjs` — already has `DC_IDS_FILE`, `DC_START_DATE`, `DC_END_DATE`, `DC_MAX_REQUESTS`, `DC_NO_BISECT`, `DC_DRY_RUN`, 50-chunking, `earliestCovered` advancement, `AccDataConnectorJob` rows.

---

## Task 1: Read-only coverage reporter

**Files:**
- Create: `scripts/dc-coverage-report.cjs`

Reusable read-only diagnostics used by the census (this task), the probe (Task 5), and final validation (Task 8). Prints counts; if `DC_PROBE_PROJECT_ID` is set, also prints that project's `AccActivity` min/max `createdAt` and its `earliestCovered`.

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
/**
 * Read-only Data Connector coverage report. Mutates nothing.
 *
 * Census mode (default): prints active / DC-acknowledged / extractable /
 * remaining counts and the earliestCovered distribution.
 *
 * Probe mode (DC_PROBE_PROJECT_ID set): also prints that project's
 * AccActivity date range and AccDcBackfillProgress.earliestCovered.
 *
 * Env: DC_START_DATE (floor; default 2019-01-01T00:00:00.000Z)
 *      DC_PROBE_PROJECT_ID (optional)
 */
require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const FLOOR = new Date(process.env.DC_START_DATE || "2019-01-01T00:00:00.000Z");
const PROBE_ID = process.env.DC_PROBE_PROJECT_ID?.trim() || null;

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
}

async function main() {
  const prisma = createPrisma();
  try {
    const [activeProjects, dcProjects, backfills] = await Promise.all([
      prisma.accProject.findMany({ where: { status: "active" }, select: { id: true } }),
      prisma.accDcProject.findMany({ select: { id: true } }),
      prisma.accDcBackfillProgress.findMany({ select: { projectId: true, earliestCovered: true } }),
    ]);
    const activeIds = new Set(activeProjects.map((p) => p.id));
    const dcIds = new Set(dcProjects.map((p) => p.id));
    const extractable = [...dcIds].filter((id) => activeIds.has(id));
    const earliestById = new Map(backfills.map((b) => [b.projectId, b.earliestCovered]));

    let done = 0, remaining = 0;
    for (const id of extractable) {
      const e = earliestById.get(id) ?? null;
      if (e && e.getTime() <= FLOOR.getTime()) done++; else remaining++;
    }

    console.log("=== DC coverage census ===");
    console.log(`floor             : ${FLOOR.toISOString()}`);
    console.log(`active projects   : ${activeIds.size}`);
    console.log(`DC-acknowledged   : ${dcIds.size}`);
    console.log(`extractable (∩)   : ${extractable.length}`);
    console.log(`already covered   : ${done}`);
    console.log(`remaining to pull : ${remaining}`);
    console.log(`est. requests     : ${Math.ceil(remaining / 50)} (at 50/req)`);

    if (PROBE_ID) {
      const agg = await prisma.accActivity.aggregate({
        where: { projectId: PROBE_ID },
        _min: { createdAt: true },
        _max: { createdAt: true },
        _count: true,
      });
      const bf = await prisma.accDcBackfillProgress.findUnique({ where: { projectId: PROBE_ID } });
      console.log(`\n=== probe ${PROBE_ID} ===`);
      console.log(`activity rows     : ${agg._count}`);
      console.log(`min(createdAt)    : ${agg._min.createdAt ? agg._min.createdAt.toISOString() : "(none)"}`);
      console.log(`max(createdAt)    : ${agg._max.createdAt ? agg._max.createdAt.toISOString() : "(none)"}`);
      console.log(`earliestCovered   : ${bf?.earliestCovered ? bf.earliestCovered.toISOString() : "(none)"}`);
      console.log(`projectCreatedAt  : ${bf?.projectCreatedAt ? bf.projectCreatedAt.toISOString() : "(none)"}`);
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the census**

Run: `node --env-file=.env scripts/dc-coverage-report.cjs`
Expected: prints counts; `extractable (∩)` should be ≈ 428. Record the actual number. If it's far from 428, stop and reconcile the predicate with the user before proceeding.

- [ ] **Step 3: Commit**

```bash
git add scripts/dc-coverage-report.cjs
git commit -m "feat(dc): read-only coverage/census reporter for backfill campaign"
```

---

## Task 2: Pure project-selection function (TDD)

**Files:**
- Create: `lib/acc/selectBackfillProjects.ts`
- Test: `lib/acc/__tests__/selectBackfillProjects.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { selectBackfillProjects } from "../selectBackfillProjects";

const FLOOR = new Date("2019-01-01T00:00:00.000Z");

function base() {
  return {
    activeIds: new Set(["a", "b", "c", "locked", "inactive"]),
    dcAcknowledgedIds: new Set(["a", "b", "c", "inactive"]), // "locked" not acknowledged
    earliestCoveredById: new Map<string, Date | null>([
      ["a", new Date("2019-01-01T00:00:00.000Z")], // already at floor → done
      ["b", new Date("2026-02-22T00:00:00.000Z")], // partial → remaining
      // "c" has no progress row → never covered → remaining
    ]),
    activityCountById: new Map<string, number>([["b", 10], ["c", 99]]),
    floor: FLOOR,
  };
}

describe("selectBackfillProjects", () => {
  it("excludes projects already covered back to the floor", () => {
    expect(selectBackfillProjects(base())).not.toContain("a");
  });

  it("includes never-covered and partially-covered projects", () => {
    const out = selectBackfillProjects(base());
    expect(out).toContain("b");
    expect(out).toContain("c");
  });

  it("excludes projects DC has not acknowledged (locked)", () => {
    expect(selectBackfillProjects(base())).not.toContain("locked");
  });

  it("excludes inactive projects even if acknowledged", () => {
    const input = base();
    input.activeIds = new Set(["a", "b", "c"]); // "inactive" no longer active
    expect(selectBackfillProjects(input)).not.toContain("inactive");
  });

  it("orders remaining by activity count desc, with id tiebreak", () => {
    // c (99) before b (10)
    expect(selectBackfillProjects(base())).toEqual(["c", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/acc/__tests__/selectBackfillProjects.test.ts`
Expected: FAIL — "Cannot find module '../selectBackfillProjects'".

- [ ] **Step 3: Write the implementation**

```ts
export interface SelectBackfillInput {
  /** AccProject ids with status="active". */
  activeIds: ReadonlySet<string>;
  /** AccDcProject ids (projects DC has acknowledged = extraction has worked). */
  dcAcknowledgedIds: ReadonlySet<string>;
  /** projectId -> AccDcBackfillProgress.earliestCovered (null if a row exists but no date). */
  earliestCoveredById: ReadonlyMap<string, Date | null>;
  /** projectId -> activity row count, used only for priority ordering. */
  activityCountById: ReadonlyMap<string, number>;
  /** All-time floor; a project whose earliestCovered <= floor is considered done. */
  floor: Date;
}

/**
 * Return the ordered list of project IDs that still need a backward backfill.
 *
 * A project qualifies when it is BOTH active AND DC-acknowledged, and has NOT
 * yet been covered back to the floor. Ordering is by activity count descending
 * (most valuable history first), with a deterministic id tiebreak so re-runs
 * and tests are stable.
 */
export function selectBackfillProjects(input: SelectBackfillInput): string[] {
  const floorMs = input.floor.getTime();
  const remaining: { id: string; count: number }[] = [];

  for (const id of input.dcAcknowledgedIds) {
    if (!input.activeIds.has(id)) continue;
    const earliest = input.earliestCoveredById.get(id) ?? null;
    if (earliest && earliest.getTime() <= floorMs) continue; // already covered to floor
    remaining.push({ id, count: input.activityCountById.get(id) ?? 0 });
  }

  remaining.sort((x, y) => y.count - x.count || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return remaining.map((r) => r.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/acc/__tests__/selectBackfillProjects.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/acc/selectBackfillProjects.ts lib/acc/__tests__/selectBackfillProjects.test.ts
git commit -m "feat(dc): pure selectBackfillProjects with unit tests"
```

---

## Task 3: List-builder (DB → ordered ID file)

**Files:**
- Create: `scripts/dc-build-extract-list.cjs`

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
/**
 * Build the ordered project-ID file consumed by scripts/dc-extract-id-list.cjs.
 *
 * Loads the active/acknowledged/coverage/activity maps from Postgres, delegates
 * selection to the pure lib/acc/selectBackfillProjects.ts, writes one ID per
 * line, and prints a summary. Re-running regenerates the REMAINING work (state
 * lives in AccDcBackfillProgress.earliestCovered) — this is the resume loop.
 *
 * Env: DC_START_DATE (floor; default 2019-01-01T00:00:00.000Z)
 *      DC_LIST_OUT (output file; default tmp/dc-extract-list.txt)
 */
const fs = require("node:fs");
const path = require("node:path");
require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const FLOOR = new Date(process.env.DC_START_DATE || "2019-01-01T00:00:00.000Z");
const OUT = process.env.DC_LIST_OUT?.trim() || path.join("tmp", "dc-extract-list.txt");

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
}

async function main() {
  const { selectBackfillProjects } = require(path.resolve(__dirname, "..", "lib", "acc", "selectBackfillProjects.ts"));
  const prisma = createPrisma();
  try {
    const [activeProjects, dcProjects, backfills, activityGroups] = await Promise.all([
      prisma.accProject.findMany({ where: { status: "active" }, select: { id: true } }),
      prisma.accDcProject.findMany({ select: { id: true } }),
      prisma.accDcBackfillProgress.findMany({ select: { projectId: true, earliestCovered: true } }),
      prisma.accActivity.groupBy({ by: ["projectId"], _count: { _all: true } }),
    ]);

    const input = {
      activeIds: new Set(activeProjects.map((p) => p.id)),
      dcAcknowledgedIds: new Set(dcProjects.map((p) => p.id)),
      earliestCoveredById: new Map(backfills.map((b) => [b.projectId, b.earliestCovered])),
      activityCountById: new Map(
        activityGroups.filter((g) => g.projectId).map((g) => [g.projectId, g._count._all])
      ),
      floor: FLOOR,
    };

    const ids = selectBackfillProjects(input);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, ids.join("\n") + (ids.length ? "\n" : ""), "utf8");

    console.log(`[dc-build-extract-list] floor=${FLOOR.toISOString()}`);
    console.log(`[dc-build-extract-list] remaining projects=${ids.length} -> ${OUT}`);
    console.log(`[dc-build-extract-list] est. requests=${Math.ceil(ids.length / 50)} (at 50/req)`);
    if (ids.length === 0) console.log("[dc-build-extract-list] NOTHING REMAINING — campaign complete.");
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it (read of DB, writes only a local txt file)**

Run: `node --env-file=.env scripts/dc-build-extract-list.cjs`
Expected: prints `remaining projects=<N>` (N ≈ census remaining from Task 1) and writes `tmp/dc-extract-list.txt`. Confirm the file has N non-empty lines:
Run: `(Get-Content tmp/dc-extract-list.txt | Measure-Object -Line).Lines` (PowerShell)

- [ ] **Step 3: Commit**

```bash
git add scripts/dc-build-extract-list.cjs
git commit -m "feat(dc): build ordered remaining-project ID file for backfill"
```

---

## Task 4: PowerShell wrapper

**Files:**
- Create: `scripts/dc-alltime-backfill.ps1`

- [ ] **Step 1: Write the wrapper**

```powershell
# All-time backward backfill — manual/daily runner.
#
# Regenerates the remaining-project list, then runs the quota-safe extractor for
# the window project-start -> 2025-06-30. Re-run daily until the list is empty.
#
# Manual run:
#   powershell.exe -ExecutionPolicy Bypass -File C:\LECG\Dashboard\scripts\dc-alltime-backfill.ps1
#
# Env knobs (override before calling): DC_MAX_REQUESTS (default 20), DC_DRY_RUN.

$ErrorActionPreference = "Continue"
Set-Location "C:\LECG\Dashboard"
$stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$logFile = "logs\dc-alltime-backfill-$stamp.log"
if (-not (Test-Path "logs")) { New-Item -ItemType Directory -Path "logs" -Force | Out-Null }

$env:DC_START_DATE = "2019-01-01T00:00:00.000Z"
$env:DC_END_DATE   = "2025-06-30T23:59:59.999Z"
$env:DC_IDS_FILE   = "tmp\dc-extract-list.txt"
$env:DC_NO_BISECT  = "1"
if (-not $env:DC_MAX_REQUESTS) { $env:DC_MAX_REQUESTS = "20" }

"=== all-time backfill started $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $logFile -Append

# 1) Regenerate the remaining-project list.
node --env-file=.env scripts/dc-build-extract-list.cjs *>&1 | Tee-Object -FilePath $logFile -Append

# 2) Stop early if nothing remains.
if (-not (Test-Path $env:DC_IDS_FILE) -or ((Get-Content $env:DC_IDS_FILE | Where-Object { $_.Trim() }).Count -eq 0)) {
    "Nothing remaining — campaign complete." | Tee-Object -FilePath $logFile -Append
    "=== all-time backfill ended $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $logFile -Append
    exit 0
}

# 3) Run the extractor (spends quota up to DC_MAX_REQUESTS).
node --env-file=.env scripts/dc-extract-id-list.cjs *>&1 | Tee-Object -FilePath $logFile -Append

"=== all-time backfill ended $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $logFile -Append
```

- [ ] **Step 2: Dry-run smoke test (submits NOTHING — `DC_DRY_RUN=1`)**

Run (PowerShell):
```powershell
$env:DC_DRY_RUN = "1"
powershell.exe -ExecutionPolicy Bypass -File C:\LECG\Dashboard\scripts\dc-alltime-backfill.ps1
Remove-Item Env:\DC_DRY_RUN
```
Expected: log shows the list rebuilt and the extractor printing its plan with **no POST /requests submitted** (dc-extract-id-list.cjs honors `DC_DRY_RUN`). Verify the log file under `logs/`.

- [ ] **Step 3: Commit**

```bash
git add scripts/dc-alltime-backfill.ps1
git commit -m "feat(dc): all-time backfill PowerShell wrapper (project-start -> 2025-06-30)"
```

---

## Task 5: Retention probe (GATE — real quota, 1 project)

> ⚠️ This is the first task that spends real quota and refreshes the single-use Autodesk refresh token. Do exactly one project. Do NOT proceed to Task 6 until the probe confirms how far back APS actually serves data.

**Files:** none (operational, uses Tasks 1, 3 outputs)

- [ ] **Step 1: Pick the probe project (head of the ordered list)**

Run (PowerShell):
```powershell
node --env-file=.env scripts/dc-build-extract-list.cjs
$probe = (Get-Content tmp/dc-extract-list.txt | Where-Object { $_.Trim() })[0]
Set-Content -Path tmp/dc-probe-list.txt -Value $probe
"Probe project: $probe"
```

- [ ] **Step 2: Record the BEFORE state**

Run: `$env:DC_PROBE_PROJECT_ID=$probe; node --env-file=.env scripts/dc-coverage-report.cjs; Remove-Item Env:\DC_PROBE_PROJECT_ID`
Expected: note the probe's current `min(createdAt)` and `earliestCovered`.

- [ ] **Step 3: Dry-run the single-project extraction**

Run (PowerShell):
```powershell
$env:DC_IDS_FILE="tmp\dc-probe-list.txt"; $env:DC_START_DATE="2019-01-01T00:00:00.000Z"
$env:DC_END_DATE="2025-06-30T23:59:59.999Z"; $env:DC_MAX_REQUESTS="1"; $env:DC_NO_BISECT="1"; $env:DC_DRY_RUN="1"
node --env-file=.env scripts/dc-extract-id-list.cjs
Remove-Item Env:\DC_DRY_RUN
```
Expected: prints the plan (1 chunk, 1 project), submits nothing.

- [ ] **Step 4: Run the single-project extraction for real**

Run (same env as Step 3 but without `DC_DRY_RUN`):
```powershell
node --env-file=.env scripts/dc-extract-id-list.cjs
foreach ($v in 'DC_IDS_FILE','DC_START_DATE','DC_END_DATE','DC_MAX_REQUESTS','DC_NO_BISECT') { Remove-Item "Env:\$v" -ErrorAction SilentlyContinue }
```
Expected: one request submitted, polled to success, ZIP ingested, `earliestCovered` advanced.

- [ ] **Step 5: Record the AFTER state and DECIDE**

Run: `$env:DC_PROBE_PROJECT_ID=$probe; node --env-file=.env scripts/dc-coverage-report.cjs; Remove-Item Env:\DC_PROBE_PROJECT_ID`
Expected & decision:
- If `min(createdAt)` moved meaningfully earlier (e.g. into 2024/2023): APS serves deep history → **proceed to Task 6**.
- If it barely moved / clamped to a recent date: APS retention is limited. Stop, report the real floor to the user, and confirm whether to continue at the achievable depth before Task 6.
- Confirm dashboard login still works (open the app or check `Account.access_token` rotated cleanly). If login broke: run `node --env-file=.env scripts/aps-login.cjs` to recover.

---

## Task 6: Pause the nightly cron for the campaign

**Files:** none (operational)

- [ ] **Step 1: Drop the kill-switch**

Run (PowerShell): `New-Item -ItemType File -Path C:\LECG\Dashboard\.dc-ingest.disabled -Force`
Expected: file exists. The 3 AM `dc-daily-cron.ps1` will now skip, so it won't contend for quota or trip the extractor's "request in-flight" guard.

> Note (from memory `project_dc_kill_switch_autodelete`): `.dc-ingest.disabled` has spontaneously disappeared on this PC. Re-check it exists at the start of each campaign day (Task 7 Step 1).

---

## Task 7: Run the campaign (real quota, full list, resume daily)

**Files:** none (operational, uses Task 4 wrapper)

- [ ] **Step 1: Confirm the cron is still paused**

Run: `Test-Path C:\LECG\Dashboard\.dc-ingest.disabled`
Expected: `True`. If `False`, redo Task 6 Step 1.

- [ ] **Step 2: Run day 1**

Run: `powershell.exe -ExecutionPolicy Bypass -File C:\LECG\Dashboard\scripts\dc-alltime-backfill.ps1`
Expected: list rebuilt (remaining ≈ census − 1 from the probe), extractor submits up to `DC_MAX_REQUESTS` requests, each polled to success and ingested. Watch the `logs/dc-alltime-backfill-*.log`.

- [ ] **Step 3: Check remaining**

Run: `node --env-file=.env scripts/dc-coverage-report.cjs`
Expected: `remaining to pull` dropped by the number of projects successfully pulled. If `remaining > 0` (quota exhausted or slow jobs), **resume tomorrow**: re-run Step 2 after the UTC quota reset. Repeat until `remaining to pull = 0`.

---

## Task 8: Validate, then re-enable the cron

**Files:** none (operational)

- [ ] **Step 1: Confirm full coverage**

Run: `node --env-file=.env scripts/dc-coverage-report.cjs`
Expected: `remaining to pull = 0`.

- [ ] **Step 2: Spot-check deep history landed**

Run (PowerShell): pick 3 projects created before 2025 from `tmp/dc-extract-list.txt` history (or any known-old project) and check each:
```powershell
$env:DC_PROBE_PROJECT_ID="<old-project-id>"; node --env-file=.env scripts/dc-coverage-report.cjs; Remove-Item Env:\DC_PROBE_PROJECT_ID
```
Expected: `min(createdAt)` is well before `2025-06-30` (down to the project's start / confirmed APS floor).

- [ ] **Step 3: Re-enable the nightly forward job**

Run (PowerShell): `Remove-Item C:\LECG\Dashboard\.dc-ingest.disabled -ErrorAction SilentlyContinue`
Expected: file gone. The next 3 AM run resumes normal forward catch-up on the now-complete history base.

- [ ] **Step 4: Confirm the handoff boundary has no gap**

Run: `node --env-file=.env scripts/dc-coverage-report.cjs` and confirm with the user that the nightly job's coverage reaches back to ≥ 2025-06-30. If a gap exists (nightly floor later than 2025-06-30), run one extra wrapper pass with `DC_END_DATE` extended to the nightly floor.

---

## Self-review notes

- **Spec coverage:** scope (Task 1 census predicate), window (Tasks 4–7 env), all-time bulk via `dc-extract-id-list.cjs` (Tasks 5/7), probe gate (Task 5), pause/resume cron (Tasks 6/8), resume mechanism (Task 3 rebuild + Task 7 Step 3), validation incl. handoff-boundary (Task 8). All spec sections mapped.
- **Resolved risk:** admin-CSV quarantine — confirmed not on this path (`ingestActivityZip` only inserts).
- **Type consistency:** `selectBackfillProjects` input keys (`activeIds`, `dcAcknowledgedIds`, `earliestCoveredById`, `activityCountById`, `floor`) are identical in the test (Task 2), implementation (Task 2), and caller (Task 3).
- **Token hazard:** isolated to Task 5 (1 project) before any fan-out; recovery path documented (`aps-login.cjs`).
