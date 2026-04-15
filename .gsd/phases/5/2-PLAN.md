---
phase: 5
plan: 2
wave: 1
---

# Plan 5.2: Permanent Static Tunnel URL

## Objective
Configure a static subdomain for the local tunnel and update the environment patcher to handle the tunnel URL. This provides a permanent public address for OAuth callbacks, eliminating the need to update portals when the local IP changes.

## Context
- .env
- package.json
- scripts/patch-env.js

## Tasks

<task type="auto" id="1">
  <name>Configure Static Subdomain</name>
  <files>package.json</files>
  <action>
    Update the "tunnel" script to use a unique, static subdomain.
    Subdomain: `lecg-bim-dashboard`
  </action>
  <verify>grep "lecg-bim-dashboard" package.json</verify>
  <done>package.json contains --subdomain lecg-bim-dashboard</done>
</task>

<task type="auto" id="2">
  <name>Update Patcher for Tunnel Support</name>
  <files>scripts/patch-env.js</files>
  <action>
    Modify patch-env.js to:
    1. Check for a `USE_TUNNEL` environment variable.
    2. If true, use `https://lecg-bim-dashboard.loca.lt` instead of the local IP for NEXTAUTH_URL and AUTH_URL.
  </action>
  <verify>node scripts/patch-env.js (with USE_TUNNEL=true mocks)</verify>
  <done>Patcher updates .env with the tunnel URL when requested</done>
</task>

## Success Criteria
- [ ] Running `npm run tunnel` provides the same URL every time.
- [ ] Setting `USE_TUNNEL=true` in `.env` or as a flag updates all callback URLs to the tunnel address.
