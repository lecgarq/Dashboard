# Project State

## Last Session Summary

Codebase mapping complete (Master Internal Phase - 2026-04-15).

- **Data Model Deep-Dive**: Documented the full Prisma schema relationship graph (Auth -> Project -> Modules).
- **Internal State Machines**: Mapped the explicit string-based status systems for Families, APS URNs, and Clash Tasks.
- **Onboarding Workflow**: Deep-dive into the `ApprovedEmail` and `PendingRequest` whitelist logic.
- **Service Clone Pattern**: Formally documented the duplication between the `Sim` and `Clash` modules.
- **Real-time Persistence**: Mapped the binary `yjsState` storage within the relational database.

## Current Session Summary

- **Master Internal Mapping (Dashboard Audit)**: Conducted the absolute highest-fidelity audit of the Dashboard's local folder.
- **Data Graph Mapping**: Formally documented the Prisma schema and internal state machines.
- **Auth Perimeter**: Detailed the custom onboarding and whitelist flow.
- **Operational Logic**: Traced the internal Project Singleton and tiered procedure protection logic.
