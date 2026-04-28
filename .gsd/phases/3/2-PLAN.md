---
phase: 3
plan: 2
wave: 2
---

# Plan 3.2: Verification and Orchestration Fix

## Objective
Finalize the hardening by fixing broken references in the production orchestration scripts and providing a way to verify data integrity across the binary and text fields.

## Context
- .gsd/SPEC.md
- scripts/start-router.cjs
- scripts/yjs-server.mjs

## Tasks

<task type="auto">
  <name>Fix Production Orchestration References</name>
  <files>
    <file>scripts/start-router.cjs</file>
  </files>
  <action>
    1. Update `scripts/start-router.cjs` to use the correct path and extension for the Yjs server (`yjs-server.mjs`).
    2. Since `yjs-server.mjs` is an ESM module, use dynamic `import()` or wrap the call appropriately in the CommonJS router.
    3. Verify that `SERVICE_TYPE=yjs` starts the server correctly.
  </action>
  <verify>Run `node scripts/start-router.cjs` with `SERVICE_TYPE=yjs` and check if the Hocuspocus server starts.</verify>
  <done>Production router correctly launches the Yjs server.</done>
</task>

<task type="auto">
  <name>Implement Sync Integrity Check</name>
  <files>
    <file>scripts/check-sync-drift.mjs</file>
  </files>
  <action>
    1. Create a utility script `scripts/check-sync-drift.mjs` that connects to Prisma.
    2. Iterate through all `ClashWiki` and `SimWiki` records.
    3. Report any records where `yjsState` exists but `content` is empty or significantly different (indicating a sync failure).
  </action>
  <verify>Run the script and check the output.</verify>
  <done>Utility exists to detect and report synchronization drift.</done>
</task>

## Success Criteria
- [ ] `scripts/start-router.cjs` is no longer broken.
- [ ] `scripts/check-sync-drift.mjs` provides visibility into data integrity.
