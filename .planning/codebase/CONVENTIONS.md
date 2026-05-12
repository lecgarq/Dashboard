# Coding Conventions

**Analysis Date:** 2026-05-12

## Naming Patterns

**Files:**
- camelCase for component files: `AccAnalysisPanel.tsx`, `cosmosUtils.ts`
- camelCase for utility/helper files: `nameSimilarity.ts`, `csvExport.ts`, `accGraphFilters.ts`
- Router files use kebab-case: `acc-activity.ts`, `acc-folders.ts`, `acc-graph.ts`
- Test files match source name with `.test.ts` or `.test.tsx` suffix: `nameSimilarity.test.ts`, `cosmosUtils.test.ts`
- Directory structure preserves camelCase: `lib/acc/`, `app/(dashboard)/users/`, `server/routers/`

**Functions:**
- camelCase for all function names: `findJunkRoles()`, `nameTokenOverlap()`, `buildClusterIdsFromNodes()`
- Private/internal functions use leading underscore discouraged; prefer named exports with module-level documentation
- Function parameters use camelCase: `affectedMembers`, `moduleOverlap`, `lastSignIn`
- Callback parameters follow handler pattern: `onSelectUser`, `onViewProfile`, `openSidePanel()`

**Variables:**
- camelCase for all variable names: `sidePanelEmail`, `cachedCount`, `compactionResult`
- Constants use UPPERCASE_SNAKE_CASE: `DUPLICATE_ROLE_NAME_THRESHOLD`, `CATEGORY_ENUM`, `SEVERITY_RANK`
- Type/interface variables still use camelCase unless they represent constants: `const CATEGORY_ENUM = z.enum(...)`
- Loop variables are single letter or descriptive camelCase: `for (const t of ta)`, `for (let s = 0; s <= 100; s += 10)`

**Types:**
- PascalCase for all type/interface names: `BulkAccUser`, `BulkAccProject`, `FilterableNode`, `RoleAggregate`
- Interface names start with capital letter (no `I` prefix): `JunkRoleFinding`, `DuplicateRoleFinding`
- Severity type: `type Severity = "HIGH" | "MEDIUM" | "LOW"` — string literal union types for enumerated values
- Generic type parameters: `T`, `K`, `V` for short, or descriptive: `ClusterableNode`
- Exported types are explicitly exported: `export interface`, `export type`

## Code Style

**Formatting:**
- No explicit Prettier config in root; ESLint is the primary tool
- Line length appears to honor ~100 character width based on code samples
- Semicolons are used at end of statements (standard TS)
- Indentation: 2 spaces (observed in vitest.config.ts, tsconfig.json)
- String literals use double quotes for JSDoc/comments, single quotes less common but not prohibited

**Linting:**
- Tool: ESLint v10.3.0 with eslint-config-next
- Config: `eslint.config.mjs` (flat config format)
- Ignores: `.next/`, `.local/`, `.npm-cache/`, `node_modules/`
- No additional custom rules visible; relies on Next.js preset

**Language Target:**
- TypeScript 6.0.3
- Compilation target: ES2017
- JSX: react-jsx (automatic runtime)
- Strict mode enabled: `strict: true`, but `noImplicitAny: false` (allows implicit `any` in some contexts)

## Import Organization

**Order:**
1. Type/interface imports from third-party libraries: `import type { SomeType } from "lib"`
2. Default/named imports from third-party packages: `import { describe, it, expect } from "vitest"`
3. Absolute imports from project root with `@/` alias: `import { BulkAccUser } from "@/lib/acc/acc-types"`
4. Relative imports: `import { SomeUtil } from "./someUtil"` (less common, avoided)
5. Type-only markers: `import type { ... } from "..."` used consistently

**Path Aliases:**
- `@/*` maps to project root (`./*` per tsconfig.json)
- All internal imports use `@/` prefix: `@/lib/`, `@/components/`, `@/server/`
- No other aliases configured

**Grouping:**
- Blank line separates third-party from project imports
- Re-exports for backwards compatibility done explicitly: `export type { BulkAccUser, BulkAccProject } from "@/lib/acc/acc-types"`

## Error Handling

**Patterns:**
- Custom `IntegrationError` class with structured fields: `status`, `code` (enum), `service`, `details?` — see `lib/server/integration-errors.ts`
- Try-catch blocks for error recovery: wrap ISO date parsing in try-catch, silently return fallback if parse fails
- Guard clauses for null/undefined: `if (lastSignIn == null) return true` (using `==` to check both null and undefined)
- Custom error predicates: `isMissingRoleEndpointError(error)` — use `instanceof` checks and property inspection
- Errors thrown explicitly only when state is unrecoverable: `throw new IntegrationError(...)`
- Server-side errors use tRPC error wrapper (setup but not widely shown in sampled files)

**Error Recovery:**
- Graceful degradation when parsing fails: `if (!isValid(parsed)) return true`
- Check for NaN: `if (Number.isNaN(days)) return true`
- Early returns from error conditions: `if (error instanceof IntegrationError) return error`
- No console.error calls observed; errors are structured and returned

## Logging

**Framework:** None explicitly configured; no winston/pino imports observed

**Patterns:**
- No structured logging visible in codebase
- JSDoc comments serve as documentation: `/** Cursor pagination uses (createdAt, id) as composite key... */`
- Algorithm explanations in comments: `// Sorted indices [0,1,2] → pairs (0,1) and (1,2)`
- Pitfall callouts in comments: `// Pitfall 5: Single-token names must NOT yield false-positive matches`

## Comments

**When to Comment:**
- JSDoc for public functions with parameter descriptions, return types, and usage examples
- Inline comments for complex mathematical logic: `expect(nameTokenOverlap("BIM Coordinator", "BIM Lead")).toBeCloseTo(1 / 3, 10);`
- Rationale comments explaining "why" not "what": `// "other" deliberately empty — it's the unmapped catch-all`
- Section dividers for test structure: `// ─────────────────────────────────────────────────────────────────────────────`
- Plan/phase references in comments: `Plan 04-03 Feature 1 (DASH-04 building block)`

**JSDoc/TSDoc:**
- Used consistently for exported functions and types
- Includes parameter descriptions: `@param email user email address`
- Return type in JSDoc when complex: `Returns: 1.0 when identical, 0.0 when disjoint`
- Example usage in JSDoc blocks: `tokenize("BIM Coordinator") → Set { "bim", "coordinator" }`
- Multi-line explanations for algorithm pitfalls

## Function Design

**Size:** Functions range from single-statement (e.g., `isMissingRoleEndpointError()`) to ~40 lines (e.g., `getFileActivityForUser`)

**Parameters:**
- Prefer objects for functions with multiple parameters: `.input(z.object({ email: z.string().email() }))`
- Tuple destructuring for well-known pairs: `const [v, u, e, d] = await Promise.all([...])`
- Zod schema for input validation: `z.object({ spacing: z.number(), clusterStrength: z.number() })`
- Default values in schema: `z.number().min(1).max(50).default(25)`

**Return Values:**
- Explicit return types on all exported functions: `export function tokenize(name: string): Set<string>`
- Return null for "not found" scenarios: `sidePanelUser ? users.find(...) ?? null : null`
- Wrapped responses in objects: `return { lastView, lastUpload, lastEdit, lastDelete }`
- Void functions for effects: `export function downloadCsv(...): void`

## Module Design

**Exports:**
- Named exports preferred: `export function findJunkRoles(...)`
- Single default export never observed
- Type exports explicit: `export type Severity = "HIGH" | "MEDIUM" | "LOW"`
- Interface exports explicit: `export interface DashboardFindings {...}`

**Barrel Files:**
- Exists at `lib/acc/` but not systematically used across all modules
- Backwards-compatibility re-exports: `export type { BulkAccUser, BulkAccProject } from "@/lib/acc/acc-types"`

**Module Organization:**
- Pure functions grouped by logical concern: `dashboardAnalytics.ts` has junk finder, duplicate finder, outlier finder, aggregation logic
- Type definitions co-located with exports: interfaces defined right before functions that use them
- Constants defined near the top: `const SEVERITY_RANK: Record<Severity, number> = ...`
- Helper functions as internal non-exported functions: `function isInactive90d(...)`, `function aggregateByRole(...)`

## Special Patterns

**Zod Usage:**
- Schema validation at tRPC procedure boundaries: `.input(z.object({...}))`
- Enum schemas for string unions: `const CATEGORY_ENUM = z.enum(["view", "upload", "edit", "delete"])`
- Composite schemas with optional fields: `.optional()`, `.default(25)`
- Used for both input validation and inference: `z.infer<typeof someSchema>`

**Type Guards:**
- Explicit predicates: `function isInactive90d(lastSignIn: ...): boolean`
- Instanceof checks: `if (error instanceof IntegrationError)`
- Property existence checks: `if (!a) { a = {...}; agg.set(...) }`
- Nullish coalescing: `sidebar?.user ?? null`

**Testing Fixtures:**
- Factory functions for test data: `function makeNode(overrides: Partial<FilterableNode> = {}): FilterableNode`
- Test mocks created inline: `const mockCtx = { session: {...}, db: {} as any, projectId: '...' }`
- Mock functions via vitest: `vi.fn()`, `vi.fn(async (...))`

---

*Convention analysis: 2026-05-12*
