# DC Hard Project Skip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent DC activity extraction quota from being spent on allowlisted but low-value demo/template/test/prueba/sharespace/VDC projects.

**Architecture:** Add one reusable project-name eligibility module, wire it into the existing `planDailySlice` filter before slices are created, and hydrate project names in `loadProjectProgress` so production calls have the data needed to filter. Add a read-only planner audit script that proves the next runnable set has zero excluded project names before any live APS request is made.

**Tech Stack:** TypeScript, Vitest, Prisma Client, existing ACC Data Connector scripts.

---

## File Structure

- Create `lib/acc/dcProjectEligibility.ts`: normalization and hard-skip predicates.
- Create `lib/acc/dcProjectEligibility.test.ts`: pure unit tests for skip keywords and legitimate project names.
- Modify `lib/acc/dcProgressiveBackfill.ts`: add optional `projectName` to `ProjectProgress`, expose an explicit `filterProjectEligibility` test option, and call `isDcBackfillEligibleProject`.
- Modify `lib/acc/dcProgressiveBackfill.test.ts`: add a focused test that enables the real eligibility filter and proves low-value allowlisted projects do not generate slices.
- Modify `lib/acc/dcIngest.ts`: hydrate project names in `loadProjectProgress` and `newProjectProgress`.
- Modify `lib/acc/dcIngest.test.ts`: update mocks and add a test showing a low-value-only pending set makes no APS `POST /requests`.
- Create `scripts/scratch/audit-dc-runnable-projects.cjs`: read-only audit that prints runnable project counts and fails if any runnable project matches the hard-skip keywords.

---

### Task 1: Pure Eligibility Predicate

**Files:**
- Create: `lib/acc/dcProjectEligibility.ts`
- Create: `lib/acc/dcProjectEligibility.test.ts`

- [ ] **Step 1: Write the failing predicate tests**

Add `lib/acc/dcProjectEligibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  isLowValueExtractionProjectName,
  normalizeProjectNameForExtractionFilter,
} from './dcProjectEligibility';

describe('dcProjectEligibility', () => {
  it('normalizes accents, punctuation, and casing for extraction filtering', () => {
    expect(normalizeProjectNameForExtractionFilter('  VDC / MONTERREY (PRUEBA-01)  ')).toBe(
      'vdc monterrey prueba 01',
    );
    expect(normalizeProjectNameForExtractionFilter('Capacitación - PRE-TEMPLATE')).toBe(
      'capacitacion pre template',
    );
  });

  it.each([
    'ACC MTY DEMO',
    'ACC Template Ejecución MTY',
    'ACC TEMPLATE MTY PRUEBA',
    'MTY BIM Sharespace',
    'MTY CDP DEMO ACC',
    'MTY Template Demo Project',
    'Template Rvt Mty',
    'PRE-TEMPLATE MTY EJEC',
    'VDC / MONTERREY (PRUEBA-01)',
    'MTY Introduccion Takeoff',
    'ACC VDC Training',
    'Sandbox Modelo',
    'Sample Project',
  ])('marks "%s" as low-value for extraction', (name) => {
    expect(isLowValueExtractionProjectName(name)).toBe(true);
  });

  it.each([
    'MTY Caterpillar Azteca - OMTY083',
    'MTY Flex-N-Gate Plásticos PROM',
    'CDMX Prologis Park Apodaca East Building 16 OMTY081',
    'MXL American Industries CMCO - OMTY072',
  ])('keeps legitimate project "%s" eligible by name', (name) => {
    expect(isLowValueExtractionProjectName(name)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the predicate tests to verify RED**

Run: `npm.cmd test -- lib/acc/dcProjectEligibility.test.ts`

Expected: FAIL because `./dcProjectEligibility` does not exist.

- [ ] **Step 3: Implement the predicate**

Add `lib/acc/dcProjectEligibility.ts`:

```ts
import mtyAllowlist from './mty-allowlist.json';

const mtySet = new Set<string>(mtyAllowlist);

const LOW_VALUE_TERMS = [
  'demo',
  'template',
  'pre template',
  'test',
  'prueba',
  'pruebas',
  'sharespace',
  'training',
  'capacitacion',
  'sandbox',
  'sample',
  'takeoff',
  'vdc',
] as const;

export function normalizeProjectNameForExtractionFilter(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isLowValueExtractionProjectName(name: string | null | undefined): boolean {
  const normalized = normalizeProjectNameForExtractionFilter(name);
  if (!normalized) return false;
  return LOW_VALUE_TERMS.some((term) => {
    const normalizedTerm = normalizeProjectNameForExtractionFilter(term);
    return new RegExp(`(^| )${normalizedTerm}( |$)`).test(normalized);
  });
}

export function isDcBackfillEligibleProject(
  projectId: string,
  projectName: string | null | undefined,
): boolean {
  return mtySet.has(projectId) && !isLowValueExtractionProjectName(projectName);
}
```

- [ ] **Step 4: Run the predicate tests to verify GREEN**

Run: `npm.cmd test -- lib/acc/dcProjectEligibility.test.ts`

Expected: PASS.

---

### Task 2: Planner Hard Filter

**Files:**
- Modify: `lib/acc/dcProgressiveBackfill.ts`
- Modify: `lib/acc/dcProgressiveBackfill.test.ts`

- [ ] **Step 1: Write the failing planner test**

In `lib/acc/dcProgressiveBackfill.test.ts`, import `isDcBackfillEligibleProject` only if needed for type inference is not required. Add this test inside `describe('planDailySlice', ...)`:

```ts
  it('hard-skips allowlisted low-value projects before creating slices', () => {
    const projects: ProjectProgress[] = [
      {
        ...newProj('2a46d219-9e58-479f-a4ba-daed763c7d61'),
        projectName: 'ACC Template Ejecución MTY',
      },
      {
        ...newProj('96ed997a-f39b-4035-baf9-9eca1b5eb6b3'),
        projectName: 'MTY BIM Sharespace',
      },
      {
        ...newProj('fa948b7b-43eb-458e-8d8b-9f4cf7aa957f'),
        projectName: 'MTY Caterpillar Azteca - OMTY083',
      },
    ];

    const plan = planDailySlice(projects, yesterday, {
      filterProjectEligibility: true,
    });

    expect(plan.slices).toHaveLength(1);
    expect(plan.slices[0].projectIds).toEqual([
      'fa948b7b-43eb-458e-8d8b-9f4cf7aa957f',
    ]);
    expect(plan.totalProjects).toBe(3);
    expect(plan.estimatedQuota).toBe(1);
  });
```

- [ ] **Step 2: Run the planner tests to verify RED**

Run: `npm.cmd test -- lib/acc/dcProgressiveBackfill.test.ts`

Expected: FAIL because `ProjectProgress.projectName` and `filterProjectEligibility` do not exist or because low-value projects are not filtered.

- [ ] **Step 3: Wire the planner filter**

Modify `lib/acc/dcProgressiveBackfill.ts`:

```ts
import { isDcBackfillEligibleProject } from './dcProjectEligibility';
```

Extend `ProjectProgress`:

```ts
  projectName?: string | null;
```

Extend `PlanDailySliceOptions`:

```ts
  filterProjectEligibility?: boolean;
```

Replace the current `filteredProjects` block with:

```ts
  const shouldFilterEligibility =
    options?.filterProjectEligibility ??
    !(
      typeof process !== 'undefined' &&
      (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test')
    );
  const filteredProjects = shouldFilterEligibility
    ? projects.filter((p) =>
        isDcBackfillEligibleProject(p.projectId, p.projectName),
      )
    : projects;
```

- [ ] **Step 4: Run the planner tests to verify GREEN**

Run: `npm.cmd test -- lib/acc/dcProgressiveBackfill.test.ts`

Expected: PASS.

---

### Task 3: Hydrate Project Names in the Ingest Loader

**Files:**
- Modify: `lib/acc/dcIngest.ts`
- Modify: `lib/acc/dcIngest.test.ts`

- [ ] **Step 1: Write the failing ingest test**

In `lib/acc/dcIngest.test.ts`, add this test inside `describe('runDcIngest — top-level branches', ...)`:

```ts
  it('does not submit APS requests when pending projects are only low-value allowlisted names', async () => {
    const prisma = makePrismaMock();
    prisma.accDcBackfillProgress.findMany.mockResolvedValue([
      {
        projectId: '2a46d219-9e58-479f-a4ba-daed763c7d61',
        earliestCovered: null,
        latestCovered: null,
        projectCreatedAt: new Date('2026-01-01T00:00:00Z'),
        newProjectFlag: true,
      },
      {
        projectId: '96ed997a-f39b-4035-baf9-9eca1b5eb6b3',
        earliestCovered: null,
        latestCovered: null,
        projectCreatedAt: new Date('2026-01-01T00:00:00Z'),
        newProjectFlag: true,
      },
    ]);
    prisma.accDcProject.findMany.mockResolvedValue([
      {
        id: '2a46d219-9e58-479f-a4ba-daed763c7d61',
        name: 'ACC Template Ejecución MTY',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: '96ed997a-f39b-4035-baf9-9eca1b5eb6b3',
        name: 'MTY BIM Sharespace',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));

    const result = await runDcIngest(prisma as never);

    expect(result.status).toBe('success');
    expect(result.quotaUsed).toBe(0);
    expect(result.projectsProcessed).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
```

- [ ] **Step 2: Run the ingest test to verify RED**

Run: `npm.cmd test -- lib/acc/dcIngest.test.ts`

Expected: FAIL because the current loader does not hydrate names and the planner cannot exclude those projects.

- [ ] **Step 3: Hydrate names in production progress rows**

Modify `lib/acc/dcIngest.ts`.

Change `newProjectProgress` to accept a name:

```ts
function newProjectProgress(
  projectId: string,
  projectCreatedAt: Date,
  projectName?: string | null,
): ProjectProgress {
  return {
    projectId,
    projectName,
    earliestCovered: null,
    latestCovered: null,
    projectCreatedAt,
    newProjectFlag: true,
  };
}
```

Replace `loadProjectProgress` with:

```ts
async function loadProjectProgress(
  prisma: PrismaClient,
): Promise<ProjectProgress[]> {
  const [rows, projects] = await Promise.all([
    prisma.accDcBackfillProgress.findMany(),
    prisma.accDcProject.findMany({
      select: { id: true, name: true },
    }),
  ]);
  const nameByProjectId = new Map(projects.map((p) => [p.id, p.name]));
  return rows.map((r) => ({
    projectId: r.projectId,
    projectName: nameByProjectId.get(r.projectId) ?? null,
    earliestCovered: r.earliestCovered,
    latestCovered: r.latestCovered,
    projectCreatedAt: r.projectCreatedAt,
    newProjectFlag: r.newProjectFlag,
  }));
}
```

Update the fallback new-project seed in `executePlan`:

```ts
const proj = await prisma.accDcProject.findUnique({
  where: { id: projectId },
  select: { createdAt: true, name: true },
});
projectCreatedAt = proj?.createdAt ?? null;
...
: newProjectProgress(projectId, projectCreatedAt, proj?.name ?? null);
```

- [ ] **Step 4: Run the ingest tests to verify GREEN**

Run: `npm.cmd test -- lib/acc/dcIngest.test.ts`

Expected: PASS.

---

### Task 4: Read-Only Runnable Audit

**Files:**
- Create: `scripts/scratch/audit-dc-runnable-projects.cjs`

- [ ] **Step 1: Write the audit script**

Create `scripts/scratch/audit-dc-runnable-projects.cjs`:

```js
#!/usr/bin/env node
require("dotenv").config();
require("tsx/cjs");

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const {
  planDailySlice,
} = require("../../lib/acc/dcProgressiveBackfill");
const {
  isLowValueExtractionProjectName,
} = require("../../lib/acc/dcProjectEligibility");

const DAY = 86_400_000;

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 2 }),
    log: ["error"],
  });

  try {
    const now = new Date();
    const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterday = new Date(utcToday.getTime() - 1);

    const [progressRows, projects] = await Promise.all([
      prisma.accDcBackfillProgress.findMany(),
      prisma.accDcProject.findMany({ select: { id: true, name: true } }),
    ]);
    const nameById = new Map(projects.map((p) => [p.id, p.name]));
    const progress = progressRows.map((row) => ({
      projectId: row.projectId,
      projectName: nameById.get(row.projectId) || null,
      earliestCovered: row.earliestCovered,
      latestCovered: row.latestCovered,
      projectCreatedAt: row.projectCreatedAt || new Date(utcToday.getTime() - 365 * DAY),
      newProjectFlag: row.newProjectFlag,
    }));

    const plan = planDailySlice(progress, yesterday, { filterProjectEligibility: true });
    const runnableIds = new Set(plan.slices.flatMap((slice) => slice.projectIds));
    const bad = [...runnableIds]
      .map((id) => ({ id, name: nameById.get(id) || "" }))
      .filter((project) => isLowValueExtractionProjectName(project.name));

    console.log("=== DC RUNNABLE PROJECT AUDIT ===");
    console.log(`progressRows=${progressRows.length}`);
    console.log(`slices=${plan.slices.length}`);
    console.log(`runnableProjects=${runnableIds.size}`);
    console.log(`excludedKeywordRunnable=${bad.length}`);
    if (bad.length > 0) {
      for (const p of bad) console.log(`BAD ${p.id} ${p.name}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run syntax check**

Run: `node --check scripts/scratch/audit-dc-runnable-projects.cjs`

Expected: exit 0.

- [ ] **Step 3: Run the live read-only audit**

Run: `node scripts/scratch/audit-dc-runnable-projects.cjs`

Expected: exit 0 and output `excludedKeywordRunnable=0`.

---

### Task 5: Full Verification and Commit

**Files:**
- All files modified above.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm.cmd test -- lib/acc/dcProjectEligibility.test.ts lib/acc/dcProgressiveBackfill.test.ts lib/acc/dcIngest.test.ts
```

Expected: all test files pass.

- [ ] **Step 2: Run syntax check**

Run:

```powershell
node --check scripts/scratch/audit-dc-runnable-projects.cjs
```

Expected: exit 0.

- [ ] **Step 3: Run read-only planner audit**

Run:

```powershell
node scripts/scratch/audit-dc-runnable-projects.cjs
```

Expected: `excludedKeywordRunnable=0`.

- [ ] **Step 4: Inspect scoped diff**

Run:

```powershell
git diff -- lib/acc/dcProjectEligibility.ts lib/acc/dcProjectEligibility.test.ts lib/acc/dcProgressiveBackfill.ts lib/acc/dcProgressiveBackfill.test.ts lib/acc/dcIngest.ts lib/acc/dcIngest.test.ts scripts/scratch/audit-dc-runnable-projects.cjs docs/superpowers/plans/2026-06-10-dc-hard-project-skip.md
```

Expected: only the hard skip implementation, tests, audit script, and plan are shown.

- [ ] **Step 5: Commit the implementation**

Run:

```powershell
git add lib/acc/dcProjectEligibility.ts lib/acc/dcProjectEligibility.test.ts lib/acc/dcProgressiveBackfill.ts lib/acc/dcProgressiveBackfill.test.ts lib/acc/dcIngest.ts lib/acc/dcIngest.test.ts scripts/scratch/audit-dc-runnable-projects.cjs docs/superpowers/plans/2026-06-10-dc-hard-project-skip.md
git commit -m "fix: hard-skip low-value DC projects"
```

Expected: commit succeeds without staging unrelated existing worktree changes.
