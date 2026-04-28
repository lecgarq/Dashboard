# SPEC.md — Technical Debt Hardening

> **Status**: `FINALIZED`

## Vision
Harden the LECG Dashboard infrastructure by resolving critical technical debt in the Families module, synchronizing the Node/Python stack, and ensuring data consistency between collaborative and persistent layers.

## Goals
1. **Hardened Families Module**: Replace hardcoded status logic in `FamilyCard.tsx`, `KanbanBoard.tsx`, and `FamilyDetailPanel.tsx` with a dynamic system based on shared schemas.
2. **Unified Stack Orchestration**: Improve `run_dev_stack.py` to handle service life-cycles more reliably (restart, health-checks).
3. **Robust Data Sync**: Implement a reliable persistence bridge between Hocuspocus (Yjs) and Prisma (PostgreSQL).

## Non-Goals
- Adding new UI features to the Families module.
- Refactoring the entire LOD Engine (Python) codebase.

## Success Criteria
- [ ] Families Kanban board reflects DB state without hardcoded status arrays in UI components.
- [ ] `npm run dev` starts all services and auto-restarts on failure.
- [ ] Wiki edits in Hocuspocus are reliably persisted to the PostgreSQL `WikiSection` table.
