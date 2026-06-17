# Testing Patterns

**Analysis Date:** 2026-06-17

## Test Framework

**Runner:**
- Vitest 4.1.6
- Config: `vitest.config.ts`
- Environment: Node (default) + jsdom for component tests (via `// @vitest-environment jsdom` directive)

**Assertion Library:**
- Vitest built-in expect (similar to Jest)
- Additional matchers via @testing-library: `getByTestId`, `getByRole`, `fireEvent`, `within`, `render`

**Run Commands:**
```bash
npm test                # Run all unit tests (excludes e2e)
npm run test:e2e        # Run Playwright e2e suite
npm run test:e2e:ui     # Interactive Playwright UI
```

**E2E Framework:**
- Playwright 1.59.1
- Config: `playwright.config.ts`
- Test directory: `tests/e2e/`
- Port isolation: runs on `:3100` (separate from dev `:3000`)
- Auth: global-setup mints NextAuth cookies, stored in `playwright/.auth/storageState.json`

## Test File Organization

**Location:**
- Co-located pattern: `__tests__/` subdirectory adjacent to implementation
- Example: `/access-analysis/__tests__/companyCounts.test.ts` next to `/access-analysis/companyCounts.ts`
- E2E tests: `tests/e2e/*.spec.ts` at project root
- Integration tests: same `__tests__/` pattern as units

**Naming:**
- Unit/integration: `[module].test.ts` or `[module].spec.ts`
- E2E: `[feature].spec.ts`, kebab-case: `acc-3d-lasso.spec.ts`, `acc-cluster-blobs.spec.ts`
- Descriptive names signal test content: `companyCounts.test.ts`, `AccessAnalysisCharts.test.tsx`

**Structure:**
```
app/(dashboard)/access-analysis/
├── companyCounts.ts
├── __tests__/
│   ├── companyCounts.test.ts
│   ├── AccessAnalysisCharts.test.tsx
│   └── EChart.test.tsx
└── components/
    ├── AccessAnalysisCharts.tsx
    └── ...
```

## Test Structure

**Suite Organization:**
```typescript
// companyCounts.test.ts
import { describe, it, expect } from "vitest";
import { summarizeCompanies, collapseCompanySlices } from "../companyCounts";

describe("summarizeCompanies", () => {
  it("returns an empty summary for no rows", () => {
    expect(summarizeCompanies([])).toEqual({ slices: [], ... });
  });

  it("buckets memberships by company and tallies counts", () => {
    const s = summarizeCompanies([
      { company: "Hermosillo" }, { company: "Hermosillo" },
      { company: "Estructure" },
    ]);
    expect(s.total).toBe(3);
    expect(s.slices).toEqual([
      { name: "Hermosillo", value: 2 },
      { name: "Estructure", value: 1 },
    ]);
  });
});

describe("collapseCompanySlices", () => {
  it("pins Unknown company, keeps the top N, folds the rest", () => {
    expect(collapseCompanySlices(slices, 2)).toEqual([...]);
  });
});
```

**Patterns:**
- Flat describe blocks per function; no deep nesting
- One concept per test case
- Test names are sentences describing behavior (not implementation): "returns an empty summary for no rows" not "calls reduce on empty array"
- Arrange-Act-Assert (AAA) pattern implicit, no explicit comments

**React Component Tests:**
```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";

vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => <div data-testid="echart" />
}));

describe("AccessAnalysisCharts", () => {
  it("renders exactly one project search bar", () => {
    const { getAllByTestId } = render(
      <AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />
    );
    expect(getAllByTestId("project-search")).toHaveLength(1);
  });

  it("unticking ONE project re-buckets BOTH donuts at once", () => {
    const { getByTestId, getByRole } = render(...);
    fireEvent.focus(getByTestId("project-search"));
    fireEvent.click(getByRole("checkbox", { name: /tower b/i }));
    expect(getByTestId("role-legend").textContent).not.toContain("Designer");
  });
});
```

**Directive:** `// @vitest-environment jsdom` required to enable DOM APIs in component tests

## Mocking

**Framework:** Vitest's `vi` module
- `vi.mock(path, impl)` for module mocking
- `vi.fn()` for spy/mock functions
- `vi.stubGlobal(name, stub)` for global objects

**Patterns:**
- Mock heavy dependencies early: `echarts-for-react`, `next-auth`, `next/server`
- Mock at module scope, before imports:
  ```typescript
  vi.mock("echarts-for-react", () => ({
    default: (props: { option: any }) => <div data-testid="echart" data-names={...} />
  }));
  ```

- Mock API responses with Response objects:
  ```typescript
  function page(rows: AccdsActivityRow[], total: number, hasNext: boolean): Response {
    return new Response(
      JSON.stringify({ results: rows, pagination: {...} }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }
  ```

- Mock async functions with `vi.fn().mockResolvedValueOnce(...).mockResolvedValueOnce(...)`:
  ```typescript
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(page([row('a')], 1, false))
    .mockResolvedValueOnce(page([row('c')], 3, false));
  ```

- Stub global objects (framer-motion, DOM APIs):
  ```typescript
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
  ```

**Global Setup (vitest.setup.ts):**
- Mock environment: `DATABASE_URL`, `NODE_ENV = "test"`
- Mock server-only module to prevent "only on server" errors
- Mock next-auth handlers and functions
- Stub DOM APIs (IntersectionObserver, etc.)

**What to Mock:**
- External SDKs: echarts-for-react, authentication libraries
- Heavy I/O: API calls, file reads (replace with Response objects or test data)
- DOM-dependent libraries: IntersectionObserver, ResizeObserver

**What NOT to Mock:**
- Pure utility functions (`summarizeCompanies`, `collapseCompanySlices` — test the real logic)
- Data transformation: test with real data structures to catch schema mismatches
- Custom hooks: avoid mocking; test their effects on rendered output

## Fixtures and Factories

**Test Data:**
```typescript
// companyCounts.test.ts — inline fixture
const slices = [
  { name: "UNKNOWN_COMPANY", value: 100 },
  { name: "A", value: 30 },
  { name: "B", value: 20 },
];

// ActivityByRolePieChart.test.tsx — object factory
const summary: RoleActivitySummary = {
  slices: [
    { name: "Alpha", value: 100 },
    { name: "Bravo", value: 60 },
  ],
  usersByRole: new Map([
    ["Alpha", [{ email: "ana@x.com", name: "Ana", count: 70 }]],
  ]),
};

// accdsActivity.test.ts — helper factory
function row(id: string): AccdsActivityRow {
  return {
    activity_id: id,
    created_at: '2026-06-01T00:00:00.000Z',
    project_id: 'p1',
    activity_verb: 'view-entity',
    created_by: 'U1'
  };
}
```

**Location:**
- Inline fixtures in test files (not a separate `fixtures/` directory)
- Helper factories at top of test file
- Minimize setup code; use real data when possible

## Coverage

**Requirements:** Not enforced (no coverage config detected)

**Coverage approach:**
- Unit tests focus on logic paths and edge cases
- Examples: empty input, boundary values, error conditions, single vs. multiple items
- Component tests focus on user interactions and rendered output, not code paths

## Test Types

**Unit Tests:**
- Scope: single function or small module
- Approach: test with real dependencies where possible; mock only external I/O
- Example: `companyCounts.test.ts` tests `summarizeCompanies` with real data structures
- Coverage: happy path, empty input, edge cases (null, undefined, blank strings)

**Integration Tests:**
- Scope: multiple functions working together
- Approach: real data flow without mocking internals
- Example: `AccessAnalysisCharts.test.tsx` tests prop-driven state changes across child donuts
- No separate "integration" directory; use the same `__tests__/` pattern with integration-scoped test names

**E2E Tests:**
- Framework: Playwright
- Scope: full user workflow on running app
- Approach: real server, real DB, real authentication
- Example: `acc-3d-lasso.spec.ts` tests graph interaction (drag, wait for freeze, validate output)
- Config: `playwright.config.ts` runs dev server on `:3100`, loads auth state from `storageState.json`

**E2E Pattern - Wait for Readiness:**
```typescript
async function gotoGraph(page: Page): Promise<void> {
  await page.goto(GRAPH_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__ACC_GRAPH_TEST__?.isReady(), undefined, {
    timeout: 120_000,
  });
  await page.waitForFunction(() => {
    const s = window.__ACC_GRAPH_TEST__?.getPositionsStats();
    return s.count > 0 && !s.anyNaN && s.maxAbs > 1;
  });
}
```

**E2E Pattern - Custom Test Bridge:**
- Global `window.__ACC_GRAPH_TEST__` object exposes internals (positions, frozen state, etc.)
- Allows e2e tests to validate internal state without relying solely on visual checks
- Set up per-route (e.g., with `NEXT_PUBLIC_ACC_GRAPH_TEST` flag)

## Common Patterns

**Async Testing:**
```typescript
it("retries on 429 then succeeds", async () => {
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
    .mockResolvedValueOnce(page([row('a')], 1, false));
  const res = await fetchActivityWindow({...});
  expect(res.results).toEqual([...]);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
```

- Async functions are tested with `await`
- Mock chains verify behavior after retry
- Assertion count kept low (test one concept per case)

**Error Testing:**
```typescript
it("throws on 403", async () => {
  const fetchImpl = vi.fn(async () => new Response('forbidden', { status: 403 }));
  await expect(
    fetchActivityWindow({
      getToken, projectId: 'p1', startISO: 's', endISO: 'e', ...
    })
  ).rejects.toThrow(/403/);
});
```

- Use `.rejects.toThrow(pattern)` for async errors
- Regex patterns for error message matching (not strict equality)
- Minimal setup; focus on the error condition

**User Interaction (Component):**
```typescript
it("drills into the people behind a role", () => {
  const { getByTestId } = render(<AccessAnalysisCharts {...} />);
  fireEvent.click(within(getByTestId("activity-role-legend")).getByRole("button", { name: /Member/ }));
  expect(getByTestId("activity-role-drilldown").textContent).toContain("Ana");
});
```

- `fireEvent` for DOM events (click, focus)
- `getByRole` for accessible elements (button, checkbox)
- `within` to scope queries to a subtree

**Conditional Test Skip:**
```typescript
test.beforeEach(() => {
  test.skip(
    process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH === "1",
    "Physics shell is the default; skip only when the projector is opted in"
  );
});

test("3D lasso — smoke", async ({ page }) => {
  test.skip(!ACC_3D_GRAPH, "3D physics graph is parked behind NEXT_PUBLIC_ACC_3D_GRAPH=1");
  // ...
});
```

- Feature-flag tests based on environment variables
- Skip messages explain the condition

---

*Testing analysis: 2026-06-17*
