# Super Deep Technical Debt - LECG Dashboard

> **Status:** Super Deep Mapping X10
> **Generated:** 2026-04-16

This artifact highlights structural shortcomings, unresolved performance bottlenecks, and inline `TODO / FIXME` directives sourced dynamically across the monorepo architecture. These items outline the required stabilization refactors.

## 1. Architectural Friction

### 1a. Cache Infrastructure (Redis vs Postgres)
Currently, intensive search derivations (e.g., K-Nearest-Neighbor lookups spanning `pgvector`) are cached locally within regular `PostgreSQL` relational clusters via `LodSearchCache` and `ApsProjectSearchCache`. 
**The Debt:** Because of how Prisma spins its connection pools, large concurrent caching operations saturate database query pipelines. Extracting cache structures natively to `Redis` (such as via Upstash) would decouple volatile computational results from persistent object durability, yielding roughly ~50ms of network TTFB savings per lookup.

### 1b. The `tRPC` Zod Type Duplication
Throughout `routers/`, input `z.object({})` definitions are completely severed from client-side component generation schemas.
**The Debt:** Instead of importing unified `models/schemas.ts`, front-end components often rewrite subset Zod validations inside the `useForm` hooks. This requires multiple points of mutation whenever an underlying model (e.g., `ClashTask` priority Enum) updates. 

### 1c. `middleware.ts` Execution Payload
Because NextAuth v5 executes within Vercel/Railway Edge runtimes, the inclusion of generic Node.js hashing dependencies forces `middleware` to decode JWTs independently.
**The Debt:** The middleware is currently acting as both a redirection layer and heavily mutating host requests via the massive `rewriteAuthRedirectLocation` parsing method to bypass proxy domains. Extracting the proxy re-write logic to an underlying unmetered HTTP-gateway proxy configuration (e.g. Nginx or Railway native custom configs) would shave off raw execution overhead.

## 2. LOD Python Engine Vulnerabilities

### GPU / Matrix Math Offloading
The Python inference micro-service (`services/lod-engine/server.py`) wrapping the `SiglipModel` natively processes array dot products via CPU `torch` vectors.
**The Debt:** We have not explicitly forced `CUDA` affinity nor transitioned execution to TensorRT `FP16` layers. Given enough mass-requests, vector embedding will throttle wildly.

## 3. Inline `TODO` Directives Extracted

Following are the directly extracted annotations embedded in the active application layer files detailing immediate implementation requirements:

- `[TODO]` **in `app/(dashboard)/tasks/page.tsx`:**
  - The UI currently triggers aggressive optimistic renders without properly wrapping server failures. The components lack a `<PanelErrorBoundary>` isolation state causing bad RPC disconnections to white-screen the Kanban board structure.

- `[TODO]` **in `app/(dashboard)/families/page.tsx`:**
  - The parametric families table executes `findMany` fetching massive attachment URLs synchronously rendering them entirely in the Virtual DOM pipeline ahead-of-time. Needs pagination and dynamic intersection-observer fetching (e.g. `useInfiniteQuery`) so memory consumption remains flat relative to row growth.

- `[FIXME]` **in `server/routers/families.ts` & `tasks.ts`:**
  - `tasks.ts` explicitly creates orphaned attachments inside the `taskAttachment` relation. When `ctx.db.userTask.delete()` natively cascades, it destroys the `taskAttachment` DB record, **but** crucially misses cleaning up the `UploadThing` physical S3 payload. We must inject a cleanup listener deleting the `.url` key.

## 4. Documentation Drift

- The `ARCHITECTURE.pdf` artifact sitting inside the `.gsd` repository is currently completely out of sync with the new Next 15 `App Router` migration, continuing to incorrectly reference deprecated Flask iframes. *(Action: Discard the old `.pdf` and point the developers directly back to `ARCHITECTURE.md` as the unified source of truth.)*

---

## ✅ Completed — Session 2026-04-16 (Debt Pass)

> Verified with `npx tsc --noEmit` → 0 errors after all changes.

| Item | What was done |
| --- | --- |
| **`lib/` folder reorganization** | Moved 8 remaining flat files into subdirectories: `ai.ts`, `aps.ts` → `lib/server/integrations/`; `email.ts` → `lib/server/`; `chunk-load-error.ts` → `lib/core/`; `categories.ts`, `holidays.ts` → `lib/shared/`; `particle-zones.tsx`, `sound-engine.ts` → `lib/client/`. Created `lib/server/integrations/`, `lib/shared/`, `lib/client/` directories. Updated all 14 import sites + 6 dynamic imports in `server/routers/families.ts`. |
| **Suspense for `LodStatsBar`** | Switched `trpc.lod.getStats.useQuery()` to `useSuspenseQuery()` in `components/lod/LodStatsBar.tsx` (removed `if (!data) return null`). Wrapped the component in `<Suspense fallback={<skeleton />}>` in `app/(dashboard)/lod-checker/page.tsx`. |
| **Wiki Drive backup coverage** | Added non-blocking `backupWikiToDrive()` calls (with `.catch(logger.error)`) to `updateWikiStatus`, `deleteWikiSection`, and `reorderWikiSections` in both `server/routers/clash.ts` and `server/routers/sim.ts`. Previously only `upsertWikiSection` triggered Drive backup. |
| **Per-panel error boundaries** | `components/ui/panel-error-boundary.tsx` created; applied to `ChatPanel.tsx` and `FamilyDetailPanel.tsx` (confirmed in this session). |
| **WikiEditor console calls + link dialog** | All 6 raw `console.*` calls routed through `wikiLogger`; `window.prompt()` replaced with a Radix `Dialog` component (`WikiLinkDialog`) (confirmed completed in prior session). |

## ⬜ Remaining Open Items

| # | Item | Effort | Priority |
| --- | --- | --- | --- |
| 1 | Sim/Clash `BaseModule` abstraction — ~2,000 lines of duplicated router/page/event code | 2–3 days | HIGH |
| 2 | Decompose 8 oversized components (ChatPanel 49KB, CardDialog 41KB, etc.) | 2–3 days | MEDIUM |
| 3 | Add `tasks/page.tsx` `PanelErrorBoundary` isolation | 1h | MEDIUM |
| 4 | Families table: `useInfiniteQuery` + intersection observer pagination | 4h | MEDIUM |
| 5 | Yjs WebSocket authentication (accept only valid session tokens) | 1 day | HIGH (security) |
| 6 | Wiki dual-persistence reconciliation (HTML vs Yjs binary) | 1 day | HIGH |
| 7 | Remove `RESEND_*` + `NEXTAUTH_*` duplicate env vars from Railway panel | 10 min | LOW (user action) |
| 8 | Redis/Upstash for LOD + APS search caches (replace `LodSearchCache` DB table) | 4h | LOW |
| 9 | LOD Python engine: force CUDA affinity / TensorRT FP16 | 2h | LOW |
| 10 | `taskAttachment` S3 cleanup on cascade delete | 1h | MEDIUM |
