# Testing

## Framework

- **Runner:** Vitest 4.1.6 (`vitest run` via `npm test`)
- **DOM testing:** `@testing-library/react` (used in `*.test.tsx`)
- **Config:** `vitest.config.ts` — Node environment, `globals: true`, setup file `vitest.setup.ts`
- **Setup file:** `vitest.setup.ts` — stubs jsdom browser APIs + mocks server-only modules so client code can run in Node test env

## Test Organization

Tests are **co-located** next to the module under test, not in a separate `__tests__/` tree.

Examples:
- `lib/acc/dcActivityCsvIngest.ts` ↔ `lib/acc/dcActivityCsvIngest.test.ts`
- `app/(dashboard)/users/access-analysis/duckdbClient.ts` ↔ `duckdbClient.test.ts`
- `server/routers/acc-activity.timeline.test.ts` (route-level test)

Roughly 50+ test files concentrated in:
- `lib/acc/` — ingest, analytics, CSV pipelines (highest coverage)
- `app/(dashboard)/users/` — graph rendering, filters, modes, topology
- `app/(dashboard)/users/access-analysis/` — DuckDB/Mosaic redesign work
- `server/routers/` — a few router-level tests (e.g. `families.test.ts`, `acc-members.kpi.test.ts`)
- `components/sync-center/SyncCenterStatusPanel.test.tsx`

## Patterns

**Factory fixtures:** test data built via small helper functions rather than JSON fixtures.

**Mocking:**
- `vi.fn()` for spies
- `vi.mock('module-path', () => ({ ... }))` for module-level mocks
- jsdom-style browser API stubs live in `vitest.setup.ts` so individual tests don't repeat them

**Server module mocks:** `server/db.ts`, `server/auth.ts`, and other server-only modules are mocked globally in `vitest.setup.ts` to keep tests deterministic and offline.

**Async:** `await` in `it()` blocks; no fake-timer convention applied uniformly.

**Error testing:** `expect(...).rejects.toThrow(...)` and `expect(() => ...).toThrow(...)` patterns.

## What Is Tested Well

- ACC ingest CSV parsing + normalization (`lib/acc/dc*CsvIngest.test.ts`, `accStatusReduction.test.ts`, `csvExport.test.ts`)
- Active user tier classification (`activeUserTiers.test.ts`)
- Graph filters / modes / topology (`accGraphFilters.test.ts`, `accGraphModes.test.ts`, `accGraphTopology.test.ts`)
- Cosmos / DuckDB client utilities (`CosmosCanvasClient.test.ts`, `duckdbClient.test.ts`)
- Anomaly detection (`dcAnomalyChecks.test.ts`)

## Gaps

- **No end-to-end / browser tests.** No Playwright, Cypress, or Chrome DevTools tests committed.
- **Coverage not enforced.** No `--coverage` threshold in `vitest.config.ts`; no CI gate.
- **Limited tRPC router tests.** Most routers (`server/routers/*.ts`) have no companion test; only a handful (`acc-activity.timeline.test.ts`, `acc-members.kpi.test.ts`, `families.test.ts`) do.
- **No integration tests against live Postgres.** Tests mock `server/db.ts`; the Prisma layer + actual SQL is not exercised in CI.
- **No tests for the daily DC cron path.** `scripts/dc-daily-cron.ps1` + `dc-daily-ingest.cjs` are tested manually only.
- **Auth flows untested.** `server/auth.ts` + NextAuth callbacks have no unit tests.

## Running Tests

```bash
npm test              # vitest run (one-shot)
npx vitest            # watch mode
npx vitest run path/to/file.test.ts   # single file
```

No pre-commit or pre-push hook runs the suite — tests must be run manually before commits.
