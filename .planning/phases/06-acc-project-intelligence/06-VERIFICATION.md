---
phase: 06-acc-project-intelligence
verified: 2026-04-22T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
re_verification: false
human_verification:
  - test: "Open Users tab, click any user card, scroll to bottom of modal"
    expected: "An 'Autodesk ACC' section appears below contact info rows and above the Quick actions buttons"
    why_human: "Visual layout and modal rendering cannot be verified without a browser"
  - test: "With Autodesk account linked and Account Admin privileges, click a user who is an ACC hub member"
    expected: "Section shows ACC status badge, project cards with role badges, and product pills with active/inactive styling"
    why_human: "Requires live Autodesk Account Admin token and ACC API connectivity"
  - test: "Click the Refresh button in the Autodesk ACC section"
    expected: "A loading skeleton briefly appears, then updated data loads (forceRefresh=true bypasses 24h cache)"
    why_human: "Requires browser interaction to observe skeleton flash and refetch behavior"
  - test: "With Autodesk account NOT linked or lacking Account Admin privilege, open any user modal"
    expected: "Amber 'Account Admin privileges required' warning box appears — no crash or blank section"
    why_human: "Requires a non-Account-Admin Autodesk session to exercise the PRECONDITION_FAILED path"
  - test: "Open a user modal for a user whose email does not exist in the ACC hub"
    expected: "Section shows 'Not found in ACC hub' with a 'Last checked' date"
    why_human: "Requires an email address known to not be an ACC member to trigger the not-found path"
---

# Phase 6: ACC Project Intelligence Verification Report

**Phase Goal:** Surface ACC hub membership, project roles, and product access for any user directly in the Users tab PersonDetailModal — admin clicks a user card and sees their Autodesk ACC presence without leaving the page.

**Verified:** 2026-04-22
**Status:** human_needed — all automated checks passed, 5 human items require browser/live-API confirmation
**Re-verification:** No — initial verification

---

## Goal Achievement

### Success Criteria from ROADMAP.md

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Clicking any user shows "Autodesk" section in detail modal | VERIFIED (automated) | `AccProfileSection` imported at UsersDirectoryClient.tsx:41, rendered at line 333 inside PersonDetailModal, between contact info and Quick actions |
| 2 | Section reports whether email exists as ACC hub member | VERIFIED (automated) | `not-found` render state at AccProfileSection.tsx:84 shows "Not found in ACC hub" + syncedAt date; `found: true` branch at line 108 shows full profile |
| 3 | For matched users, lists every hub project with role | VERIFIED (automated) | projects rendered at AccProfileSection.tsx:139-168; each project card maps `proj.roles` to Badge elements |
| 4 | Shows which ACC modules/products they have access to | VERIFIED (automated) | products rendered at AccProfileSection.tsx:172-193; `getProductDisplayName` maps raw API names; active/inactive styling applied |
| 5 | Data sourced from hub admin API (not user's own link) | VERIFIED (automated) | users.ts:755 calls `getValidAutodeskAccessToken(ctx.session.user.id)` — uses the admin's session token, not the target user's |
| 6 | Results cached in DB and refreshable on demand | VERIFIED (automated) | `accMemberCache.upsert` at users.ts:792 + 822; `forceRefresh` state toggle at AccProfileSection.tsx:33; ACC_CACHE_TTL_MS = 24h at users.ts:43 |

**Score: 6/6 criteria verified automatically**

---

### Observable Truths — Plan-level Verification

#### Plan 01: AccMemberCache Prisma Model and Migration

| Truth | Status | Evidence |
|-------|--------|----------|
| AccMemberCache table exists in DB after migration | VERIFIED | `prisma/migrations/20260422000000_add_acc_member_cache/migration.sql` exists; CREATE TABLE statement confirmed |
| AccMemberCache is queryable by unique email field | VERIFIED | schema.prisma:400 `email String @unique`; migration.sql:13 `CREATE UNIQUE INDEX "AccMemberCache_email_key"` |
| data field stores arbitrary JSON | VERIFIED | schema.prisma:401 `data Json`; migration.sql:5 `"data" JSONB NOT NULL` |
| syncedAt field tracks when data was last fetched | VERIFIED | schema.prisma:402 `syncedAt DateTime` (no default — set explicitly by procedure) |

#### Plan 02: acc-admin.ts API Wrapper Library

| Truth | Status | Evidence |
|-------|--------|----------|
| fetchAccUserByEmail returns AccUser or null without throwing on empty results | VERIFIED | acc-admin.ts:117-118 `return results.length > 0 ? results[0] : null` |
| fetchAccUserProjects returns projects with (Removed) roles filtered | VERIFIED | acc-admin.ts:150-154 `.filter(r => !r.name.includes("(Removed)"))` applied per-page |
| fetchAccUserProducts returns all products with status | VERIFIED | acc-admin.ts:194-200 maps `status` field; no filtering applied |
| All functions throw IntegrationError on 401/403 | VERIFIED | acc-admin.ts:75-83 checks status 401/403 and throws IntegrationError("reconnect_required") |
| b. prefix is stripped by caller, not these helpers | VERIFIED | acc-admin.ts:103 JSDoc comment; users.ts:768 `apsHubId?.replace(/^b\./, "")` is the caller |

#### Plan 03: getAccProfile tRPC Procedure

| Truth | Status | Evidence |
|-------|--------|----------|
| Cache hit returns without hitting ACC API | VERIFIED | users.ts:732-750 checks cache TTL and returns early |
| forceRefresh: true bypasses cache | VERIFIED | users.ts:732 `if (!forceRefresh)` — skips cache block entirely |
| Empty ACC results cached as { found: false } | VERIFIED | users.ts:791-797 upserts and returns `{ found: false, syncedAt }` |
| PRECONDITION_FAILED on no Account Admin privilege (403) | VERIFIED | users.ts:783 `toAccRouterError` maps IntegrationError to PRECONDITION_FAILED |
| PRECONDITION_FAILED when Autodesk not linked | VERIFIED | users.ts:757 `toAccRouterError` on token failure |
| b. prefix stripped from apsHubId | VERIFIED | users.ts:768 `project?.apsHubId?.replace(/^b\./, "")` |

#### Plan 04: AccProfileSection UI Component

| Truth | Status | Evidence |
|-------|--------|----------|
| PersonDetailModal shows Autodesk section on click | VERIFIED (code path) | UsersDirectoryClient.tsx:333 `<AccProfileSection email={person.email} />` inside PersonDetailModal |
| Loading skeleton shown during fetch | VERIFIED | AccProfileSection.tsx:47-55 `if (isLoading || isFetching)` returns skeleton |
| "Not found in ACC hub" shown for unknown email | VERIFIED | AccProfileSection.tsx:84-105 not-found state with syncedAt date |
| 403 error shows amber warning (not blank/crash) | VERIFIED | AccProfileSection.tsx:58-72 checks `error?.data?.code === "PRECONDITION_FAILED"` |
| Full profile shows projects with roles and products | VERIFIED | AccProfileSection.tsx:108-200 full render branch |
| Refresh button re-fetches bypassing 24h cache | VERIFIED | AccProfileSection.tsx:40-44 `handleRefresh` sets forceRefresh:true; setTimeout resets to false after 200ms |
| Removed roles not displayed | VERIFIED | Filtered server-side in acc-admin.ts; no client-side "(Removed)" entries reach the component |

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `prisma/schema.prisma` | VERIFIED | AccMemberCache model at line 398 with all required fields |
| `prisma/migrations/20260422000000_add_acc_member_cache/migration.sql` | VERIFIED | CREATE TABLE, UNIQUE INDEX, and two regular indexes present |
| `lib/server/acc-admin.ts` | VERIFIED | 214 lines; exports ACC_ADMIN_BASE, AccUser, AccRole, AccProject, AccProduct, 3 async functions; starts with `import "server-only"` |
| `server/routers/users.ts` | VERIFIED | getAccProfile procedure at line 721; all imports verified; b. strip at line 768 |
| `app/(dashboard)/users/AccProfileSection.tsx` | VERIFIED | 204 lines; "use client" at top; exports AccProfileSection; 5 render states; forceRefresh pattern; PRODUCT_NAMES mapping |
| `app/(dashboard)/users/UsersDirectoryClient.tsx` | VERIFIED | Import at line 41; usage at line 333 between contact info and Quick actions |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `AccProfileSection.tsx` | `trpc.users.getAccProfile` | `trpc.users.getAccProfile.useQuery({ email, forceRefresh })` | WIRED | Line 35 of AccProfileSection.tsx |
| `UsersDirectoryClient.tsx` | `AccProfileSection.tsx` | `import { AccProfileSection }; <AccProfileSection email={person.email} />` | WIRED | Import line 41, usage line 333 |
| `server/routers/users.ts` | `lib/server/acc-admin.ts` | `import { fetchAccUserByEmail, fetchAccUserProjects, fetchAccUserProducts }` | WIRED | users.ts lines 16-18, used at lines 780, 802, 803 |
| `server/routers/users.ts` | `ctx.db.accMemberCache` | Prisma upsert for cache persistence | WIRED | `accMemberCache.findUnique` line 733; `accMemberCache.upsert` lines 792, 822 |
| `server/routers/users.ts` | `lib/server/aps-user-token.ts` | `getValidAutodeskAccessToken(ctx.session.user.id)` | WIRED | Import line 14, used at line 755 |

---

### Requirements Coverage

| Requirement | Plans Claiming It | Status | Evidence |
|-------------|-------------------|--------|----------|
| REQ-06 | 06-01, 06-02, 06-03, 06-04 (all 4 plans) | SATISFIED | Full implementation stack delivered: DB schema, API helpers, tRPC procedure, UI component. All 6 ROADMAP.md success criteria verified. |

No orphaned requirements — ROADMAP.md maps only REQ-06 to Phase 6, and all 4 plans claim it.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `AccProfileSection.tsx` | 203 | `return null` | INFO | Intentional — final fallback for pre-query-resolution state (before isLoading fires). All 5 meaningful states handled above it. Not a stub. |

No TODO/FIXME/HACK/placeholder comments found across any Phase 6 file.

---

### TypeScript Compilation

`npx tsc --noEmit` produces zero errors referencing any Phase 6 file (`acc-admin.ts`, `users.ts`, `AccProfileSection.tsx`, `UsersDirectoryClient.tsx`).

---

### Git Commits — All Verified

| Commit | Description |
|--------|-------------|
| `8b3fb85` | feat(06-01): add AccMemberCache model to schema.prisma |
| `db5a241` | feat(06-01): run Prisma migration to create AccMemberCache table |
| `6328633` | feat(06-02): create lib/server/acc-admin.ts with typed ACC Admin API wrappers |
| `612b15d` | feat(06-03): add getAccProfile procedure to usersRouter |
| `8d25ffe` | feat(06-04): create AccProfileSection client component |
| `5e43798` | feat(06-04): wire AccProfileSection into PersonDetailModal |

---

### Human Verification Required

All automated checks passed. The following 5 items require a browser with production/dev credentials to confirm end-to-end behavior.

#### 1. Autodesk ACC Section Renders in Modal

**Test:** Open the Users tab, click any user card, scroll to the bottom of the modal.
**Expected:** An "Autodesk ACC" section is visible below the contact info rows and above the Email / Call quick-action buttons.
**Why human:** Visual layout and modal rendering require a browser.

#### 2. Full Profile Displays Projects + Products

**Test:** With an Autodesk account linked that has Account Admin privileges in the hub, click a user card for a person who is an ACC hub member.
**Expected:** The Autodesk ACC section shows a status badge, project cards with role badges, and product pills styled green (active) or muted (inactive).
**Why human:** Requires live Autodesk Account Admin token and a user who exists in the ACC hub.

#### 3. Refresh Button Behavior

**Test:** In the Autodesk ACC section, click the "Refresh" button.
**Expected:** A loading skeleton briefly flashes, then updated data renders. The 24h cache is bypassed (forceRefresh: true sent to the tRPC procedure).
**Why human:** Requires browser interaction to observe the skeleton flash and confirm a fresh network request was made.

#### 4. PRECONDITION_FAILED Error State

**Test:** Use a session where the Autodesk account is not linked OR lacks Account Admin privilege in the hub, then open any user modal.
**Expected:** The Autodesk ACC section shows an amber "Account Admin privileges required" warning box — no crash, no blank section.
**Why human:** Requires a non-Account-Admin Autodesk session to trigger the error path.

#### 5. Not-Found State

**Test:** Open a user modal for a user whose email address is not registered in the ACC hub.
**Expected:** The section shows "Not found in ACC hub" with a "Last checked" date. The negative result is also cached.
**Why human:** Requires identifying an email address known not to be in the ACC hub.

---

### Summary

Phase 6 automated verification is **complete and clean**. Every artifact exists at full implementation depth (not stubs), all key links are wired, all 6 ROADMAP.md success criteria have code-level evidence, and TypeScript compiles without errors. All 6 plan commits are present in git history.

The only remaining items are the 5 live-browser checks above, which verify visual rendering, ACC API connectivity, and the error/cache behaviors that only manifest with real Autodesk credentials.

---

_Verified: 2026-04-22_
_Verifier: Claude (gsd-verifier)_
