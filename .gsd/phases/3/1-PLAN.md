---
phase: 3
plan: 1
wave: 1
---

# Plan 3.1: Build and Run Verification

## Objective
Finalize the milestone by verifying that the application can be built for production and that the core tRPC API remains functional after the migration.

## Context
- .gsd/ROADMAP.md
- package.json
- scripts/run_dev_stack.py

## Tasks

<task type="auto">
  <name>Verify Production Build</name>
  <files></files>
  <action>
    1. Run `npm run build`.
    2. Ensure the Next.js build completes without errors.
  </action>
  <verify>npm run build</verify>
  <done>Production build is successful.</done>
</task>

<task type="auto">
  <name>Smoke Test tRPC API</name>
  <files></files>
  <action>
    1. Start the dev server in the background or use a script to verify tRPC responsiveness.
    2. Since a full browser test is heavy, I'll verify that the tRPC router types are correctly inferred by checking the generated `.next` types or running a small node script that imports the router.
    3. Alternatively, check that the health endpoint `/api/health` still returns 200.
  </action>
  <verify>curl -f http://localhost:3000/api/health</verify>
  <done>API is responsive and environment is stable.</done>
</task>

## Success Criteria
- [ ] `npm run build` passes.
- [ ] Health endpoint returns 200.
