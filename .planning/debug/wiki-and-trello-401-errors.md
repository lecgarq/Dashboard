---
status: fixing
trigger: "wiki and trello 401 errors"
created: 2026-04-20T00:00:00Z
updated: 2026-04-20T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED - middleware.ts was deleted in commit 04e348d, causing unauthenticated users to bypass login redirect and hit protected API routes
test: restore middleware.ts from git history (commit 1afa1d2)
expecting: unauthenticated users will be redirected to /login; authenticated users will load wiki and trello normally
next_action: commit middleware.ts restoration

## Symptoms

expected: Wiki and Trello features load normally with authenticated requests
actual: Multiple 401 Unauthorized errors appear for both wiki and Trello
errors: HTTP 401 Unauthorized
reproduction: Open the app, navigate to wiki or Trello section
started: Commit 04e348d (docs: fix markdown errors) accidentally deleted middleware.ts

## Eliminated

- hypothesis: Trello env vars missing or wrong
  evidence: Trello uses per-user OAuth tokens stored in db.account, not env vars (except TRELLO_API_KEY). The 401 is "trello_access_required" - a business logic error for users without connected Trello accounts. Not the root cause of widespread 401s.
  timestamp: 2026-04-20T00:01:00Z

- hypothesis: WikiEditor XHR changes broke auth headers
  evidence: XHR to /api/wiki-media includes cookies automatically (same-origin). The collab token 401 comes from /api/wiki-collab-token checking auth() returning null session - because the user is not logged in.
  timestamp: 2026-04-20T00:01:00Z

- hypothesis: Session/JWT corruption from recent commits
  evidence: auth() in server/trpc.ts and API routes reads JWT directly from cookies. This works without middleware for LOGGED IN users. The issue is unauthenticated users reaching protected pages.
  timestamp: 2026-04-20T00:01:00Z

## Evidence

- timestamp: 2026-04-20T00:00:30Z
  checked: git log --all -- middleware.ts
  found: middleware.ts was deleted in commit 04e348d ("docs: fix markdown errors caused by invalid thick-arrow length in mermaid"). The deletion was alongside .gsd/ARCHITECTURE.pdf - clearly accidental.
  implication: No middleware = no edge-level auth protection. Unauthenticated users reach all pages.

- timestamp: 2026-04-20T00:00:45Z
  checked: app/api/wiki-collab-token/route.ts
  found: Route calls auth() and returns 401 if session?.user?.id is null. This is the wiki 401 source.
  implication: Without middleware redirecting to /login, unauthenticated users hit this and get 401.

- timestamp: 2026-04-20T00:00:50Z
  checked: server/routers/trello.ts and server/trpc.ts
  found: protectedProcedure throws UNAUTHORIZED if ctx.session?.user is falsy. tRPC maps UNAUTHORIZED to HTTP 401. Also, getUserTrelloToken() throws UNAUTHORIZED with "trello_access_required" if no trello account is linked - this is the Trello-specific 401.
  implication: Both 401 types are caused by missing middleware - unauthenticated users hit protectedProcedure.

- timestamp: 2026-04-20T00:01:00Z
  checked: auth.config.ts and the last good middleware.ts (commit 1afa1d2)
  found: The middleware.ts correctly passes /api/trpc, /api/wiki-collab-token, /api/wiki-media through (they do internal auth) while redirecting unauthenticated page visits to /login. It also enforces module-level access control via JWT token inspection.
  implication: Restoring this file exactly fixes the 401 cascade.

## Resolution

root_cause: middleware.ts was accidentally deleted in commit 04e348d ("docs: fix markdown errors caused by invalid thick-arrow length in mermaid"). Without it, Next.js has no edge-level auth guard, so unauthenticated users reach all protected pages and then receive 401s from the tRPC protectedProcedure and the wiki-collab-token route.
fix: Restored middleware.ts from commit 1afa1d2 (the last known-good version with /api/health in PUBLIC_PATHS).
verification: awaiting Railway deploy + human confirmation
files_changed:
  - middleware.ts (restored from git history)
