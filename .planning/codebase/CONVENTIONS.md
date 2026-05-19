# Coding Conventions

**Analysis Date:** 2026-05-19

## Naming Patterns

**Files:**
- React components: PascalCase (e.g., `DashboardCalendar.tsx`, `HomeClient.tsx`)
- Hooks: kebab-case prefixed with `use-` (e.g., `use-debounce.ts`, `use-event-source.ts`)
- Utilities/services: camelCase (e.g., `csvExport.ts`, `accStatusReduction.ts`)
- Context providers: PascalCase with "Context" suffix (e.g., `AccessAnalysisContext.tsx`, `MosaicCoordinatorContext.tsx`)
- Type definition files: descriptive camelCase or PascalCase (e.g., `acc-types.ts`, `accessAnalysisTypes.ts`)

**Functions:**
- Public functions: camelCase (e.g., `downloadCsv`, `bucketActiveUserTier`, `buildFallbackAnalyticsState`)
- Helper/private functions: camelCase, often with prefixes like `get`, `build`, `map`, `merge`, `create`, `assert` (e.g., `getStoredView`, `buildGraphArrowTables`, `mergePeopleWithAccSummary`)
- Async functions: camelCase, no special prefix (e.g., `attribute`, `ingestActivityCsv`, `ingestAdminSnapshot`)

**Variables:**
- Local variables: camelCase (e.g., `debouncedValue`, `gcalRange`, `capturedBlob`)
- Constants: UPPER_SNAKE_CASE when global (e.g., `ACTIVE_TIERS`, `BLOB_AXIS_COUNT`)
- State setters: camelCase following React patterns (e.g., `setView`, `setCurrentDate`, `setOptimistic`)
- Query/hook results destructure lowercase with optional `Is`/`Has` prefix (e.g., `isLoading`, `data`, `error`)

**Types:**
- Interfaces: PascalCase, descriptive plural/singular as appropriate (e.g., `BulkAccUser`, `BulkAccProject`, `GCalEvent`, `CheckItem`)
- Type aliases: PascalCase (e.g., `ActiveTier`, `CalendarView`, `LogLevel`, `DataCoverageInput`)
- Union types: keep as readable type literals (e.g., `"7d" | "30d" | "90d" | ">90d" | "Never"`)
- Generic parameters: Single uppercase letter (e.g., `<T>`) or descriptive (e.g., `<M extends SomeInterface>`)

**Classes/Objects:**
- Database/Prisma models: PascalCase (e.g., `BulkAccUser` as interface)
- Error types: PascalCase with "Error" suffix (e.g., `AnomalyError`)

## Code Style

**Formatting:**
- No Prettier config detected — formatting is implicit through Next.js defaults
- No strict ESLint rules enforced; see `eslint.config.mjs` for ignore list (minimal configuration)
- Indentation: 2 spaces (inferred from codebase)
- Line length: No hard limit enforced; pragmatic wrapping around 100–120 characters observed

**Linting:**
- ESLint configured minimally (`eslint.config.mjs` only ignores `.next/**`, `.local/**`, `node_modules/**`)
- No strict rule enforcement; development relies on IDE defaults
- Consider adding a `.eslintrc.js` with recommended rules if stricter linting is desired

## Import Organization

**Order:**
1. React and third-party libraries (`import React`, `import { useCallback } from "react"`, `import { format } from "date-fns"`)
2. Relative imports from `@/` (path alias) — sorted by module depth and category
   - Components: `@/components/...`
   - Hooks: `@/hooks/...`
   - Libraries: `@/lib/...`
   - Server: `@/server/...`
3. Type imports: placed inline with regular imports, using `import type` syntax

**Path Aliases:**
- `@/*` maps to project root per `tsconfig.json`
- Used throughout for absolute imports (e.g., `@/lib/core/trpc`, `@/components/ui/button`)
- Prefer `@/` over relative imports (`../../../`) to avoid brittle paths

**Example import pattern:**
```typescript
// Third-party first
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfMonth } from "date-fns";

// @/ path alias imports
import { trpc } from "@/lib/core/trpc";
import { Header } from "@/components/layout/Header";
import type { BulkAccUser } from "@/lib/acc/acc-types";
```

## Error Handling

**Patterns:**
- **Explicit Error Construction:** Use `throw new Error("descriptive message")` for runtime errors; include context (e.g., lengths, unexpected states)
  - Example: `throw new Error(\`packPositions: xy length ${xy.length} != 2 * ids.length ${ids.length}\`)`
  - Example: `throw new Error("DuckDB-Wasm analytics can only initialize in a browser runtime.")`
- **Try-Catch:**
  - Wrap async operations and operations that might throw (parsing, network calls)
  - Catch block naming: `catch (err)` or `catch (error)` depending on context
  - Log errors at catch point: typically with context like `logger.error("operation failed", { userId, error })`
- **Defensive Null Checks:** Functions handle `null | undefined` gracefully before operating on values
  - Example: `if (lastSignIn == null) return "Never";` (defensive against both null and undefined)
- **Async Error Propagation:**
  - Promise rejections bubble up; callers use `await expect(...).rejects.toThrow(...)` in tests
  - Routes and API handlers catch and serialize errors for JSON responses

**Custom Error Types:**
- Define custom error classes for domain-specific errors (e.g., `AnomalyError` in `dcAnomalyChecks.ts`)
- Extend `Error` class and include helpful context in the message

## Logging

**Framework:** No centralized logging framework; split between server-side and client-side approaches:

**Server-side logging** (`@/lib/server/logger.ts`):
- Use `createLogger(scope)` to instantiate a logger with a module/route name
- Methods: `.debug(message, meta?)`, `.info(message, meta?)`, `.warn(message, meta?)`, `.error(message, meta?)`
- Logs are JSON-structured with `{ ts, level, scope, message, meta }` fields
- Meta values are automatically serialized (Error → `{ name, message, stack }`, Circular references → `"[Circular]"`)
- Debug logs only emit in non-production

**Usage pattern:**
```typescript
import { createLogger } from "@/lib/server/logger";
const logger = createLogger("chat-upload-route");
logger.error("Attachment upload failed", { userId, error, size });
```

**Client-side logging:**
- Use `console.log`, `console.error` directly for client components or browser-only code
- Prefix with scope in brackets for clarity (e.g., `console.log("[02-05-DEBUG] cosmos-create: ...")`)
- Debug logs often tied to feature flags (e.g., `if (perfHudEnabled) console.log(...)`)

**When to Log:**
- Errors: Always log at catch point with context
- Warnings: Unexpected but recoverable states (e.g., circuit breaker open, retry exhausted)
- Info: Important state changes (e.g., upload complete, sync finished)
- Debug: Development-only tracing, tied to `process.env.NODE_ENV !== "production"`

## Comments

**When to Comment:**
- Complex algorithms: explain the "why" (e.g., RFC4180 escaping rationale in `csvExport.ts`)
- Edge cases: document pitfalls and defensive checks (e.g., "BulkAccUser.lastSignIn is `string | null | undefined`...")
- Browser environment guards: explain why needed (e.g., "Window guard so server-side import is no-op")
- Non-obvious data flow: explain intent for maintainers

**JSDoc/TSDoc:**
- Use JSDoc blocks for exported functions and interfaces with multi-line explanations
- Patterns observed:
  - Function documentation block above signature (e.g., in `activeUserTiers.ts`, `csvExport.ts`)
  - Field documentation as inline comments (e.g., in `acc-types.ts` interface fields)
  - Include examples where helpful (rare in this codebase, but valuable for complex patterns)
- Type annotations are preferred to JSDoc `@param` / `@return` tags for modern TS

**Example JSDoc pattern:**
```typescript
/**
 * Active-user tier bucketing — maps a `lastSignIn` ISO string (or null/undefined) to
 * one of 7d / 30d / 90d / >90d / Never.
 *
 * Pitfall 4: BulkAccUser.lastSignIn is `string | null | undefined`. Older cache rows
 * synced before Phase 2.5 are `undefined`; ACC reports "no activity" as `null`.
 * Both, plus malformed ISO strings, are bucketed as "Never" defensively.
 */
export function bucketActiveUserTier(
  lastSignIn: string | null | undefined,
  now: Date,
): ActiveTier { ... }
```

## Function Design

**Size:** Functions are concise, typically 5–50 lines; longer functions (200+ lines) exist for complex workflows (e.g., `ingestAdminSnapshot`, `downloadCsv`) but are broken into helper functions where possible

**Parameters:**
- Prefer positional parameters for functions with few arguments (< 3)
- Use object parameters for > 3 arguments or when arguments are optional (e.g., `{ FS: ",", RS: "\n" }` in XLSX calls)
- Type parameters explicitly on signature (e.g., `export function useDebounce<T>(value: T, delay?: number): T`)
- Optional parameters use `?` in signature or default values

**Return Values:**
- Functions declare return type explicitly (e.g., `: ActiveTier`, `: Promise<void>`, `: T`)
- Void when side-effects only (e.g., `downloadCsv` returns `void`)
- Use union types for multiple return paths (e.g., `ActiveTier` as one of 5 literal types)
- Async functions always return `Promise<T>`; use `Promise<void>` for side-effect-only async operations

**Pattern for Result Handling:**
```typescript
// Destructure tRPC results with optional chaining and fallbacks
const { data: checkItems = [], isLoading } = trpc.trello.getMyCheckItems.useQuery(undefined, {
  staleTime: 15_000,
});
```

## Module Design

**Exports:**
- Named exports for utilities and helper functions (e.g., `export function downloadCsv(...)`, `export const ACTIVE_TIERS = [...]`)
- Default exports for single-purpose modules (rare; usually prefer named)
- Type exports use `export type` for TypeScript (e.g., `export type ActiveTier = ...`)

**Barrel Files:**
- Not used consistently; modules import directly from their source files (e.g., `@/lib/acc/activeUserTiers` rather than `@/lib/acc`)
- Component directories sometimes use index files for grouping sub-components

**Testing Module Pattern:**
- Test files co-located with source in same directory (e.g., `activeUserTiers.ts` + `activeUserTiers.test.ts`)
- Vitest configuration in `vitest.config.ts` + setup in `vitest.setup.ts`

---

*Convention analysis: 2026-05-19*
