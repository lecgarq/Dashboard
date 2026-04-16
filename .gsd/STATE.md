# Project State

## Last Session Summary

Codebase mapping complete (Nuclear Deep Phase - 2026-04-15).

- **tRPC Router Tree**: Mapped all 13 routers with their procedure protection tiers and context injection.
- **Auth System**: Documented all 4 providers (Google, Google Chat, Autodesk, Credentials), admin alias merging, and real-time JWT role refresh.
- **Event Bus Architecture**: Catalogued all 4 singleton EventEmitter buses with 24 distinct event types.
- **Client Hooks**: Documented all 5 hooks including the full Web Audio notification synthesizer.
- **Integration Error Framework**: Mapped the 3-tier IntegrationError classification and Google API error traversal.
- **Structured Logger**: Documented the JSON logger with circular-reference protection.
- **Google Calendar**: Mapped the no-admin room discovery heuristic (subscribed + event-mined).
- **KPI Engine**: Traced the 17-query parallel aggregation with derived capacity and velocity metrics.
- **Route Map**: Full enumeration of 11 dashboard pages and 11 API route groups.
- **Environment Hierarchy**: Catalogued 30+ environment variables across 10 categories.
- **BIM Category Registry**: Documented the 114-category, 8-group Revit taxonomy.
- **Wiki System**: Mapped 6 default sections and project-isolated section key generation.

## Current Session Summary (2026-04-16)

- **Integrated Gmail Service**: Implemented a native floating mail client with real-time polling (60s), C-major audio synthesizer notifications, and a left-aligned sliding dashboard panel.
- **Wiki Real-Time Modernization**: Upgraded the media pipeline to support parallel ingestion (Promise.all) and optimistic UI rendering using local blob:URLs, reducing perceived latency by ~90% for multi-file pastes.
- **Mapping Extension**: Produced high-fidelity feature-specific documentation in the `.gsd/` directory for Wiki and Gmail subsystems, following the `/map` standard.
- **Media Stability Fix**: Resolved jitter and panning bottlenecks in the `MediaPreviewModal` by switching to `translate3d` hardware acceleration and touch-none orchestration.

## Super Deep Map Summary (2026-04-16 - Post-Deployment)

- **System Architecture Consolidation**: Synthesized dozens of disjointed `.gsd/implementationplan*.md` and `.gsd/technicaldebt*.md` files into a pristine, unified `ARCHITECTURE.md` and `STACK.md`.
- **LOD Pipeline Integration**: Mapped the newly active `lod-engine` inference architecture, PostgreSQL `pgvector` HNSW semantic embeddings, and the Google Drive asset proxy logic.
- **Deployment Resilience**: Validated Railway infrastructure routing overrides (`PORT` binding logic, NexAuth `middleware.ts` healthcheck intercepts bypass via explicit `PUBLIC_PATHS`).
- **Debt Clarity**: Filtered down the technical debt backlog to actionable items (Redis cache implementation, Webhook migration, TensorRT affinity, etc.) following the massive Spring cleaning sprint.
