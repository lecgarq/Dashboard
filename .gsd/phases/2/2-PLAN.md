---
phase: 2
plan: 2
wave: 2
---

# Plan 2.2: Production Stack Hardening

## Objective
Ensure that the production orchestration script (`start-production.cjs`) and environment are as robust as the dev stack. This includes adding health check logic that Railway can use and ensuring all required background services (like the LOD engine) are accounted for in the production entry point.

## Context
- .gsd/SPEC.md
- railway.toml
- scripts/start-production.cjs
- app/api/health/route.ts (inferred)

## Tasks

<task type="auto">
  <name>Enhance Production Health Probe</name>
  <files>
    <file>app/api/health/route.ts</file>
  </files>
  <action>
    1. Check if `app/api/health/route.ts` exists. Create it if not.
    2. Implement a thorough health check that verifies:
       - Database connectivity (Prisma `$queryRaw`).
       - (Optional) Connectivity to the Yjs server.
       - (Optional) Connectivity to the LOD engine.
    3. Return a 200 OK only if critical systems are reachable.
  </action>
  <verify>Curl the health endpoint and check for a successful response.</verify>
  <done>Production health probe provides a meaningful status check.</done>
</task>

<task type="auto">
  <name>Integrate LOD Engine in start-production.cjs</name>
  <files>
    <file>scripts/start-production.cjs</file>
  </files>
  <action>
    1. Update `start-production.cjs` to optionally spawn the LOD engine (Python) if the environment allows it.
    2. Ensure that if the LOD engine fails, the Dashboard continues to run but logs the failure clearly.
    3. Add basic life-cycle management (SIGTERM handling) for the Python process.
  </action>
  <verify>Run the production script locally and check if the LOD engine process is started.</verify>
  <done>Production entry point handles background service coordination.</done>
</task>

## Success Criteria
- [ ] Comprehensive health check endpoint at `/api/health`.
- [ ] `start-production.cjs` can coordinate the LOD engine.
- [ ] All services handle termination signals gracefully.
