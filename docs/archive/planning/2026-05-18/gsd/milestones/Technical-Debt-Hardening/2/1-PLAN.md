---
phase: 2
plan: 1
wave: 1
---

# Plan 2.1: Robust Stack Orchestration

## Objective
Refactor `run_dev_stack.py` to move from a "fire-and-forget" model to a "managed-service" model. This ensures that critical background services (Yjs server, LOD engine, query encoder) are monitored for health and automatically restarted if they crash.

## Context
- .gsd/SPEC.md
- scripts/run_dev_stack.py

## Tasks

<task type="auto">
  <name>Implement Service Manager in run_dev_stack.py</name>
  <files>
    <file>scripts/run_dev_stack.py</file>
  </files>
  <action>
    1. Introduce a `ManagedService` class that encapsulates `subprocess.Popen` logic.
    2. Add `check_health()` method to `ManagedService` that validates if the process is still running and (optionally) if its port is open.
    3. Implement a `restart()` method to kill and respawn the service.
    4. Refactor `run_yjs_server`, `run_lod_checker`, and `run_lod_query_encoder` to use this new class.
  </action>
  <verify>Check that the new `ManagedService` class is present in the script and used by background services.</verify>
  <done>Script uses a structured class for background service management.</done>
</task>

<task type="auto">
  <name>Implement Monitoring Loop and Auto-Restart</name>
  <files>
    <file>scripts/run_dev_stack.py</file>
  </files>
  <action>
    1. Modify the `main()` function to include a monitoring loop that runs while the Dashboard (Next.js) is active.
    2. In the loop, iterate through all `ManagedService` instances and call `check_health()`.
    3. If a service is found to be dead, trigger a `restart()`.
    4. Improve logging to clearly show when a service is being restarted.
  </action>
  <verify>Run the script, kill a background process (e.g., the Yjs server), and observe if it restarts automatically.</verify>
  <done>Stack automatically recovers from background service failures.</done>
</task>

## Success Criteria
- [ ] `run_dev_stack.py` manages background services via a class-based architecture.
- [ ] Background services (Yjs, LOD, Encoder) are automatically restarted if they crash.
- [ ] Improved logging indicates service health and restart events.
