---
phase: 2
plan: 1
wave: 1
---

# Plan 2.1: tRPC Upgrade

## Objective
Update the core tRPC library to version 11.17.0 to leverage the latest performance improvements and bug fixes while ensuring type safety across the application.

## Context
- .gsd/ROADMAP.md
- package.json
- lib/core/trpc.ts
- server/trpc.ts

## Tasks

<task type="auto">
  <name>Update tRPC Packages</name>
  <files>
    <file>package.json</file>
  </files>
  <action>
    1. Run `npm install @trpc/client@11.17.0 @trpc/server@11.17.0 @trpc/react-query@11.17.0`.
    2. Verify that `package.json` reflects the new versions.
  </action>
  <verify>npm list @trpc/server</verify>
  <done>tRPC packages are at version 11.17.0.</done>
</task>

<task type="auto">
  <name>Resolve Type Errors and Compilation</name>
  <files>
    <file>lib/core/trpc.ts</file>
    <file>server/trpc.ts</file>
  </files>
  <action>
    1. Run `npx tsc --noEmit` to identify any breaking type changes introduced by the update.
    2. Fix any identified errors in the tRPC initialization or hook definitions.
    3. Ensure the development server can still start.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Application compiles without tRPC-related type errors.</done>
</task>

## Success Criteria
- [ ] tRPC version is 11.17.0.
- [ ] `npx tsc --noEmit` passes (or at least has no new tRPC errors).
- [ ] Development server starts successfully.
