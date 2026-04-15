# Project State

## Last Session Summary

Codebase mapping complete (Super Deep Phase - 2026-04-15).

- **Concurrency Patterns**: Documented the **Single-Flight** implementation using `Map<string, Promise<T>>` to deduplicate concurrent API calls in the Directory and Chat services.
- **Real-time SSE Lifecycle**: Mapped the server-sent events (SSE) lifecycle, including the `retry: 5000` headers, 20s heartbeats, 5s polling intervals, and 3-space sequential batching logic.
- **Metadata Extraction Heuristics**: Documented the "Cost Center" scraping logic that uses fuzzy key matching to extract un-mapped profile data from Google APIs.
- **Client-Side Invalidation Graph**: Detailed how the `useChatPulse` hook uses `trpc.useUtils().invalidate()` to trigger proactive UI refreshes based on SSE signals.
- **Auth Session Envelope**: Mapped the exact schema of the JWT and Session objects as extended in `types/next-auth.d.ts`.

## Current Session Summary

- **Super Deep Mapping (Technical Audit)**: Conducted the absolute highest-fidelity audit of the Dashboard's local folder core.
- **Concurrency & Caching Mapping**: Formally documented the low-level deduplication and TTL patterns.
- **SSE Stream Internals**: Detailed the polling and heartbeating logic for the Chat system.
- **Heuristic Discovery**: Documented the fuzzy-key matching used for profile scraping.
- **Auth Schema Finalization**: Documented the extended JWT and Session types.
