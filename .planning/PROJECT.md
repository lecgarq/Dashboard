# LECG Dashboard

## What This Is

LECG Dashboard is a multi-module enterprise platform for AEC (Architecture, Engineering, and Construction) management. It integrates project tracking, BIM data, Autodesk Construction Cloud (ACC) user access visualization, and collaborative tools into a unified Next.js interface used by project managers and BIM coordinators.

## Core Value

Project teams can monitor, analyze, and act on ACC user access data — surfacing permission gaps, duplicated roles, and inconsistent access patterns before they cause project delivery problems.

## Requirements

### Validated

- ✓ Families Kanban board with dynamic schema-driven status — Technical-Debt-Hardening
- ✓ Collaborative wiki with Hocuspocus/Yjs persistence — Technical-Debt-Hardening
- ✓ npm 11.11.1 + tRPC 11.17.0 + Vitest testing harness — Core-Dependency-Update
- ✓ LOD Checker module with Python/Flask image pipeline — Core-Dependency-Update

### Active

<!-- Current scope for v1.0 ACC Users Graph milestone -->

- [ ] User can view ACC project members as a WebGL graph using Cosmos.gl
- [ ] User can see relationships between users, roles, modules, and permissions
- [ ] User can apply live physics controls to explore the graph layout
- [ ] User can identify duplicated roles and inconsistent access patterns
- [ ] User can filter/highlight nodes by role, project, module, or admin status
- [ ] User can see selective labels without visual overload on large graphs

### Out of Scope

- Real-time ACC data sync (polling only for v1.0) — live webhooks add complexity
- Graph editing / permission management from the graph UI — read-only for v1.0
- LOD Checker graph integration — separate module, separate concern

## Context

- APS SDK (`@aps_sdk/*`) is already integrated — ACC user data can be fetched from Autodesk Construction Cloud via existing auth flows
- Platform stack is stable post-Core-Dependency-Update: Next.js 16 App Router, tRPC 11, Prisma, PostgreSQL, TypeScript 6, Tailwind 4
- Vitest integration testing harness is available for new tRPC routes
- Feature-based directory structure: new module goes under `app/(dashboard)/acc-users-graph/` and `components/acc-users-graph/`

## Constraints

- **Tech stack**: Must use Cosmos.gl (WebGL typed-array renderer) — no SVG-based alternatives
- **Architecture**: Must follow existing feature-based module pattern (tRPC router → Prisma → PostgreSQL)
- **Performance**: Graph must handle 500+ nodes without frame drops (typed-array processing is required)
- **Integration**: Must not break existing APS auth flows or introduce new backend services

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cosmos.gl over D3-force | WebGL required for 500+ node performance | — Pending |
| Feature-based module structure | Consistent with existing dashboard pattern | ✓ Good |
| Read-only graph for v1.0 | Reduces scope; permission management is a separate concern | — Pending |

---
*Last updated: 2026-04-28 — Milestone v1.0 ACC Users Graph started*
