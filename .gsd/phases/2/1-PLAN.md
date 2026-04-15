---
phase: 2
plan: 1
wave: 1
---

# Plan 2.1: Dead Dependency Purge

## Objective
Uninstall specific NPM dependencies discovered as entirely dormant during the Phase 1 scanner baselining, and patch specific false positive flags.

## Context
- .gsd/SPEC.md
- package.json
- knip.ts

## Tasks

<task type="auto">
  <name>Uninstall Dormant External Packages</name>
  <files>package.json</files>
  <action>
    - Execute `npm uninstall @google-cloud/storage @trpc/next effect`
  </action>
  <verify>npm list effect</verify>
  <done>The shell returns that the effect library is no longer found in the dependency tree.</done>
</task>

<task type="auto">
  <name>Patch False Positive Knip Dependencies</name>
  <files>knip.ts</files>
  <action>
    - Open `knip.ts`.
    - Inject `@auth/core` and `@auth/core/adapters` into the `ignoreDependencies` block.
    - These are falsely flagged due to implicit inner NextAuth usage and require suppression.
  </action>
  <verify>cat knip.ts</verify>
  <done>The new strings are present in the `ignoreDependencies` block within knip.ts.</done>
</task>

<task type="auto">
  <name>Confirm Dependency Integrity</name>
  <files>package.json</files>
  <action>
    - Run `npx knip --no-exit-code > temp.log` then grep the result to ensure "Unused dependencies" is completely absent from the log.
  </action>
  <verify>npx knip --no-exit-code</verify>
  <done>Knip natively computes successfully and no longer outputs the targeted unused dependencies.</done>
</task>

## Success Criteria
- [ ] Orphaned NPM dependencies safely discarded.
- [ ] No regression occurs during build phase.
