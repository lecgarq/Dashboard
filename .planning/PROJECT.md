# LECG Dashboard

## What This Is

LECG Dashboard is a multi-module enterprise platform for AEC (Architecture, Engineering, and Construction) management. It integrates project tracking, BIM data, Autodesk Construction Cloud (ACC) user access visualization and analysis, and collaborative tools into a unified Next.js interface used by project managers and BIM coordinators. As of v1.0 it ships a GPU-accelerated ACC user graph (25k-node interactive) and a single-page Access Analysis dashboard with junk/duplicate/outlier detection, drill-down, and CSV-per-widget exports.

## Core Value

Project teams can monitor, analyze, and act on ACC user access data — surfacing permission gaps, duplicated roles, and inconsistent access patterns before they cause project delivery problems.

## Requirements

### Validated

- ✓ Families Kanban board with dynamic schema-driven status — Technical-Debt-Hardening
- ✓ Collaborative wiki with Hocuspocus/Yjs persistence — Technical-Debt-Hardening
- ✓ npm 11.11.1 + tRPC 11.17.0 + Vitest testing harness — Core-Dependency-Update
- ✓ LOD Checker module with Python/Flask image pipeline — Core-Dependency-Update
- ✓ ACC project members visualized as a WebGL graph using Cosmos.gl — v1.0 (REND-01..04, 25,559-node hub interactive)
- ✓ Relationships between users, roles, modules, and permissions — v1.0 (4-color node typing + 3 edge weights)
- ✓ Live physics controls — v1.0 (Separation + Cluster sliders driving Cosmos `setConfigPartial`; feel-tuning deferred → TD-006)
- ✓ Identify duplicated roles and inconsistent access patterns — v1.0 (DASH-02 duplicate detection + DASH-03 outlier combinations + DASH-08 entitlement heatmap)
- ✓ Filter/highlight nodes by role, project, module, admin, date, companyRole — v1.0 (FILT-01..03, DATA-01)
- ✓ Selective labels without visual overload — v1.0 (UI-01 zoom-threshold labels with pow(zoom,0.2) clamped curve + pill backgrounds, UAT-approved 2026-05-08)
- ✓ ACC Access Analysis Dashboard (junk/duplicate/outlier detection, coverage, tiers, recommendations, drill-down, CSV) — v1.0 (DASH-01..13)
- ✓ Astonishing-graphics reskin replacing list/table widgets — v1.0 (Phase 4.1 INSERTED)

### Active

<!-- Cleared at v1.0 milestone close. Run /gsd:new-milestone to populate Active requirements for the next milestone. -->

(None — populated by `/gsd:new-milestone`.)

### Out of Scope

- Real-time ACC sync / webhooks — polling sufficient through v1.0; live webhooks add complexity and ACC write-scope risk
- Permission editing from graph UI — read-only architecture for v1.0; write operations require ACC Admin API write scopes + audit logging
- LOD Checker graph integration — separate module, separate concern
- Folder-level permission nodes — separate data model; multiplies node count unmanageably
- D3-force layout inside Cosmos.gl — defeats GPU simulation purpose
- @cosmograph/react wrapper — last published 7 months ago; plain useRef pattern is equivalent
- Animated edge particle effects — cosmetic only; static color/weight conveys the same information

## Context

- **Production deployment:** Live on Railway as of v1.0; deploy branch auto-deploys on push to origin (per user policy)
- **Tech stack:** Next.js 16 App Router, tRPC 11, Prisma, PostgreSQL, TypeScript 6, Tailwind 4, Vitest, Cosmos.gl 3.0.0-beta.8, ECharts, @xyflow/react, framer-motion, d3-hierarchy
- **APS SDK** (`@aps_sdk/*`) integrated; ACC user data fetched via existing auth flows (HQ v1 endpoints for `companyRole`, `lastSignIn`, `created_at`, `isAccountAdmin`)
- Feature-based directory structure under `app/(dashboard)/users/` (graph) and `app/(dashboard)/users/dashboard/` (Access Analysis dashboard)
- **Architecture pattern:** tRPC router → Prisma → PostgreSQL; bulk ACC sync materializes `accMemberCache` JSON
- **Renderer architecture:** Cosmos.gl GPU is the production path; Canvas2D fallback retained code-only (TD-007 cleanup pending)

## Constraints

- **Tech stack:** Cosmos.gl (WebGL typed-array renderer) — no SVG-based alternatives for the main graph
- **Architecture:** Feature-based module pattern (tRPC router → Prisma → PostgreSQL)
- **Performance:** Graph must handle 25k-node hubs interactively (achieved via Cosmos native GPU physics, Plan 02-05)
- **Integration:** Must not break existing APS auth flows or introduce new backend services

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cosmos.gl over D3-force | WebGL required for 500+ node performance; d3-force CPU caps ~2k nodes | ✓ Good — 25,559-node hub interactive (TD-005 closed) |
| Feature-based module structure | Consistent with existing dashboard pattern | ✓ Good |
| Read-only graph for v1.0 | Reduces scope; permission management is a separate concern | ✓ Good |
| Cosmos.gl v3 beta (3.0.0-beta.8) over v2.6.1 stable | Native GPU physics needed for 25k-node hub; v3 beta API documented | ✓ Good — three Cosmos API traps documented in 02-05-SUMMARY |
| Hide-on-filter (zero-size + edge-skip) over grey-out | User intent: filter EXCLUDES nodes from view, not de-emphasizes | ✓ Good (FILT-01 closed by Plan 02.5-05 runtime trace) |
| ANAL-01..04 → DASH-01..13 scope replacement | Dedicated dashboard delivers more value than graph-overlay flagging + PNG export | ✓ Good (Phase 4 UAT 16/16 approved) |
| Phase 4.1 INSERTED for graphics reskin | User feedback at Phase 4 close: list widgets visually inconsistent with cosmos.gl aesthetic | ✓ Good — reduced-motion compliant; tokenized severity; user approved-with-caveats |
| Defer REND-02 slider feel to TD-006 | Sliders wired and functional; qualitative UX tuning is non-blocking | — Pending (TD-006 open) |
| REND-04 Canvas2D fallback accepted code-only | Firefox is WebGL2-compatible; fallback unlikely to be exercised | — Pending (TD-007 logged for vestigial-branch removal) |
| Bubble cluster: deterministic two-pack over force-displacement | Stable layout + perf for severity bubbles | ✓ Good |
| FindingsContext + SelectionContext (Pattern 3 + Pattern 4) | Single source of truth for findings/selection across drill-down panel + widgets | ✓ Good |
| Drill-down panel as SIBLING of DndContext (not nested) | Drag-and-drop and panel content stay isolated; panel width sm:max-w-lg keeps grid visible at 1280px | ✓ Good |

---
*Last updated: 2026-05-08 after v1.0 milestone shipped*
