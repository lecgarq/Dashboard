---
phase: 5
plan: 1
wave: 1
---

# Plan 5.1: Zero-Admin Environment Automation

## Objective
Automate the synchronization of your `.env` file with your current local IP address and provide a stable, "locked" URL via a local tunnel. This removes the need to manually edit configuration files when your IP changes after a reboot, all without requiring Windows administrator privileges.

## Context
- .env
- package.json
- scripts/run_dev_stack.py

## Tasks

<task type="auto" id="1">
  <name>Create Auto-IP Patcher Script</name>
  <files>scripts/patch-env.js</files>
  <action>
    Create a Node.js script that:
    1. Detects the primary IPv4 address (ignoring 127.0.0.1 and 169.254.x.x).
    2. Reads the current `.env` file.
    3. Replaces `NEXTAUTH_URL` and `APS_CALLBACK_URL` base domains with the current IP + `.sslip.io`.
    4. Saves the updated `.env`.
  </action>
  <verify>node scripts/patch-env.js</verify>
  <done>.env contains the current correct IP address</done>
</task>

<task type="auto" id="2">
  <name>Update Package Scripts & Runner</name>
  <files>package.json, scripts/run_dev_stack.py</files>
  <action>
    1. In package.json, add a "tunnel" script: "npx localtunnel --port 3000".
    2. Modify "dev:next" to run "node scripts/patch-env.js && next dev ...".
    3. In run_dev_stack.py, add a call to the patcher script before service orchestration.
  </action>
  <verify>npm run dev:next</verify>
  <done>Running the dev command automatically updates the .env before starting the server</done>
</task>

## Success Criteria
- [ ] Starting the application automatically updates configuration to match the current IP.
- [ ] A stable public URL can be generated without Admin rights.
- [ ] Authentication redirects function correctly after an IP change.
