# Testing Patterns

**Analysis Date:** 2026-06-23 (original full scan)
**Refreshed:** 2026-07-20 — post v2.5 close (phase 31/32 e2e specs, bridge extensions, test-count refresh, redesign-branch WIP note). Previous refreshes 2026-07-16, 2026-07-02.

## Test Framework

**Unit/Integration Runner:** Vitest `^4.1.6`
- Config: `vitest.config.ts` (repo root)
- Environment: `node` by default. Components requiring DOM APIs override per-file with `// @vitest-environment jsdom`.
- Globals: enabled (`globals: true`) — `describe`, `it`, `expect`, `vi` available without import, but tests typically import them explicitly.
- Setup file: `vitest.setup.ts`

**E2E Runner:** Playwright `^1.59.1`
- Config: `playwright.config.ts` (repo root)
- Test directory: `tests/e2e/`
- UAT variant config: `playwright.verify.config.ts` (used by UAT workshop harness)

**Run Commands:**
```bash
npm test                         # Vitest unit suite (excludes tests/e2e/**)
npm run test:e2e                 # Playwright e2e on :3100
npm run test:e2e:ui              # Playwright UI mode
npx tsc --noEmit                 # Full tree typecheck (MUST pass before any next build)
npm run repo-map:check           # Architecture boundary check
```

## Verification Gate Sequence

**Before any `next build` / deploy:**
1. `npx tsc --noEmit` — typechecks the WHOLE tree including test files. `next build` also typechecks tests; a failing test type error blocks the `:3000` build.
2. `npm test` — Vitest unit suite.
3. `npm run repo-map:check` — dependency boundary check (for architecture/import changes). Narrow check without regenerating the map: `node scripts/repo-map/check.cjs`.
4. `npm run build` — produces `.next/`, used by Task Scheduler restart.

**Never build while `:3000` is live** — this is now **enforced at the tool level**: the PreToolUse hook `.claude/hooks/guard-bash.cjs` probes port 3000 and denies `npm run build` / `next build` while it is up. Exemption: commands that set `NEXT_DIST_DIR` to a non-default dir (e.g. `.next-e2e`) build to an isolated dist and are allowed. Denials are intentional; do not retry — stop the `LECG Dashboard Local` scheduled task first (see `.claude/skills/lecg-dashboard/references/deploy-sequence.md`) or use `/lecg-ship`.

**Deploy = rebuild + restart:**
Task Scheduler on Luis's PC stops the process, runs `npm run build`, then restarts `next start` on `:3000`. Never use `next dev` for the live workshop server.

**E2E isolation:** the default `playwright.config.ts` starts its own `next dev --webpack` on port `3100` (env `E2E_PORT`, default 3100) with `NEXT_DIST_DIR=.next-e2e` so it never touches the production `.next` directory. The prod server on `:3000` can stay running. The webServer env also sets `NEXT_PUBLIC_ACC_GRAPH_TEST=1` and `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1`.

**Prod-build e2e variant (`playwright.verify.config.ts`):** no `webServer` block — a production `next start` on `:3100` is started **out-of-band** (build with `NEXT_DIST_DIR=.next-e2e` or an isolated dist, then start it), and tests point at it via `E2E_BASE_URL`. Its own header comment notes this exists because some suites need code paths that differ under the dev server (e.g. `pg` externalization). Recent full verification runs (dep update 2026-07-14) used this isolated prod-build harness.

## Vitest Setup (`vitest.setup.ts`)

Critical global stubs registered for all unit tests:

```ts
// Fake DATABASE_URL (prevents real DB connections in unit tests)
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
process.env.NODE_ENV = "test";

// Prevent 'server-only' module from throwing
vi.mock('server-only', () => ({}));

// Minimal NextResponse.json shim (next/server)
vi.mock('next/server', () => ({ NextResponse: { json: (body, init) => new Response(JSON.stringify(body), ...) } }));

// Stub next-auth so router tests don't need real auth wiring
vi.mock('next-auth', () => ({ default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }) }));
vi.mock('next-auth/next', () => ({ default: vi.fn() }));

// No-op IntersectionObserver for framer-motion whileInView
class IntersectionObserverStub { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
```

## Test File Organization

**Pattern 1 — `__tests__/` folder (access-analysis, template-mty, lib/server):**
```
app/(dashboard)/access-analysis/
  __tests__/
    roleCounts.test.ts         # pure logic tests
    RolesPieChart.test.tsx     # component tests (jsdom)
    FilterBanner.test.tsx
    EChart.test.tsx
  components/
    RolesPieChart.tsx
    FilterBanner.tsx
    EChart.tsx
  roleCounts.ts
```

**Pattern 2 — co-located (server/routers/, lib/server/):**
```
server/routers/
  acc-activity.ts
  acc-activity.coverage.test.ts   # co-located router test
  acc-activity.timeline.test.ts
lib/server/
  accessInstanceView.ts
  accessInstanceView.test.ts      # co-located
```

**E2E layout (full inventory, verified 2026-07-21):**
```
tests/e2e/
  acc-dc-graph.spec.ts             # activity fixture, time, dimensions, both route aliases
  acc-3d-lasso.spec.ts             # activity lasso + time-change clearing
  acc-person-graph.spec.ts
  access-analysis-scroll.spec.ts
  activity-payload.spec.ts         # real full-artifact median-of-five payload budget
  activity-universe-hard-gate.spec.ts # headed D3D11 Tier-0 ≥50 fps gate
  folder-activity-by-role.spec.ts
  forma-proposal.spec.ts
  scale-spike.spec.ts              # Phase 37 isolated renderer measurements
  sidebar-resize.spec.ts
  spatial-graph-baseline.spec.ts   # full-artifact navigation-ready baseline
  uat-workshop.spec.ts             # 38-test Phase 7 UAT harness
  uat-helpers.ts                   # shared helpers (parseTrpcBatch, toggleTheme, etc.)
playwright/
  global-setup.ts           # mints NextAuth session cookie
  .auth/storageState.json   # written by global-setup, gitignored
```

## Unit Test Structure

**Pure logic tests (most common):**
```ts
import { describe, it, expect } from "vitest";
import { summarizeRoles, UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";

// Fixture factory — inline, minimal
const mk = (roles: string[]) => ({ projectId: "p1", email: "a@x.com", roles, ... });

describe("summarizeRoles", () => {
  it("returns empty summary for no rows", () => {
    expect(summarizeRoles([])).toEqual({ slices: [], distinctRoles: 0, total: 0, usersByRole: new Map() });
  });

  it("buckets single role, multi-role, and role-less memberships", () => {
    const s = summarizeRoles([mk(["Member"]), mk(["Admin", "Member"]), mk([])]);
    expect(s.slices).toEqual([
      { name: "Member", value: 1 },
      { name: MULTIPLE_ROLES, value: 1 },
      { name: UNKNOWN_ROLE, value: 1 },
    ]);
  });
});
```

**Component tests (jsdom, `@testing-library/react`):**
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBanner } from "../components/FilterBanner";

describe("FilterBanner", () => {
  it("renders nothing when no filters are active", () => {
    const { container } = render(
      <FilterBanner filters={{}} shown={1152} total={1152} onRemove={() => {}} onClear={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("removes a filter via × button", () => {
    const onRemove = vi.fn();
    render(<FilterBanner filters={{ role: "Architect" }} shown={340} total={1152} onRemove={onRemove} onClear={() => {}} labels={{ role: "Role" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Role filter" }));
    expect(onRemove).toHaveBeenCalledWith("role");
  });
});
```

**Do NOT use jest-dom matchers** (`toBeInTheDocument`, `toHaveTextContent`). Use `.hasAttribute()`, `.textContent`, `getByTestId`, `getByRole`, and standard Vitest `expect`. The setup does not import `@testing-library/jest-dom`.

## Mocking Patterns

**tRPC router tests — inject a fake `db` object:**
```ts
function makeCaller(db: unknown) {
  return accActivityRouter.createCaller({
    db,
    session: { user: { id: "tester", email: "tester@lecg.com", role: "ADMIN" } },
    projectId: "project-default",
  } as any);
}

const db = {
  $queryRaw: vi.fn()
    .mockResolvedValueOnce([{ count: 100 }])
    .mockResolvedValueOnce([{ count: 95 }]),
  accActivity: { findMany: vi.fn(async () => []) },
};
const result = await makeCaller(db).getCoverage();
expect(db.$queryRaw).toHaveBeenCalledTimes(7);
```

**ECharts — mock `echarts-for-react` at the module level:**
```tsx
vi.mock("echarts-for-react", () => ({
  default: (props: { option: unknown }) => (
    <div data-testid="echart" data-has-option={!!props.option} />
  ),
}));
```

**next-auth — mocked globally** in `vitest.setup.ts` (no per-test mock needed).

**server-only — mocked globally** in `vitest.setup.ts`.

**Browser APIs unavailable in jsdom — stub per-test or in setup:**
```ts
// ResizeObserver (for virtual lists)
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// HTMLElement.scrollIntoView (Radix Select)
HTMLElement.prototype.scrollIntoView = () => {};

// window.scrollTo
vi.stubGlobal("scrollTo", () => {});
```

**`@tanstack/react-virtual` — mock for jsdom** (no real scroll geometry):
```ts
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => ({
    getVirtualItems: () => Array.from({ length: Math.min(opts.count, 2) }, (_, i) => ({ index: i, key: i, size: 48, start: i * 48 })),
    getTotalSize: () => opts.count * 48,
    measureElement: () => {},
  }),
}));
```

## Playwright E2E Conventions

**Auth:** `playwright/global-setup.ts` mints a real NextAuth v5 JWT via `@auth/core/jwt`'s `encode`, reads the admin user from the DB by `ADMIN_EMAIL`, and writes `playwright/.auth/storageState.json`. Every test loads this via `use.storageState`. Required env vars: `AUTH_SECRET`, `ADMIN_EMAIL`, `DATABASE_URL`.

**Feature flags:**
- `NEXT_PUBLIC_ACC_GRAPH_TEST=1` — enables the current
  `window.__ACTIVITY_UNIVERSE_TEST__` bridge and build-time activity test seams.
- `ACC_ACTIVITY_TEST_FIXTURE=1` — server-only second key that selects the
  deterministic 180-event activity payload; never set for full-scale gates.
- `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1` — enables the redesigned `/access-analysis` dashboard.
- `NEXT_PUBLIC_ACC_PERSON_GRAPH=1` — opt-in bridge for the separate person
  similarity graph; `acc-person-graph.spec.ts` skips without it.

**Test bridge pattern (`window.__ACTIVITY_UNIVERSE_TEST__`):**
```ts
// Wait for graph ready via bridge
await page.waitForFunction(
  () => window.__ACTIVITY_UNIVERSE_TEST__?.isReady() === true,
  undefined,
  { timeout: 120_000 },
);

// Read state from bridge
const state = await page.evaluate(() => window.__ACTIVITY_UNIVERSE_TEST__!.getState());
expect(state.positionsFinite).toBe(true);
expect(state.renderedCount).toBeGreaterThan(0);
expect(state.totalCount).toBe(180); // fixture harness only
```

**Screenshot / proof artifacts:**
```ts
async function proofShot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const body = await page.screenshot({ fullPage: false });
  await testInfo.attach(name, { body, contentType: "image/png" });
}
```
Attach a `proofShot` when a real interaction needs a review artifact. The
production verification config keeps screenshots on and traces off.

**Timeouts:**
- Default config: `120_000ms`; production verification config: `360_000ms`.
- `expect` timeout: `20_000ms`
- Workers: 1 (no parallel tests — graph tests are memory-heavy)
- Retries: 0
- Viewport: `1600×1000`

## Spatial Graph Test Conventions (`/users/spatial-graph`)

NOTE: `/users/spatial-graph` is normally out of scope for new feature work, but its test conventions are documented here because the owner has explicitly scoped them in for reference.

- URL under test: `GRAPH_URL = "/users/spatial-graph"`.
- `gotoActivity(page)` navigates and waits for `__ACTIVITY_UNIVERSE_TEST__`
  readiness plus finite, nonzero rendered positions.
- The CI fixture is exactly 180 activity events across three 60-event months;
  it requires both `NEXT_PUBLIC_ACC_GRAPH_TEST=1` and the server-only
  `ACC_ACTIVITY_TEST_FIXTURE=1`.
- The full-scale payload, navigation, and renderer specs must run against the
  real isolated production artifact without the fixture flag. Renderer proof
  is headed Chromium with `--use-angle=d3d11`; SwiftShader or Tier demotion is
  a hard failure.
- Temporal interaction uses the native range input and asserts exact active /
  total event counts. Reduced-motion coverage pins disabled autoplay and
  static manual stepping.

## UAT Workshop Tests (`tests/e2e/uat-workshop.spec.ts`)

- Run under `playwright.verify.config.ts` (no `webServer` block — a prod `next start` on `:3100` is started out-of-band).
- Quick run: `E2E_BASE_URL=http://localhost:3100 npx playwright test uat-workshop --config playwright.verify.config.ts`
- Viewport: `1600×1000` (same as the default config; the earlier `1280×800` claim is stale).
- Static gate inside Playwright: test `tsc-0` runs `npx tsc --noEmit` via `execSync` as a test case.
- Helpers in `tests/e2e/uat-helpers.ts`: `parseTrpcBatch`, `injectAxeAndRunContrast`, `toggleTheme`, `assertNoHorizontalOverflow`, `uatScreenshot`.

## Characterization Test Suites (v2.1 Ph14 + v2.2)

Central to the v2.2 refactor strategy: pin behavior byte-identically **before** splitting or rewiring, keep the pins green after. These suites are now standing regression guards:

- **TEST-01** — `AccFolderPermissionSummary` projection / OOM-guard suite (12/12): pins the aggregate path that serves `includePermissionSummary` in `lib/server/acc-hot-cache.ts`; guards against re-introducing the raw 5M-row scan.
- **TEST-02** — `lib/server/__tests__/folderPermissionTerrainView.test.ts`: byte-identical pin of the `/access-analysis` terrain view output across the Ph15 shared-query extraction and Ph16 terrain split.
- **TEST-03** — `lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts`: byte-identical pin of the `/template-mty` terrain output over `lib/server/folderPermQuery.ts`.
- **`HybridAnalyticsSurface.mainQuery.test.tsx`** — pins the `/users/access-analysis` surface's main query behavior across the Ph17 split.

Convention: any future split of a large module (or query-owner change) must add equivalent characterization pins first — see `CONVENTIONS.md`.

## What NOT to Mock

- Real Prisma schema / DB calls in `lib/server/` view functions — these are tested by injecting a fake `db` object with `vi.fn()` methods, not by importing real `@prisma/client`.
- `next/navigation` (router) if tests don't drive navigation — just don't call `useRouter`.
- CSS / Tailwind classes — no visual regression tests; trust type safety and e2e screenshots.

## Coverage

No enforced coverage thresholds. The access-analysis surfaces have the densest unit coverage — every pure transform module has a co-located test, and the v2.2 splits added characterization pins per extracted module. File count: **337 tracked `*.test.ts(x)` files** (`git ls-files`, 2026-07-20; 114 live under `__tests__/` directories). The working tree additionally carries 5 untracked new tests (`app/(dashboard)/users/statCardBoundaries.test.ts`, `lib/acc/issueBackfillAudit.test.ts`, `lib/acc/issueListQuery.test.ts`, `lib/acc/modelCoordinationGrant.test.ts`, `scripts/lib/tolerance-audit.test.ts`) and 3 working-tree deletions, all under `scripts/scratch/` (monitor-* tests). Historical run baselines: 2,256 passed / 302 files at v2.2 close (2026-07-02); ~2,535 passed at the 2026-07-14 dependency-update verification. VERIFY: current pass count not re-run for this refresh.

---

**Dashboard self-check:**
- Context: `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `playwright/global-setup.ts`, test files in `app/`, `lib/server/`, `server/routers/`, `tests/e2e/`, `package.json` scripts.
- Evidence: full E2E inventory and activity bridge patterns verified by direct
  reads and `rg` on 2026-07-21.
- Constraints: no jest-dom, no real DB in unit tests, e2e on :3100 with NEXT_DIST_DIR=.next-e2e.
- Gates: `npx tsc --noEmit` before rebuild; focused tests before completion;
  `node scripts/repo-map/check.cjs` for boundary changes; the LECG deploy
  sequence for an explicitly requested local rebuild.
- Latest full unit gate (2026-07-21): 339 files passed / 1 skipped; 2,562
  tests passed / 1 skipped (2,563 total). Counts drift as phases add tests;
  Phase 41 verification is the authority for this snapshot.
- Note: branch `feat/access-analysis-redesign` carries uncommitted WIP (verified 2026-07-20): several `app/(dashboard)/users/` components are deleted in the working tree, but their replacements' tests are committed co-located files; the only deleted test files are the three `scripts/scratch/monitor-*` tests. Several access-analysis and users tests are modified (e.g. `app/(dashboard)/access-analysis/__tests__/roleCounts.test.ts`, `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx`). Counts above are from tracked files (`git ls-files`).
