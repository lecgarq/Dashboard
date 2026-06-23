# Testing Patterns

**Analysis Date:** 2026-06-23

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
3. `npm run repo-map:check` — dependency boundary check (for architecture/import changes).
4. `npm run build` — produces `.next/`, used by Task Scheduler restart.

**Deploy = rebuild + restart:**
Task Scheduler on Luis's PC stops the process, runs `npm run build`, then restarts `next start` on `:3000`. Never use `next dev` for the live workshop server.

**E2E isolation:** Playwright starts its own `next dev` on port `3100` (env `E2E_PORT=3100`) with `NEXT_DIST_DIR=.next-e2e` so it never touches the production `.next` directory. The prod server on `:3000` can stay running.

## Vitest Setup (`vitest.setup.ts`)

Critical global stubs registered for all unit tests:

```ts
// Fake DATABASE_URL (prevents real DB connections in unit tests)
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
process.env.NODE_ENV = "test";

// Prevent 'server-only' module from throwing
vi.mock('server-only', () => ({}));

// Stub next-auth so router tests don't need real auth wiring
vi.mock('next-auth', () => ({ default: () => ({ handlers: {}, auth: vi.fn(), ... }) }));

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

**E2E layout:**
```
tests/e2e/
  acc-dc-graph.spec.ts      # spatial graph (16,942 nodes, bridge assertions)
  acc-3d-lasso.spec.ts
  acc-cluster-blobs.spec.ts
  uat-workshop.spec.ts      # 38-test Phase 7 UAT harness
  uat-helpers.ts            # shared helpers (parseTrpcBatch, toggleTheme, etc.)
  folder-activity-by-role.spec.ts
  forma-proposal.spec.ts
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
- `NEXT_PUBLIC_ACC_GRAPH_TEST=1` — enables `window.__ACC_GRAPH_TEST__` bridge for spatial graph assertions (position stats, hover/click simulation, color buffer, clustering score, lasso, edges).
- `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1` — enables the redesigned `/access-analysis` dashboard.
- `NEXT_PUBLIC_ACC_3D_GRAPH=1` — enables 3D physics shell. Many e2e tests use `test.skip(!ACC_3D_GRAPH, ...)` to gate 3D-specific assertions.

**Test bridge pattern (`window.__ACC_GRAPH_TEST__`):**
```ts
// Wait for graph ready via bridge
await page.waitForFunction(() => !!window.__ACC_GRAPH_TEST__?.isReady(), undefined, { timeout: 120_000 });

// Read state from bridge
const stats = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
expect(stats.anyNaN).toBe(false);
expect(stats.count).toBe(EXPECTED_NODE_COUNT); // 16,942

// Simulate production handler when real mouse hit misses (WebGL picking):
await page.evaluate((id) => window.__ACC_GRAPH_TEST__!.simulateHover(id!), nodeId);
```

**Screenshot / proof artifacts:**
```ts
async function proofShot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const body = await page.screenshot({ fullPage: false });
  await testInfo.attach(name, { body, contentType: "image/png" });
}
```
Always attach a `proofShot` at the end of assertions that exercise real UI. Config has `trace: "on"` and `screenshot: "on"` globally.

**Timeouts:**
- Global test timeout: `120_000ms`
- `expect` timeout: `20_000ms`
- Workers: 1 (no parallel tests — graph tests are memory-heavy)
- Retries: 0

**waitForFreeze vs smoke:**
```ts
// Use waitForFreeze only for tests that drive real mouse to a screen pixel.
// Smoke/bridge-read tests must NOT call waitForFreeze (adds minutes per run).
async function waitForFreeze(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__ACC_GRAPH_TEST__?.getFrozen() === true, undefined, { timeout: 90_000 });
}
```

## Spatial Graph Test Conventions (`/users/spatial-graph`)

NOTE: `/users/spatial-graph` is normally out of scope for new feature work, but its test conventions are documented here because the owner has explicitly scoped them in for reference.

- URL under test: `GRAPH_URL = "/users/spatial-graph"`.
- `gotoGraph(page)` helper: navigates, waits for bridge ready + finite non-NaN positions.
- Node count constant: `EXPECTED_NODE_COUNT = 16_942`. Asserted exactly — bump only if the DC dataset changes.
- 3D tests skip when `NEXT_PUBLIC_ACC_3D_GRAPH !== "1"` via `test.skip(!ACC_3D_GRAPH, ...)`.
- Slider interactions use `page.keyboard.press("End")` (Radix Slider keyboard API) not drag.

## UAT Workshop Tests (`tests/e2e/uat-workshop.spec.ts`)

- Run under `playwright.verify.config.ts` (no `webServer` block — owner starts server manually).
- Quick run: `E2E_BASE_URL=http://localhost:3100 npx playwright test uat-workshop --config playwright.verify.config.ts`
- Viewport override: `1280×800` (workshop projector size).
- Static gate inside Playwright: runs `npx tsc --noEmit` via `execSync` as a test case.
- Helpers in `tests/e2e/uat-helpers.ts`: `parseTrpcBatch`, `injectAxeAndRunContrast`, `toggleTheme`, `assertNoHorizontalOverflow`, `uatScreenshot`.

## What NOT to Mock

- Real Prisma schema / DB calls in `lib/server/` view functions — these are tested by injecting a fake `db` object with `vi.fn()` methods, not by importing real `@prisma/client`.
- `next/navigation` (router) if tests don't drive navigation — just don't call `useRouter`.
- CSS / Tailwind classes — no visual regression tests; trust type safety and e2e screenshots.

## Coverage

No enforced coverage thresholds. The access-analysis route has the densest unit coverage (~38+ test files). Run count: ~1400+ Vitest unit tests as of Phase 8.

---

**Dashboard self-check:**
- Context: `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `playwright/global-setup.ts`, test files in `app/`, `lib/server/`, `server/routers/`, `tests/e2e/`, `package.json` scripts.
- Evidence: all test files and patterns verified by direct Read and Grep.
- Constraints: no jest-dom, no real DB in unit tests, e2e on :3100 with NEXT_DIST_DIR=.next-e2e.
- Gates: `npx tsc --noEmit` before rebuild; `npm test` before commit; `npm run repo-map:check` for boundary changes.
- VERIFY: total unit test count may drift as phases add tests — count cited (~1400+) reflects Phase 8 state.
