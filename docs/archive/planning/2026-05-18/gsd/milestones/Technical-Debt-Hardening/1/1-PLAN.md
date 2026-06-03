---
phase: 1
plan: 1
wave: 1
---

# Plan 1.1: Families Metadata Centralization

## Objective
Eliminate hardcoded status logic in the Families module by centralizing phase metadata (IDs, labels, colors) into a shared configuration file. This ensures consistency across the Kanban board, individual cards, and detail panels.

## Context
- .gsd/SPEC.md
- .gsd/ARCHITECTURE.md
- lib/shared/module-schemas.ts
- components/families/KanbanBoard.tsx
- components/families/FamilyCard.tsx
- components/families/FamilyDetailPanel.tsx

## Tasks

<task type="auto">
  <name>Centralize Family Phase Metadata</name>
  <files>
    <file>lib/shared/family-config.ts</file>
    <file>lib/shared/module-schemas.ts</file>
  </files>
  <action>
    1. Create `lib/shared/family-config.ts` and move the `PHASES` array from `KanbanBoard.tsx` into it as `FAMILY_PHASE_METADATA`.
    2. Define a `FamilyPhase` type based on the keys of this metadata.
    3. Update `lib/shared/module-schemas.ts` to import `FamilyPhase` and `familyPhaseSchema` (using Zod) from the new config if possible, or keep them synced.
    4. Ensure colors and labels are part of the metadata object.
  </action>
  <verify>Check that `lib/shared/family-config.ts` exists and exports `FAMILY_PHASE_METADATA`.</verify>
  <done>Metadata is centralized and type-safe.</done>
</task>

<task type="auto">
  <name>Refactor UI Components to use Shared Metadata</name>
  <files>
    <file>components/families/KanbanBoard.tsx</file>
    <file>components/families/FamilyCard.tsx</file>
    <file>components/families/FamilyDetailPanel.tsx</file>
  </files>
  <action>
    1. Replace local `PHASES` constant in `KanbanBoard.tsx` with import from `family-config.ts`.
    2. Update `FamilyCard.tsx` to use the shared metadata for rendering labels and badges.
    3. Update `FamilyDetailPanel.tsx` to use the shared metadata for the phase selection dropdown.
    4. Remove any hardcoded "TODO", "IN_PROGRESS", etc. strings used for styling.
  </action>
  <verify>Run `npm run lint` or check for compilation errors in these components.</verify>
  <done>All Families UI components use centralized metadata for phase-related logic.</done>
</task>

## Success Criteria
- [ ] No hardcoded phase arrays in `KanbanBoard.tsx` or `FamilyDetailPanel.tsx`.
- [ ] Centralized `FAMILY_PHASE_METADATA` in `lib/shared/family-config.ts`.
- [ ] UI remains functional and looks identical to the original implementation.
