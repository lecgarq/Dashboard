# Project Roadmap

## Phase 1: Codebase Mapping & Planning

**Status**: ✅ Complete

**Objective**: Analyze the existing dashboard codebase to identify technical debt, unused files, and redundant logic. Establish a baseline for cleanup.

---

## Phase 2: Dependency Purge

**Status**: ✅ Complete

**Objective**: Systematically remove unused production and development dependencies identified by the analyzer.

---

## Phase 3: Dead File Elimination

**Status**: ✅ Complete

**Objective**: Delete orphaned and unused files across directories and ensure application integrity.

---

## Phase 4: Inner-File Dead Code & Final Polish

**Status**: ✅ Complete

**Objective**: Remove unused internal exports, types, and functions from actively imported files. Perform final validation metrics and build.

---

## Phase 5: Environment Automation

**Status**: ✅ Complete

**Objective**: Automate `.env` synchronization with the local network IP and establish a stable tunnel URL for consistent authentication redirects.

---

## Phase 6: Quality & Accessibility Polish

**Status**: ✅ Complete (2026-04-16)

**Objective**: Resolve pervasive accessibility (A11y) warnings and clean up project documentation to meet strict Markdown linting standards.

---

## Phase 7: Comprehensive Architectural Deep-Dive

**Status**: ✅ Complete (Verified)

**Objective**: Super-extend the codebase mapping with deep analysis of every component, API endpoint, data model, and integration point to provide a "super full" architectural state.

---

## Phase 8: Deep Stack & Debt Matrix

**Status**: ✅ Complete

**Objective**: Continue the "10X Super Deep" analysis explicitly targeting the Technology Stack matrix and extracting all lingering Technical Debt blockages file-by-file.

**Depends on**: Phase 7

---

## Phase 9: Kanban Virtualization Refactor

**Status**: ✅ Complete (2026-04-16)

**Objective**: Refactor the Drag-and-Drop `FamilyDetailPanel` and `KanbanBoard` replacing array mapping loops with `@tanstack/react-virtual` preventing memory leaks when nodes scale past `n>200`.

**Depends on**: Phase 8

---

## Phase 10: UploadThing Orphan S3 Cleanup Hooks

**Status**: ✅ Complete (2026-04-16)

**Objective**: Intercept Prisma `UserTask` cascades executing asynchronous webhooks to trigger `utapi.deleteFiles` across legacy AWS endpoints wiping localized binary bloat.

**Depends on**: Phase 8

---

## Phase 11: Redis Vector Cache Abstraction

**Status**: ✅ Complete (2026-04-16)

**Objective**: Migrate `LodSearchCache` out of `PostgreSQL` natively into `@upstash/redis` environments offloading `pgvector` KNN calculation locks from relational connection pools.

**Note**: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` must be added to Railway env vars and local `.env` to activate the cache in production.

**Depends on**: Phase 8

---

## Phase 12: Suspense Boundary Granularity

**Status**: ✅ Complete (2026-04-16)

**Objective**: Decompose monolithic data fetching across analytical layouts resolving localized `<React.Suspense>` boundaries.

**Depends on**: Phase 8
