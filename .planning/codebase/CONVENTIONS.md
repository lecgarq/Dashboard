# Coding Conventions

**Analysis Date:** 2026-06-19

**Primary Sources:**
- `tsconfig.json`
- `eslint.config.mjs`
- `vitest.config.ts`
- Representative source files under `server/`, `app/`, `components/`, `lib/`, and `tests/`
- `.tools/repo-map/ast-grep-report.json`
- `.tools/repo-map/dependency-cruiser.json`

## Naming Patterns

**Files:**
- React component files use PascalCase when they export a visible component: `components/dashboard/MailPanel.tsx`, `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx`.
- Pure helpers and feature transforms use camelCase: `graphNodesFromUsers.ts`, `moduleOverrides.ts`, `featureSnapshot.ts`.
- Tests use `*.test.ts` or `*.test.tsx`; Playwright uses `*.spec.ts`.
- Next route files use framework names: `page.tsx`, `layout.tsx`, `loading.tsx`, `route.ts`.
- Scripts use `.cjs`, `.mjs`, `.ts`, or `.ps1` with descriptive kebab-case names.

**Functions:**
- Use camelCase for functions and hooks.
- React hooks use `use*`: `useEventSource`, `useMailNotifications`, `useGraphRafLoop`.
- Event handlers commonly use `handle*` when local to a component.
- tRPC procedures are grouped under domain routers rather than exported as standalone handler functions.

**Variables and Constants:**
- Use camelCase for local variables.
- Use UPPER_SNAKE_CASE for durable constants and env-like flags where appropriate: `NEXT_PUBLIC_ACC_GPU_2D`, `UNMAPPED_MODULE`.
- Prefer typed constants for domain labels/catalogs instead of raw repeated strings.

**Types:**
- Use PascalCase for interfaces and type aliases.
- Export named domain types when they are consumed across modules.
- Prefer `type` imports for type-only imports when practical.
- Type augmentations live under `types/`, such as `types/next-auth.d.ts`.

## Code Style

**Formatting:**
- There is no dedicated Prettier config detected in the fresh map.
- Formatting is locally consistent but mixed across older files; match nearby file style when editing.
- Most application TypeScript uses semicolons and double quotes; some config/setup files use single quotes.
- Do not reformat unrelated files as part of feature work.

**TypeScript:**
- `tsconfig.json` has `strict: true`, `noEmit: true`, `moduleResolution: bundler`, and `jsx: react-jsx`.
- `noImplicitAny` is currently `false`, so new code should still prefer explicit domain types where ambiguity matters.
- Path alias: `@/*` maps to the repository root.

**Linting:**
- `eslint.config.mjs` currently mainly ignores generated/build/cache directories.
- `npm run lint` invokes `eslint`.
- The stronger structural guard is `npm run repo-map:check`, which runs dependency-cruiser and ast-grep.

## Import Organization

**Common Order:**
1. External packages: React, Next, tRPC, Prisma, SDKs.
2. Absolute internal imports through `@/`.
3. Relative imports from the same feature/module.
4. Type-only imports where appropriate.

**Path Aliases:**
- Use `@/` for root-relative application imports.
- Relative imports are common within feature directories.

**Boundary Rules:**
- `app/` may import from `components/`, `lib/`, and server-safe modules where Next permits.
- `components/` should not import route-owned `app/`, Prisma, or DB helpers.
- `server/` and `lib/server/` may import DB and external SDKs.
- `scripts/` should avoid importing route-owned `app/(dashboard)/...` modules. The current repo-map has six baseline warnings here.
- Reusable taxonomy/domain transforms should move toward `lib/acc/`, `lib/domain/`, or `lib/shared/`.

## Error Handling

**Patterns:**
- tRPC authorization uses `TRPCError` in `server/trpc.ts`.
- DB config fails fast in `server/db.ts` if no database URL is present.
- Scripts and UAT gate wrappers throw or exit with explicit command output.
- Tests wrap shell failures with captured stdout/stderr when the failure context matters.

**When to Throw:**
- Missing required runtime configuration.
- Unauthorized/forbidden procedure access.
- Failed engineering gates or failed external command execution.
- Invariant failures in pure transforms.

**When to Return Structured Results:**
- Domain transforms that classify or aggregate data should return typed objects.
- Expected partial coverage, unknown categories, or unmapped actions should generally return explicit buckets rather than throwing.

## Logging

**Framework:**
- No centralized logging framework was detected.
- Server/scripts primarily use console output.
- `next.config.ts` removes `console.log` in production and preserves `console.error`/`console.warn`.

**Patterns:**
- Use `console.warn` for known recoverable data-quality issues.
- Use `console.error` for operational failures.
- Avoid adding production `console.log`; ast-grep currently reports 123 `no-console-log` findings as a visible cleanup queue.

## Comments

**When to Comment:**
- Explain domain decisions, invariants, and test gates.
- Keep comments for non-obvious compatibility or performance workarounds.
- Good examples exist in `tests/e2e/uat-workshop.spec.ts`, `next.config.ts`, `server/db.ts`, and domain mapping modules.

**TODO Comments:**
- ast-grep currently reports 5 `unsafe-todo` findings.
- New TODOs should include enough context to be actionable and should not hide known blockers in source comments.

## Function Design

**Preferred:**
- Keep pure transforms small, exported, and unit-tested.
- Use guard clauses and explicit return objects for complex domain mapping.
- Put data-shaping helpers outside React components when the same logic feeds scripts, routers, or tests.

**Watch Outs:**
- Fresh repo-map reports 148 large `useEffect` matches. New side effects in large render modules should be treated carefully.
- Large access-analysis modules combine rendering, graph math, state, and data transforms; extract pure helpers before changing behavior.

## Module Design

**Exports:**
- Named exports are common for utilities, constants, routers, and testable helpers.
- React route/page files follow Next.js export conventions.
- Avoid broad barrel files if they blur server/client boundaries.

**Tests:**
- Collocate tests near source or use nearby `__tests__/` folders.
- Use pure helper extraction to make route-heavy logic easier to test with Vitest.

**Generated Artifacts:**
- Do not hand-edit `.tools/repo-map/*`, `.next*`, `playwright-report/`, or `test-results/`.
- Regenerate repo-map with `npm run repo-map:check`.

---

*Convention analysis: 2026-06-19*
*Update when formatting, linting, dependency-boundary, or module ownership rules change.*
