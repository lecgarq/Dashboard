# User profile sidebar enrichment + all-time activity — design

**Date:** 2026-06-16
**Status:** Approved (owner)
**Branch:** feat/access-analysis-redesign

## Goal

Make the shared user-detail sidebar (`UserProfilePanel`, used by both `/users` and
the access-analysis right rail) show three things it currently doesn't:

1. The person's **cost center** (from the Google Workspace directory).
2. The person's **Gmail/Workspace profile photo** as an avatar.
3. **All-time activity** instead of a last-30-days window.

## Root causes (why it's missing today)

- **Cost center & photo exist but are discarded.** The Google Workspace directory
  (`lib/google/directory.ts` → `OrgPerson`) already returns `costCenter` and
  `photoUrl`. But `useMergedAccUsers.ts` → `mergePeopleWithAccSummary` keeps the
  matching `BulkAccUser` and drops the `OrgPerson` fields (lines ~106–109).
  `BulkAccUser` has no slot for them, so they never reach the panel. No new fetch
  is needed — the directory is already loaded and cached by `useMergedAccUsers`.
- **Activity is server-capped to 30 days.** `getAccUserActivity`
  (`server/routers/users/acc-profile.ts:206`) filters the count and top-actions to
  `Date.now() − 30d`. It already computes an all-time `totalCount`, and recent
  events are already "latest N regardless of age", so all-time is cheap.

## Scope (locked)

- **In:** cost center + profile photo + all-time activity.
- **Out (YAGNI):** department, job title, phone — available from the same
  directory but not requested. Easy to add later.
- **Out:** any change to how the directory is fetched/authed/cached.

## Coverage caveat (expectation-setting)

Cost center and photo come **only from the Google Workspace directory
(@hermosillo.com)**. External / `@gmail.com` / guest users are not in that
directory, so they will have **no photo (initials fallback)** and **no
cost-center line**. This is expected, not a bug.

## Components & data flow

### 1. Carry the fields through the merge (`app/(dashboard)/users/`)

- **`lib/acc/acc-types.ts`** — add to `BulkAccUser`: `photoUrl?: string | null`
  and `costCenter?: string | null` (optional, non-breaking).
- **`useMergedAccUsers.ts`**
  - `mergePeopleWithAccSummary`: when a directory person matches an ACC user,
    return `{ ...accUser, photoUrl: person.photoUrl, costCenter: person.costCenter }`
    instead of the unchanged ACC record. Build a `byEmail` lookup of people so the
    matched person is in hand.
  - `createAccUserStub(person)`: also set `photoUrl` + `costCenter` from the person.
- **`bulkUserToProfileData.ts`** — pass `photoUrl` + `costCenter` into the returned
  `AccProfileData`.
- **`AccProfileSection.tsx`** — add `photoUrl?: string | null` and
  `costCenter?: string | null` to the `AccProfileData` type.

### 2. Render (`AccProfileSection.tsx` + `UserProfilePanel.tsx`)

- **Avatar** — a small round image (~36px) in the header. Show
  `<img src={photoUrl}>` when present; otherwise an initials circle derived from
  name/email. Applies to the rail header (`UserProfilePanel` variant="rail") and
  the `AccProfileFull` header. `referrerPolicy="no-referrer"` on the img so the
  Google-hosted photo loads reliably.
- **Cost center** — add a "Cost center: {value}" item to the existing
  *Company · Added on · Last sign-in* row in `AccProfileFull`, rendered only when
  `data.costCenter` is set. The row's `{(data.company || …)}` guard is widened to
  include `costCenter`.

### 3. All-time activity (`server/routers/users/acc-profile.ts` + `AccProfileSection.tsx`)

- **Resolver** — drop the `createdAt: { gte: since30d }` filter on the
  `topActions` group-by so top actions are all-time. Keep `totalCount` (all-time)
  and `recentRows` (latest N) as they are. `last30dCount` may stay in the payload
  (harmless) or be removed; the UI stops using it.
- **`AccUserActivityPanel`** — subtitle uses `totalCount` →
  `"{total} events all-time"`; the "Top actions (last 30 days)" label drops the
  "(last 30 days)" qualifier. Recent-events section unchanged.

## Testing

- **`useMergedAccUsers` unit** (extend existing tests): `mergePeopleWithAccSummary`
  carries `photoUrl` + `costCenter` for (a) a matched ACC user and (b) a
  directory-only stub; an ACC user with no directory match keeps `photoUrl` /
  `costCenter` undefined.
- **`bulkUserToProfileData` unit**: maps `photoUrl` + `costCenter` into
  `AccProfileData`.
- **`UserProfilePanel.test.tsx`**: avatar `<img>` renders when `photoUrl` present;
  initials fallback when absent; cost-center line shows when present and is hidden
  when absent.
- **Activity**: a focused check that `getAccUserActivity` top-actions is not
  date-filtered (all-time), and that the panel subtitle reads all-time.

## Non-goals

- No directory fetch/auth/caching changes.
- No new fields beyond cost center + photo.
- No change to recent-events behavior (already all-time latest-N).
