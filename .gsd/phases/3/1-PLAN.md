---
phase: 3
plan: 1
wave: 1
---

# Plan 3.1: Dead Utility Scripts Cleanup

## Objective
Remove one-off debugging files and disconnected back-end scripts that possess no exports to the primary application logic.

## Context
- .gsd/SPEC.md
- dead-files.json

## Tasks

<task type="auto">
  <name>Delete Root Diagnostic Scripts</name>
  <files>check-all.js, debug-env.js, diagnose-sync.ts, fix-headers.js, force-sync.ts, full-sync.ts, test-sync.js, verify-blacklist.ts, verify-boolean-sync.ts, verify-pending-sync.ts</files>
  <action>
    - Execute `rm` natively via disk deletion for these root diagnostic files natively.
  </action>
  <verify>ls check-all.js 2>/dev/null || echo "Deleted"</verify>
  <done>Root directories no longer contain the diagnostic traces.</done>
</task>

<task type="auto">
  <name>Delete Tmp and Dormant Library Bridges</name>
  <files>tmp/check_user.js, tmp/whitelist_user.ts, lib/uploadthing.ts</files>
  <action>
    - Delete `check_user.js` and `whitelist_user.ts` from `/tmp`.
    - Delete `uploadthing.ts` from `/lib`, finalizing integration purge.
  </action>
  <verify>ls lib/uploadthing.ts 2>/dev/null || echo "Deleted"</verify>
  <done>Sub-directory isolated scripts deleted entirely.</done>
</task>

## Success Criteria
- [ ] Root workspace size decreased efficiently.
- [ ] Orphaned scripts eliminated.
