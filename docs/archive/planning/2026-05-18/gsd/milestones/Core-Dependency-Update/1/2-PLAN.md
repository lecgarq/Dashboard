---
phase: 1
plan: 2
wave: 2
gap_closure: true
---

# Fix: Automated Sync Drift Monitoring

## Problem
Sync drift checking is currently a manual process using a CLI script. This leads to low observability of data integrity in production.

## Root Cause
Lack of background monitoring or health-dashboard integration.

## Tasks

<task type="auto">
  <name>Automate Drift Logging</name>
  <files>
    <file>scripts/yjs-server.mjs</file>
    <file>scripts/check-sync-drift.mjs</file>
  </files>
  <action>
    1. Update the Yjs server to periodically (e.g., every 30 minutes) run a subset of the drift check logic.
    2. Log critical drifts to a new database table SyncDriftLog or simply emit them as high-priority server logs that can be captured by Railway.
    3. Ensure the check is lightweight to not impact performance.
  </action>
  <verify>Check logs or DB for automated drift scan results.</verify>
  <done>Sync drift is monitored automatically without manual intervention.</done>
</task>
