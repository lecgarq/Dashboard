---
phase: 4
plan: fix-schema-consolidation
wave: 1
gap_closure: true
---

# Fix: Schema Consolidation

## Problem
`FamilyPhase` and `familyPhaseSchema` are defined in `lib/shared/module-schemas.ts` by importing `FAMILY_PHASES` from `family-config.ts`. This creates unnecessary indirection and fragmentation of core configuration.

## Root Cause
Iterative refactoring left these pieces split across two files.

## Tasks

<task type="auto">
  <name>Consolidate Schemas in family-config.ts</name>
  <files>
    <file>lib/shared/family-config.ts</file>
  </files>
  <action>
    1. Import `z` from `zod`.
    2. Move `familyPhaseSchema` definition from `module-schemas.ts` to `family-config.ts`.
    3. Ensure `FamilyPhase` is exported from `family-config.ts`.
  </action>
  <verify>Check exports in lib/shared/family-config.ts</verify>
  <done>Schemas are centralized.</done>
</task>

<task type="auto">
  <name>Update References</name>
  <files>
    <file>lib/shared/module-schemas.ts</file>
    <file>app/(dashboard)/families/page.tsx</file>
    <file>components/families/KanbanBoard.tsx</file>
    <file>server/routers/families.ts</file>
  </files>
  <action>
    1. Update all imports to point to `family-config.ts` for `FamilyPhase` and `familyPhaseSchema`.
    2. Remove the redundant definitions from `module-schemas.ts`.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Codebase is consistent and compiles.</done>
</task>

## Success Criteria
- [ ] No circular dependencies.
- [ ] Centralized source of truth for family phases.
