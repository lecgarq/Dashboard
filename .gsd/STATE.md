# Project State

## Last Session Summary

Codebase mapping complete (Master Phase - 2026-04-15).

- **Core Architecture**: Next.js 15, tRPC, React 19, Prisma (PostgreSQL).
- **Operational Philosophy**: Documented the "Context-Singleton" pattern and tiered procedure protection logic (`protected`, `editor`, `admin`).
- **Data Patterns**: Mapped internal `EventEmitter` usage for user-lifecycle events and "Single-Flight" caching for Google Directory APIs.
- **Analytics Engine**: Traced the cross-module KPI derivation logic for Capacity and Velocity metrics.
- **Collaborative Systems**: Documented Yjs + Tiptap real-time sync infrastructure and Yjs binary persistence patterns.
- **Ecosystem**: Unified the infrastructure matrix (ports/services) and dev-ops orchestration logic.

## Current Session Summary

- **Master Codebase Mapping (Philosophy Audit)**: Conducted the final, high-fidelity audit of the system's operational patterns and internal signaling.
- **Context Audit**: Formalized the auto-initializing project singleton pattern in the tRPC layer.
- **Permission Mapping**: Documented the tiered procedure isolation logic.
- **Optimized Caching**: Traced the deduplication and TTL-based caching strategy for external service integrations.
