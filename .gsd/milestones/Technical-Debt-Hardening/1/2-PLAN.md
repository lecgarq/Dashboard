---
phase: 1
plan: 2
wave: 2
---

# Plan 1.2: Backend Type Alignment

## Objective
Ensure the backend (tRPC and Prisma) is fully aligned with the centralized family phase metadata. This prevents runtime errors and ensures that any future changes to phases only need to be made in one place.

## Context
- .gsd/SPEC.md
- lib/shared/module-schemas.ts
- lib/trpc/routers/families.ts (inferred path)
- prisma/schema.prisma

## Tasks

<task type="auto">
  <name>Verify tRPC Router Alignment</name>
  <files>
    <file>lib/trpc/routers/families.ts</file>
  </files>
  <action>
    1. Check `lib/trpc/routers/families.ts` (or equivalent) to see how phases are handled in `updatePhase` or `create` procedures.
    2. Ensure they use `familyPhaseSchema` from `module-schemas.ts` for input validation.
    3. Verify that the order logic (if any) uses the metadata to determine valid transitions or defaults.
  </action>
  <verify>Check for type errors in the families router.</verify>
  <done>tRPC families router is type-aligned with shared schemas.</done>
</task>

<task type="auto">
  <name>Database Type Consistency Check</name>
  <files>
    <file>prisma/schema.prisma</file>
  </files>
  <action>
    1. Verify that the `Family` model's `phase` field is correctly commented or constrained if possible (Prisma doesn't support enums for some providers, but we should ensure the comment reflects the reality).
    2. Ensure `phaseOrder` defaults are consistent with our new metadata.
  </action>
  <verify>Run `npx prisma validate`.</verify>
  <done>Prisma schema is consistent with the application's phase logic.</done>
</task>

## Success Criteria
- [ ] tRPC validation uses `familyPhaseSchema`.
- [ ] Prisma schema comments reflect current phase options.
- [ ] No type mismatches between frontend and backend regarding Family phases.
