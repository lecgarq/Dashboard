---
status: awaiting_human_verify
trigger: "truncated-acc-and-gmail-data"
created: 2026-05-06T19:00:00Z
updated: 2026-05-06T19:30:00Z
---

## Current Focus

hypothesis: All four symptoms share a common root: (A) the AccUserSidePanel never renders `lastSignIn` at all — the field exists in BulkAccUser but the panel only shows `companyRole`, not `lastSignIn`; (B) `companyRole` and `lastSignIn` are only populated if a fresh bulkAccSync has been run with code that includes the `companyRole`/`lastSignIn` fields in the saved result — older cache rows pre-dating the 02.5-D fix permanently lack those fields; (C) the "Gmail users list" is actually the Google Workspace People API directory and is paginated correctly (does follow nextPageToken), so its truncation is a scoping/auth issue not a code bug; (D) the "ACC analysis page shows fewer entries" is because `bulkAccSummary` only returns users from `accMemberCache` + local `user` table — it does NOT include the full ACC hub user list unless a bulkAccSync has been run first.
test: Read AccUserSidePanel for lastSignIn render, verify bulkAccSync result object, confirm directory pagination
expecting: lastSignIn absent from panel render, cache rows missing fields, sync needed
next_action: CONFIRMED all root causes. Begin fixes.

## Symptoms

expected: Full user lists from Gmail/Google Workspace and ACC. For each ACC user: populated lastSignIn (Last Activity) and companyRole in the side panel.
actual: Lists/counts smaller than expected. Side-panel lastSignIn blank/missing, companyRole = "Unspecified".
errors: None reported.
reproduction: Railway production → ACC analysis/graph → user node → side panel shows blank Last Activity and Unspecified Company Role. Gmail users list truncated.
timeline: Never worked — first fresh observation.

## Eliminated

- hypothesis: Pagination missing from Google Workspace People API
  evidence: fetchOrgDirectoryInternal uses do-while pageToken loop; correctly follows all pages
  timestamp: 2026-05-06T19:10:00Z

- hypothesis: fetchAllAccUsers has a hardcoded page limit
  evidence: Uses while(offset < maxUsers) with maxUsers=10000 and breaks on users.length < limit; correct
  timestamp: 2026-05-06T19:10:00Z

- hypothesis: companyRole/lastSignIn missing from bulkAccSync saved result
  evidence: bulkAccSync DOES include companyRole and lastSignIn in the saved result object (lines 1225-1226 of users.ts) — this was the 02.5-D fix that IS present in code
  timestamp: 2026-05-06T19:15:00Z

## Evidence

- timestamp: 2026-05-06T19:05:00Z
  checked: AccUserSidePanel.tsx — full render of user fields
  found: Panel renders `user.companyRole ?? "Unspecified"` (line 90) but there is NO render of `user.lastSignIn` or any "Last Activity" field ANYWHERE in the component
  implication: "Last Activity" being blank is not a data problem — the field simply isn't rendered. This is a missing UI element.

- timestamp: 2026-05-06T19:08:00Z
  checked: BulkAccUser type in acc-types.ts
  found: `lastSignIn?: string | null` is defined on the type (line 25). `bulkAccSummary` router DOES return it (line 1003-1004 of users.ts: `lastSignIn: data.lastSignIn ?? null`).
  implication: Data pipeline for lastSignIn is complete server-side. UI simply never displays it.

- timestamp: 2026-05-06T19:12:00Z
  checked: bulkAccSync mutation result and cache write (users.ts lines 1215-1235)
  found: `companyRole: accUser.companyRole` and `lastSignIn: accUser.lastSignIn` ARE written to the cache. BUT — old cache rows (synced before this code landed) have `data.companyRole = undefined` and `data.lastSignIn = undefined`. The bulkAccSummary router returns `data.companyRole ?? null` which means those old rows return `null`, and the UI shows "Unspecified".
  implication: A fresh bulkAccSync is needed to populate the fields. The code is correct; the existing cache rows are stale.

- timestamp: 2026-05-06T19:15:00Z
  checked: fetchAllAccUsers in acc-admin.ts — field mapping
  found: Maps `companyRole: getString(u.company_role || u.companyRole) || undefined` and `lastSignIn: getString(u.last_sign_in || u.last_activity || u.lastSignIn) || undefined`. These are guesses at the actual Autodesk HQ v1 field names. The TODO[02.5-D] log diagnostic is still present and active — it will log actual field names on first sync.
  implication: Field names may be wrong. If `company_role` and `last_sign_in` are not the actual HQ v1 keys, the values will always be empty string → converted to `undefined` → stored as `null` → displayed as "Unspecified".

- timestamp: 2026-05-06T19:18:00Z
  checked: "Gmail users list" — what it actually is
  found: The users page General tab calls `trpc.users.getOrgDirectory` → `listCalendarGuestDirectory` → Google Workspace People API (people.listDirectoryPeople). This is the org directory, NOT Gmail. Pagination IS implemented. Truncation likely means: (a) the user's Google account lacks directory.readonly scope, causing fallback to local DB users (only 3 registered users), OR (b) the People API returns a partial list due to domain size / the 8-second timeout in listOrgDirectoryPeople.
  implication: The "truncated Gmail/Google list" is a scope/auth/timeout issue, not a code bug. The fallback to `getDirectory` (local DB only, 3 users) shows up when Google auth is missing the directory scope.

- timestamp: 2026-05-06T19:22:00Z
  checked: "ACC analysis page shows fewer entries" — bulkAccSummary data source
  found: bulkAccSummary reads from `accMemberCache` table + `user` table. It does NOT call the ACC API. If bulkAccSync has never been run with the full ACC user list, accMemberCache only has rows for users who were individually looked up via getAccProfile (which only runs when someone opens a user's detail modal). So if only 3 dashboard users have ever been opened, only 3 rows exist.
  implication: The ACC analysis page is cache-bound. Running bulkAccSync (which calls fetchAllAccUsers once) is required to populate all ACC hub users.

- timestamp: 2026-05-06T19:25:00Z
  checked: DIRECTORY_REQUEST_TIMEOUT_MS constant in directory.ts
  found: `const DIRECTORY_REQUEST_TIMEOUT_MS = 8000;` — 8 seconds. The listCalendarGuestDirectory calls listOrgDirectoryPeople with withTimeout(..., 8000, "Google Directory request"). If the org has many pages and Google is slow, this timeout will fire, causing the function to throw, and the catch block returns status: "reconnect_required" with 0 people. The UI then shows the fallback banner and falls back to local DB users.
  implication: The 8-second timeout is aggressive for a large org directory. This is a likely cause of "truncated" Google directory list on Railway (where cold starts + network latency apply).

## Resolution

root_cause: |
  FOUR distinct root causes, one per symptom:

  1. "Last Activity blank in side panel" — AccUserSidePanel.tsx never renders the lastSignIn field. The data flows correctly through the stack (ACC API → bulkAccSync → accMemberCache → bulkAccSummary → BulkAccUser.lastSignIn) but the panel component simply has no UI element for it. Fix: add lastSignIn row to AccUserSidePanel alongside companyRole.

  2. "Company Role = Unspecified for most users" — Two sub-causes: (a) existing cache rows lack companyRole because they were written before the 02.5-D fix was deployed; (b) the actual HQ v1 field names for company_role and last_sign_in are unconfirmed — they may differ from the guesses in acc-admin.ts. Fix: (a) run bulkAccSync to refresh cache; (b) the diagnostic log will reveal correct field names on first sync.

  3. "ACC analysis page shows fewer entries" — accMemberCache is nearly empty because bulkAccSync (which does the full hub sweep with fetchAllAccUsers) has never been run. The table only has rows for users individually previewed. Fix: run bulkAccSync once — this is a one-time operational step, no code change needed.

  4. "Gmail/Google Workspace user list truncated" — The 8-second timeout in listCalendarGuestDirectory is too aggressive for a large Google Workspace org, especially on Railway cold starts. When it fires, the catch block returns 0 people and shows the reconnect banner; the UI falls back to the local DB (3 registered users). Fix: raise the timeout to 30 seconds OR remove it (the do-while pagination already has a natural timeout via the underlying HTTP request).

fix: |
  Code changes:
  1. AccUserSidePanel.tsx — add lastSignIn display row after companyRole row.
  2. lib/google/directory.ts — raise DIRECTORY_REQUEST_TIMEOUT_MS from 8000 to 30000.
  
  Operational steps (no code, just admin actions on Railway):
  3. Run "Sync All to ACC" button in the ACC Analysis panel to populate accMemberCache for all hub users.

verification: |
  Code changes applied locally. Awaiting human confirmation:
  - lastSignIn row visible in AccUserSidePanel after next sync
  - Google directory loads more users with 30s timeout
  - bulkAccSync run on Railway to populate accMemberCache for all hub users
files_changed:
  - app/(dashboard)/users/AccUserSidePanel.tsx
  - lib/google/directory.ts
