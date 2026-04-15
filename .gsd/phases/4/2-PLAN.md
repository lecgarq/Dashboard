---
phase: 4
plan: 2
wave: 2
---

# Plan 4.2: Libs & SDK Target Purge

## Objective
Extract standard library dead nodes unused by any routes in our backend system safely natively based on JSON metrics.

## Context
- .gsd/SPEC.md
- lib/categories.ts
- lib/wiki-utils.ts
- lib/aps.ts
- lib/holidays.ts

## Tasks

<task type="auto">
  <name>Purge Dead Lib Constants and SDK Wrappers</name>
  <files>lib/categories.ts, lib/wiki-utils.ts, lib/aps.ts, lib/holidays.ts</files>
  <action>
    - Open `lib/categories.ts` and extract the block mapping `FAMILY_CATEGORIES`.
    - Open `lib/wiki-utils.ts` and remove `stripProjectPrefix` completely.
    - Open `lib/aps.ts` and extract the un-reached `ensureBucketExists` logic string.
    - Open `lib/holidays.ts` and eliminate `MX_HOLIDAYS_2026` natively alongside its parent consumer `isNonWorkingDay`.
  </action>
  <verify>grep -q "stripProjectPrefix" lib/wiki-utils.ts || echo "Safe"</verify>
  <done>The four library files have cleanly eliminated static logic trees without touching sibling functions.</done>
</task>

## Success Criteria
- [ ] Unused mapping objects completely removed.
- [ ] No regression occurred in build validation checks.
