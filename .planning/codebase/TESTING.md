# Testing Patterns

**Analysis Date:** 2026-06-19

**Primary Sources:**
- `package.json`
- `vitest.config.ts`
- `vitest.setup.ts`
- `playwright.config.ts`
- `tests/e2e/uat-workshop.spec.ts`
- `scripts/uat/run-engineering-gates.cjs`
- `.tools/repo-map/manifest.json`

## Test Framework

**Runner:**
- Vitest `^4.1.6` for unit and component-style tests.
- Config: `vitest.config.ts`.
- Environment: `node` with globals enabled.
- Setup: `vitest.setup.ts`.

**Assertion Library:**
- Vitest built-in `expect`.
- Tests commonly import `describe`, `it`, `expect`, `beforeEach`, `afterEach`, and `vi` from `vitest`, or rely on globals depending on file.

**E2E Runner:**
- Playwright `^1.59.1`.
- Config: `playwright.config.ts` for standard E2E.
- UAT/prod-style verification references `playwright.verify.config.ts` and `tests/e2e/uat-workshop.spec.ts`.

**Run Commands:**
```powershell
npm test
npm test -- path/to/file.test.ts
npm run test:e2e
npm run test:e2e:ui
npx tsc --noEmit
npm run repo-map:check
node scripts/uat/run-engineering-gates.cjs
```

## Test File Organization

**Location:**
- Unit tests are mostly collocated with source files: `server/routers/acc-sync.test.ts`, `lib/acc/dcIngest.test.ts`, `app/(dashboard)/users/statCardDetails.test.ts`.
- Component tests may live in `__tests__/`: `components/ui/__tests__/DataTable.test.tsx`.
- E2E tests live under `tests/e2e/`.

**Naming:**
- Unit/component tests: `*.test.ts` and `*.test.tsx`.
- Playwright tests: `*.spec.ts`.
- Test helpers: descriptive helper files such as `tests/e2e/uat-helpers.ts`.

**Structure:**
```text
source/
├── module.ts
├── module.test.ts
└── __tests__/
    └── Component.test.tsx

tests/
└── e2e/
    ├── uat-workshop.spec.ts
    ├── uat-helpers.ts
    └── *.spec.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it, vi } from "vitest";

describe("feature or module", () => {
  it("handles the important behavior", () => {
    const result = runSubject();
    expect(result).toEqual(expected);
  });
});
```

**Patterns:**
- Prefer focused tests for pure transforms, domain classifiers, graph math, and table shaping.
- Use integration-style tests around routers and server helpers when behavior spans DB-shaped data.
- UAT/E2E tests are explicit about engineering gates and failure messages.
- Complex gate tests capture command output and rethrow with context.

## Mocking

**Framework:**
- Vitest `vi` mocking.
- `vitest.setup.ts` mocks `server-only`, `next/server`, `next-auth`, and `next-auth/next`.
- `vitest.setup.ts` stubs `IntersectionObserver` for framer-motion/in-view component tests.

**Patterns:**
```typescript
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
```

**What to Mock:**
- Next/NextAuth runtime boundaries in unit tests.
- Browser APIs missing in the test environment.
- External API calls where the test is not an integration test.
- Time, fetch, or module imports when testing deterministic transforms.

**What Not to Mock:**
- Pure domain transforms.
- Graph/math/layout helpers where deterministic input/output assertions are possible.
- Shared constants/taxonomies unless the test is specifically about fallback behavior.

## Fixtures and Factories

**Observed Pattern:**
- Most fixtures are local helper objects/functions in test files.
- Some access-analysis tests use local fixtures under route directories.
- E2E tests use Playwright auth storage from `playwright/global-setup.ts`.

**Recommended Pattern:**
- Keep small fixtures inline.
- Extract shared factories when more than two test files duplicate the same data setup.
- For ACC/Data Connector tests, prefer typed factories that mirror Prisma/domain shapes rather than loose objects.

## Coverage

**Requirements:**
- No explicit coverage threshold was detected in `vitest.config.ts`.
- Practical coverage is enforced by targeted unit tests, E2E tests, `npx tsc --noEmit`, and `npm run repo-map:check`.

**Structural Gates:**
- `repo-map:check` fails on dependency errors, circular imports, new blocking AST findings, dependency-warning growth beyond baseline, and stale baseline file refs.
- 2026-06-19 status: pass with 0 circulars, 0 dependency errors, 6 baseline dependency warnings, and 0 new blocking AST findings.

## Test Types

**Unit Tests:**
- Scope: pure transforms, utilities, router helpers, domain classification, graph/layout math.
- Examples: `app/(dashboard)/users/access-analysis/*.test.ts`, `lib/acc/*.test.ts`, `server/routers/*.test.ts`.
- Expectation: fast and deterministic.

**Component Tests:**
- Scope: UI primitives and feature components.
- Examples: `components/ui/__tests__/*.test.tsx`, route-level `*.test.tsx` files.
- Setup: Vitest plus React Testing Library patterns where used.

**Router/Server Tests:**
- Scope: tRPC routers, server helpers, data aggregation, ACC/Data Connector behavior.
- Examples: `server/routers/acc-activity.coverage.test.ts`, `server/routers/acc-members.kpi.test.ts`.

**E2E Tests:**
- Scope: browser flows and UAT-facing behavior.
- Location: `tests/e2e/`.
- Config: `playwright.config.ts` starts an isolated dev server on `E2E_PORT` (default `3100`) with `NEXT_DIST_DIR=.next-e2e`.

**UAT Engineering Gates:**
- `tests/e2e/uat-workshop.spec.ts` covers TypeScript, boundary diff, GraphCanvas grep, fetch-once behavior, canvas count, reduced motion, overflow, WCAG contrast, screenshots, and drill smoke checks.
- `scripts/uat/run-engineering-gates.cjs` wraps static and browser verification into a report.

## Common Patterns

**Async Testing:**
```typescript
it("handles async work", async () => {
  const result = await runAsyncSubject();
  expect(result).toEqual(expected);
});
```

**Error Testing:**
```typescript
it("throws with context", () => {
  expect(() => runSubject()).toThrow("expected message");
});
```

**Command/Gate Testing:**
```typescript
try {
  execSync("npx tsc --noEmit 2>&1", { cwd: process.cwd(), encoding: "utf8" });
} catch (err: unknown) {
  throw new Error(`tsc --noEmit FAILED:\n${capturedOutput}`);
}
```

## Verification Sequence for Risky Changes

Use this when touching shared architecture, ACC/Data Connector, access-analysis, auth, or build/runtime config:

```powershell
npx tsc --noEmit
npm test -- path/to/changed-or-adjacent.test.ts
npm run repo-map:check
```

For UAT/page behavior:

```powershell
npm run test:e2e -- tests/e2e/<target>.spec.ts
node scripts/uat/run-engineering-gates.cjs
```

---

*Testing analysis: 2026-06-19*
*Update when test runner config, gate contracts, or UAT verification changes.*
