## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-28 — Milestone v1.0 ACC Users Graph started

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-28)

**Core value:** Project teams can monitor and act on ACC user access data — surfacing permission gaps, duplicated roles, and inconsistent access patterns.
**Current focus:** v1.0 ACC Users Graph — requirements and roadmap definition

## Accumulated Context

- Stack is stable post-Core-Dependency-Update (npm 11, tRPC 11, TypeScript 6, Vitest harness)
- APS SDK already integrated — ACC data fetch path exists
- Testing: Vitest for tRPC routes, Playwright for E2E
- Mocking Next.js server context in Vitest requires explicit NextAuth mocks (lesson from prior milestone)
- Feature modules live under `app/(dashboard)/` + `components/[feature]/`
