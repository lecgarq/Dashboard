---
phase: 12-integration-health-observability
plan: "01"
subsystem: observability
tags: [accds, session-health, progress-monitor, crawler, vitest]

provides:
  - "getSessionHealth(sessionPath) helper + SESSION_WARN_HOURS=12 in lib/acc/accdsToken.ts"
  - "Crawler startup session preflight warning before long ACCDS runs"
  - "Always-on ACCDS session-health line in the localhost:4321 progress monitor"

key-files:
  modified:
    - lib/acc/accdsToken.ts
    - lib/acc/accdsToken.test.ts
    - scripts/accds-activity-ingest.cjs
    - scripts/progress-monitor.cjs

requirements-completed: [OBS-01]
completed: "2026-06-30"
status: complete
---

# Phase 12 Plan 01: OBS-01 Summary

ACCDS session expiry is now visible before a crawl fails and visible on the operator monitor.

## Accomplishments

- `getSessionHealth(sessionPath)` reads Playwright `storageState` locally, filters to `autodesk.com` cookies, computes healthy / expiring / expired / missing / unknown, and never returns cookie names or values.
- `SESSION_WARN_HOURS = 12` is exported and tested; the 12-hour boundary is pinned as healthy when exactly 12h remains.
- `scripts/accds-activity-ingest.cjs` supports `ACC_SESSION_PATH`, runs a startup preflight, and prints `[WARN] ACCDS session ...` before the crawl loop when the session is expiring, expired, missing, or unknown.
- `scripts/progress-monitor.cjs` supports `ACC_SESSION_PATH`, includes `session` in `/api/status`, and renders an always-on `ACCDS session:` line using the monitor's existing green/amber/red/muted classes.

## Commits

| Hash | Description |
|------|-------------|
| `dfe3af09` | test(12-01): failing getSessionHealth tests (TDD RED) |
| `c79d0158` | feat(12-01): implement getSessionHealth + SESSION_WARN_HOURS (TDD GREEN) |
| `ebbf1431` | feat(12-01): crawl-side session-expiry preflight WARN |
| `8602a461` | feat(12-01): always-on ACCDS session health line in :4321 monitor |

## Verification Evidence

| Gate | Command | Result |
|------|---------|--------|
| Session helper tests | `npx vitest run lib/acc/accdsToken.test.ts` | 13/13 PASS |
| Crawler syntax | `node --check scripts/accds-activity-ingest.cjs` | PASS |
| Monitor syntax | `node --check scripts/progress-monitor.cjs` | PASS |
| getSessionHealth grep | `grep -q "getSessionHealth" scripts/accds-activity-ingest.cjs` | PASS |
| ACC_SESSION_PATH grep | `grep -q "ACC_SESSION_PATH" scripts/accds-activity-ingest.cjs` | PASS |
| ACCDS session grep | `grep -q "ACCDS session" scripts/progress-monitor.cjs` | PASS |
| TypeScript | `npx tsc --noEmit` | PASS |
| Files scope | `git diff --name-only` | Exactly 4 plan files |
| Secret hygiene | `git check-ignore scratch/acc-session.json` | Gitignored (confirmed) |

## VERIFY Finding — Real session file cookie inspection

`scratch/acc-session.json` IS present (gitignored, read-only metadata only — name/expires, never values):
- 24 autodesk.com cookies; `admin.autodesk.sid` EXPIRED ~146h ago; `PF.PERSISTENT` ~550h; analytics cookies ~9430h
- MAX approach returns ~9430h (analytics) with `estimate=true` — honest but not auth-accurate
- **Future improvement:** detect `PF.PERSISTENT` on `.auth.autodesk.com` for `estimate=false` ~550h reading

## Deviations

1. **[Auto-adjust] Preflight before `loadCookieHeader` instead of after `createTokenProvider`** — linter reorganized `main()` to fire preflight before cookie loading; fires earlier than plan specified, equally valid, gives warning before any error can be thrown.
2. **[Auto-adjust] Linter reorganization of accdsToken.ts** — linter resolved duplicate declaration conflict by placing new exports cleanly after `createTokenProvider`; functionally equivalent.

## Notes

- The monitor is a standalone operator page on `:4321`, not a workshop Next.js route; no zinc theme, ECharts, WebGL, or workshop page code was touched.
- Expiry is labeled as an estimate because the helper uses the max positive expiry across Autodesk cookies rather than hardcoding a specific auth cookie name.
- `scratch/acc-session.json` remains gitignored and is never logged or rendered.

## Dashboard Self-Check

- **Context:** `12-01-PLAN.md`, `12-CONTEXT.md`, `lib/acc/accdsToken.ts`, `lib/acc/accdsToken.test.ts`, `scripts/accds-activity-ingest.cjs`, and `scripts/progress-monitor.cjs`.
- **Evidence:** Exact files and commands above; no invented routes, env vars, or data sources.
- **Constraints:** No workshop-page changes, no schema changes, no new WebGL/ECharts, no secret-bearing cookie values exposed.
- **Gates:** Targeted Vitest, script syntax checks, integration grep, and `npx tsc --noEmit`.
- **VERIFY:** Live `:4321` browser color check is still useful during Phase 12 verification, but the server payload and render wiring are present and typechecked.
