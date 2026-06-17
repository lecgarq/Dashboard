# Coding Conventions

**Analysis Date:** 2026-06-17

## Naming Patterns

**Files:**
- Descriptive camelCase for data/logic files: `companyCounts.ts`, `accdsActivity.ts`, `activityByRolePieChart.tsx`
- Test files co-located in `__tests__/` directories or with `.test.ts`/`.spec.ts` suffix
- Routes use Next.js convention: `route.ts` in `app/api/[path]/`
- Components: PascalCase for React components: `AccessAnalysisCharts.tsx`, `RolesPieChart.tsx`
- Utility files: lowercase with hyphens for cross-cutting concerns: `create-logger.ts`, `split-windows.ts`

**Functions:**
- Named exports for public API: `export function summarizeCompanies(...)`
- camelCase for all function names: `fetchActivityWindow`, `collapseCompanySlices`, `labelFor`
- Private helpers: lowercase or underscore prefix for scope (e.g., `const labelFor = (...) => ...`)
- Server-side functions typically exported with descriptive intent: `crawlProjectActivity`, `writeLog`

**Variables:**
- camelCase for all local and module-level variables: `const counts = new Map()`, `let cbFailures = 0`
- Constants: SCREAMING_SNAKE_CASE when truly immutable across the app: `UNKNOWN_COMPANY`, `DEFAULT_TOP`, `MAX_SPACES_TO_POLL`
- Private module constants: lowercase if scoped: `const ACCDS_BASE = '...'` (used in one file)
- Map/Set names are plural or descriptive: `usersByCompany`, `lastSeenTime`, `colorByName`

**Types:**
- PascalCase for all types and interfaces: `CompanySummary`, `AccdsPage`, `NewMessageEvent`, `RoleActivitySummary`
- Type aliases: `type LogLevel = "debug" | "info" | "warn" | "error"`
- Import types explicitly with `import type` to avoid circular deps and signal type-only usage

**React Props:**
- Destructured in function signature with inline interface or separate `{prop: Type}[]` block
- Event handler callbacks: `on[Event]` pattern: `onUserClick`, `onRows`, `loadClashes`

## Code Style

**Formatting:**
- ESLint config at `eslint.config.mjs` (flat config, minimal rules)
- No enforced Prettier config detected; code follows implicit style
- Indentation: 2 spaces (visible in all samples)
- Line breaks: 80–100 character soft limit (long lines acceptable for readability, e.g., error messages)

**Linting:**
- ESLint v10 in use; config is minimal (ignores directories only, no other rules enforced)
- Type checking: TypeScript strict mode enabled (`strict: true` in `tsconfig.json`)
- `noImplicitAny: false` but all variables have explicit types in real code

**String Literals:**
- Template literals for multi-line strings and interpolation: `` `${ACCDS_BASE}/${...}` ``
- Single quotes for simple strings (observed in imports and constants)
- Backticks for complex expressions

**Const vs Let:**
- Prefer `const` throughout; `let` only for mutable loop counters or reassigned state (e.g., `let next = 0` in concurrent loops)
- `var` not used

## Import Organization

**Order:**
1. External packages: `import { describe, it, expect } from "vitest"`
2. External UI/React: `import { useMemo, useState } from "react"`
3. Internal type imports: `import type { RoleSlice } from "./roleCounts"`
4. Internal module imports: `import { summarizeCompanies } from "../companyCounts"`
5. Relative exports: `export function ...`

**Path Aliases:**
- Root alias `@/*` maps to project root: `import { Button } from "@/components/ui/button"`
- Used consistently across the codebase for cleaner imports
- Relative imports `.` and `..` used within same directory/adjacent modules

**Type imports:**
- Marked explicitly with `import type` to signal type-only usage
- Prevents circular dependency hazards and clarifies intent

## Error Handling

**Patterns:**
- Direct `throw new Error(message)` for synchronous failures: `throw new Error(\`accds ${res.status} for project...\`)`
- Error messages include context (HTTP status, project ID, scope): makes debugging easier without stack unwinding
- `try-catch` blocks used for async operations with potential recovery: `await fetchActivityWindow` with retry loop
- Retry logic with exponential backoff: `Math.min(30_000, 1000 * 2 ** attempt)` (see `accdsActivity.ts`)
- Circuit breaker pattern for stateful failures: open/half-open/closed states (see `/api/chat/stream/route.ts`)
- Error categorization: distinguish between retryable (429, 5xx) and fatal (403, 404) errors
- Failed promise chains in fire-and-forget contexts: `void poll()` with internal error handling

**Type Guards:**
- `instanceof Error` checks for error type before accessing `.message` or `.stack`
- Check for string inclusions to classify errors: `msg.includes("timeout exceeded")` for DB pool detection

## Logging

**Framework:** Structured logging via `createLogger(scope)` factory
- Located in `lib/server/logger.ts`
- Not used in client-side code (server-only module)

**Patterns:**
- Create a logger once per route/service: `const logger = createLogger("chat-stream-route")`
- Emit structured data: `logger.info("message", { userId, spaceName, ...context })`
- Log levels: `debug`, `info`, `warn`, `error`
- Debug logs omitted in production (`NODE_ENV !== "production"`)
- Error objects serialized with `.message`, `.stack`, and `.code` fields for debugging
- Circular references detected and replaced with `"[Circular]"` to prevent serialization failures

**Usage:**
- Debug for internal flow tracing: `logger.debug("New message detected in polled space", {...})`
- Warn for recoverable failures: `logger.warn("Chat stream poll failed", { userId, error })`
- Error for fatal conditions: `logger.error(...)`
- Meta object accepts any JSON-serializable value; undefined values are stripped

## Comments

**When to Comment:**
- Inline comments explain *why* not *what*: `// accds filter[created_at]=a..b may be inclusive on both ends`
- Reference external context (APIs, specs): `// Bucket for memberships with no resolvable company name`
- Explain non-obvious algorithm choices: `// windows must not overlap at the seam`
- Flag architecture decisions or constraints: `// the main throughput lever` for `pageConcurrency > 1`

**JSDoc/TSDoc:**
- Function-level JSDoc for public APIs with multi-line descriptions
- Field-level JSDoc (one-liner) for object properties: `/** Company -> membership count, desc; ... */`
- Omitted for simple functions or when type signatures are self-explanatory
- Pattern: `/** Multi-line description of behavior, including side effects, preconditions. */`

## Function Design

**Size:** Functions typically 10–50 lines; larger functions (100+) used for complex logic but broken into internal helpers
- Example: `fetchActivityWindow` is ~45 lines including retry loop
- Example: `mapLimit` is an internal helper ~25 lines for bounded concurrency

**Parameters:**
- Prefer object parameters for functions with >2 args: `fetchActivityWindow({getToken, projectId, ...})`
- Positional args for simple, obvious parameters: `summarizeCompanies(rows)`
- Readonly arrays for input data to signal immutability: `ReadonlyArray<T>`

**Return Values:**
- Single return object for multiple outputs: `{ slices, distinctCompanies, total, usersByCompany }`
- Void for side-effect-only functions (logging, DOM updates)
- Promise for async functions; no implicit Promise wrapping

**Utility Functions:**
- Exported at module level; rarely nested
- Named with intent-driven verbs: `summarize`, `collapse`, `filter`, `crawl`, `normalize`
- Pure functions preferred; side effects (logging, I/O) encapsulated in route/component handlers

## Module Design

**Exports:**
- One primary export per file or multiple related exports
- `export interface` for types consumed by other modules
- `export function` for public API; private helpers via `const` (not exported)
- No default exports in utility modules (using named exports enforces clarity)

**Barrel Files:**
- `components/index.ts` pattern observed for component re-exports (not verified as universal)
- Generally avoided for deep modules; explicit imports preferred

**File Organization:**
- Types and interfaces at top of file before implementation
- Public functions after types, in order of complexity/importance
- Private helpers (const functions) at bottom
- Example: `companyCounts.ts` exports `CompanySummary` interface, then `labelFor` helper, then public `summarizeCompanies` and `collapseCompanySlices`

---

*Convention analysis: 2026-06-17*
