# Testing Patterns

**Analysis Date:** 2026-05-12

## Test Framework

**Runner:**
- Vitest 4.1.6
- Config: `vitest.config.ts`
- Environment: node
- Globals enabled: `globals: true` (describe, it, expect available without imports)
- Setup file: `vitest.setup.ts`

**Assertion Library:**
- Vitest built-in expect (compatible with Jest API)
- No separate assertion library; built-in matchers are sufficient

**Run Commands:**
```bash
npm test              # Run all tests (vitest run)
npm test -- --watch   # Watch mode (inferred from npm scripts)
# Coverage not configured in vitest.config.ts
```

## Test File Organization

**Location:**
- Co-located with source files using `.test.ts` or `.test.tsx` suffix
- Examples: 
  - `lib/acc/nameSimilarity.ts` → `lib/acc/nameSimilarity.test.ts`
  - `app/(dashboard)/users/cosmosUtils.ts` → `app/(dashboard)/users/cosmosUtils.test.ts`
  - `server/routers/families.ts` → `server/routers/families.test.ts`

**Naming:**
- Pattern: `[filename].test.ts` or `[filename].test.tsx`
- No separate `__tests__` directories except legacy `lib/server/__tests__/` pattern (still observe single `.test.ts` pattern as modern standard)

**Structure:**
```
lib/acc/
├── nameSimilarity.ts
├── nameSimilarity.test.ts
├── dashboardAnalytics.ts
├── dashboardAnalytics.test.ts
└── ...
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from "vitest";

describe("functionName", () => {
  it("describes the expected behavior in English", () => {
    // arrange
    const input = ...;
    
    // act
    const result = functionUnderTest(input);
    
    // assert
    expect(result).toBe(...);
  });
});
```

**Patterns:**
- Top-level `describe()` block per function or module feature
- Nested `describe()` blocks for related test groups: `describe("tokenize", () => { ... })`
- Flat structure for simple functions: all test cases under single `describe()` block
- Setup/teardown: Not observed in sampled tests; vitest.setup.ts handles globals

## Test Examples

**Unit Test Example — Pure Function:**
```typescript
// From nameSimilarity.test.ts
describe("nameTokenOverlap", () => {
  it("returns 1.0 when names are reorderings of the same tokens", () => {
    expect(nameTokenOverlap("BIM Coordinator", "Coordinator BIM")).toBe(1.0);
  });

  it("returns 0.0 for disjoint single-token names (Pitfall 5)", () => {
    expect(nameTokenOverlap("Architect", "Admin")).toBe(0.0);
  });

  it("returns Jaccard for partial overlap: {bim} ∩ / {bim,coordinator,lead} ∪ = 1/3", () => {
    expect(nameTokenOverlap("BIM Coordinator", "BIM Lead")).toBeCloseTo(1 / 3, 10);
  });
});
```

**Parameterized Test Pattern — Loop-based:**
```typescript
// From cosmosUtils.test.ts
it("monotonicity across separation 0..100", () => {
  let prevRepulsion = -Infinity;
  let prevDistance = -Infinity;
  let prevSpring = Infinity;
  let prevGravity = Infinity;
  for (let s = 0; s <= 100; s += 10) {
    const cfg = controlsToSimulationConfig({ spacing: s, clusterStrength: 0 });
    expect(cfg.simulationRepulsion).toBeGreaterThanOrEqual(prevRepulsion);
    expect(cfg.simulationLinkDistance).toBeGreaterThanOrEqual(prevDistance);
    expect(cfg.simulationLinkSpring).toBeLessThanOrEqual(prevSpring);
    expect(cfg.simulationGravity).toBeLessThanOrEqual(prevGravity);
    prevRepulsion = cfg.simulationRepulsion;
    prevDistance = cfg.simulationLinkDistance;
    prevSpring = cfg.simulationLinkSpring;
    prevGravity = cfg.simulationGravity;
  }
});
```

**Test Data Factory Pattern:**
```typescript
// From accGraphFilters.test.ts
function makeNode(overrides: Partial<FilterableNode> = {}): FilterableNode {
  return {
    roles: [],
    lastAddedBucket: "2026-01",
    isAdmin: false,
    modules: [],
    companyRole: null,
    lastSignIn: null,
    perProjectRoleNames: undefined,
    ...overrides,
  };
}

describe("DEFAULT_FILTERS sanity", () => {
  it("passes a node with no fields set", () => {
    expect(nodeMatchesFilters(makeNode(), DEFAULT_FILTERS)).toBe(true);
  });

  it("passes a node with all fields populated", () => {
    const node = makeNode({
      roles: ["Architect"],
      modules: ["docs", "build"],
      companyRole: "Engineer",
      lastSignIn: "2026-03-15T08:00:00Z",
      isAdmin: true,
    });
    expect(nodeMatchesFilters(node, DEFAULT_FILTERS)).toBe(true);
  });
});
```

## Mocking

**Framework:**
- Vitest `vi` module for mocking
- Imported as: `import { describe, it, expect, vi } from "vitest"`

**Patterns:**
```typescript
// vi.fn() for spy/mock functions
const mockCtx = {
  session: { user: { id: 'test-user', role: 'ADMIN' } },
  db: {} as any,
  projectId: 'test-project',
};

// Mock module in vitest.setup.ts
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ NextResponse: {} }));
vi.mock('next-auth', () => ({
  default: () => ({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

// Manual mock setup per test
function makeDb(result: ProjectFindFirstResult) {
  return {
    project: {
      findFirst: vi.fn(async (_args: { select: { apsHubId: true } }) => result),
    },
  };
}
```

**What to Mock:**
- Server-only modules: `server-only` (raises in browser context)
- Next.js internals: `next/server`, `next-auth`
- External dependencies at API boundaries (rare in sampled code)
- Database calls: wrap in vi.fn() to control return values

**What NOT to Mock:**
- Pure utility functions: call them directly to test actual behavior
- Standard library: Date, Set, Map, Array methods
- Zod schema: test actual validation behavior
- Internal functions (not exported): call via public interface

## Fixtures and Factories

**Test Data:**
```typescript
// Factory pattern — see test data creation in cosmosUtils.test.ts
const nodes: ClusterableNode[] = [
  { roles: ["Architect"] },
  { roles: ["Modeler"] },
  { roles: ["Architect"] },
];

// Manual test data creation
const idx = new Map([["a", 0], ["b", 1], ["c", 2]]);
const links = [
  { source: "a", target: "role:owner" },
  { source: "b", target: "role:owner" },
  { source: "c", target: "role:owner" },
];

// Float32Array test data
const squareCCW = new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]);
```

**Location:**
- Fixtures created inline in test files (no separate fixture files)
- Factory functions as module-level helpers: `function makeNode(...)`, `function makeDb(...)`
- Test data as inline literals when simple: `const nodes: ClusterableNode[] = [...]`

## Coverage

**Requirements:** No coverage configuration in vitest.config.ts; no thresholds enforced

**View Coverage:** Not configured; would require `--coverage` flag and coverage tool (not in package.json)

## Test Types

**Unit Tests:**
- Scope: Individual pure functions with well-defined inputs and outputs
- Approach: Test all branches, edge cases, boundary conditions
- Examples: `nameSimilarity.test.ts` (tokenization, Jaccard overlap), `cosmosUtils.test.ts` (cluster IDs, polygon containment)
- Assertion style: Direct equality checks, approximate matching (toBeCloseTo), type assertions

**Integration Tests:**
- Scope: tRPC procedures with mocked database context
- Approach: Create mock context, call procedure, assert result matches expectation
- Example: `families.test.ts` — instantiate router caller with mock context, verify procedures exist
- Limited in sampled code; mostly stubs checking procedure availability

**E2E Tests:**
- Framework: Not used in main test suite
- Playwright available (v1.59.1 in dependencies) but no e2e test files observed
- Comments suggest manual verification approach: `This is the closest user-derived proxy...`

## Common Patterns

**Async Testing:**
```typescript
// From acc-helpers.test.ts
it("returns a 'b.'-prefixed id unchanged", async () => {
  const db = makeDb({ apsHubId: "b.abc-123" });
  await expect(getAccountId(db)).resolves.toBe("abc-123");
  expect(db.project.findFirst).toHaveBeenCalledWith({ select: { apsHubId: true } });
});

// Pattern: Use resolves/rejects matchers
// Pattern: Expect called-with assertions after async operations
```

**Error Testing:**
```typescript
// From acc-helpers.test.ts
it("throws a plain Error (not TRPCError) when the project record is null", async () => {
  const db = makeDb(null);
  await expect(getAccountId(db)).rejects.toThrowError(/hub.*not configured/i);
  
  // Verify error type explicitly
  try {
    await getAccountId(db);
    throw new Error("expected getAccountId to throw");
  } catch (err) {
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("Error");
  }
});
```

**Boundary Testing:**
```typescript
// From cosmosUtils.test.ts
it("returns false for degenerate polygons (< 3 vertices)", () => {
  expect(pointInPolygon(0, 0, new Float32Array([]))).toBe(false);
  expect(pointInPolygon(0, 0, new Float32Array([1, 1]))).toBe(false);
  expect(pointInPolygon(0, 0, new Float32Array([1, 1, 2, 2]))).toBe(false);
});
```

**Documented Pitfalls:**
```typescript
// From nameSimilarity.test.ts — tests explicitly call out known pitfalls
it("returns 0.0 for disjoint single-token names (Pitfall 5)", () => {
  expect(nameTokenOverlap("Architect", "Admin")).toBe(0.0);
});
```

## Test Execution

**Setup File — vitest.setup.ts:**
```typescript
import { vi } from 'vitest';

process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
process.env.NODE_ENV = "test";

// Mock server-only to prevent it from throwing in tests
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ NextResponse: {} }));
vi.mock('next-auth', () => ({
  default: () => ({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));
vi.mock('next-auth/next', () => ({
  default: vi.fn(),
}));
```

## Test Coverage Observations

**Well-Tested:**
- Pure utility functions: `nameSimilarity.ts` (80+ lines of test code), `cosmosUtils.ts` (detailed polygon/cluster tests)
- Input validation: Zod schema tests implicit through tRPC router tests
- Boundary conditions: Documented pitfalls have explicit test cases

**Partially Tested:**
- tRPC routers: Limited to procedure existence and mock context setup; actual query/mutation logic minimally verified
- Error handling: Error types tested but error propagation paths less thoroughly covered

**Untested:**
- React components: No Jest/React Testing Library tests observed
- End-to-end flows: No Playwright tests in codebase
- Server actions: No vitest coverage of Server Component data flows

---

*Testing analysis: 2026-05-12*
