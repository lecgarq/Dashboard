---
phase: 06-acc-project-intelligence
plan: "04"
subsystem: ui
tags: [react, trpc, autodesk, acc, tailwind, lucide]

# Dependency graph
requires:
  - phase: 06-acc-project-intelligence
    provides: getAccProfile tRPC procedure in usersRouter (24h cache, forceRefresh, PRECONDITION_FAILED error)
provides:
  - AccProfileSection client component with 5 render states (skeleton, 403, generic-error, not-found, full-profile)
  - PersonDetailModal updated to show ACC data inline below contact info
  - Refresh button bypassing 24h cache via forceRefresh state pattern
affects:
  - users tab
  - PersonDetailModal
  - any future ACC-related UI work

# Tech tracking
tech-stack:
  added: []
  patterns:
    - forceRefresh state toggle pattern for tRPC queries that need dynamic input on refetch
    - Product name mapping table (PRODUCT_NAMES Record) for ACC API raw name normalization
    - trpc.users.getAccProfile.useQuery with staleTime: 5min and retry: false

key-files:
  created:
    - app/(dashboard)/users/AccProfileSection.tsx
  modified:
    - app/(dashboard)/users/UsersDirectoryClient.tsx

key-decisions:
  - "forceRefresh implemented via useState toggle (not refetch()) because tRPC useQuery does not support passing new input on refetch"
  - "AccProfileSection renders null-safe: PersonDetailModal already guards person !== null so no extra null check needed"

patterns-established:
  - "forceRefresh toggle: const [forceRefresh, setForceRefresh] = useState(false); flip true on click, setTimeout reset to false after 200ms"
  - "PRECONDITION_FAILED detection: error?.data?.code === 'PRECONDITION_FAILED' for 403 Account Admin gate"

requirements-completed: [REQ-06]

# Metrics
duration: ~25min
completed: 2026-04-22
---

# Phase 6 Plan 04: AccProfileSection UI Component Summary

**AccProfileSection client component wired into PersonDetailModal — surfaces ACC hub membership, projects/roles, and products for every user with a Refresh bypass for the 24h cache**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-22T (session)
- **Completed:** 2026-04-22
- **Tasks:** 3 (2 auto + 1 human-verify)
- **Files modified:** 2

## Accomplishments
- Created AccProfileSection.tsx with all 5 render states: loading skeleton, 403 Account Admin error (amber), generic error, not-found, and full ACC profile with project cards and product pills
- Wired AccProfileSection into PersonDetailModal in UsersDirectoryClient.tsx — renders below contact info rows, above Quick actions
- forceRefresh toggle pattern implemented so the Refresh button triggers a live ACC API call bypassing the 24h Prisma cache without needing a tRPC refetch() with new input
- TypeScript compilation confirmed zero errors across all Phase 6 files; app deployed and running on Railway production

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AccProfileSection.tsx component** - `8d25ffe` (feat)
2. **Task 2: Wire AccProfileSection into PersonDetailModal** - `5e43798` (feat)
3. **Task 3: Human verify** - APPROVED (TypeScript zero errors, Railway production confirmed)

## Files Created/Modified
- `app/(dashboard)/users/AccProfileSection.tsx` - New client component: 5 render states, forceRefresh pattern, PRODUCT_NAMES mapping, trpc.users.getAccProfile.useQuery
- `app/(dashboard)/users/UsersDirectoryClient.tsx` - Added import + single JSX insertion of `<AccProfileSection email={person.email} />` inside PersonDetailModal

## Decisions Made
- forceRefresh is a local useState bool toggled on Refresh click (reset after 200ms setTimeout). This is necessary because tRPC `useQuery` does not support passing new input through `refetch()` — changing the query input via state is the correct pattern to trigger a fresh network request.
- No new imports added to UsersDirectoryClient.tsx beyond the AccProfileSection import — AlertCircle, Badge, cn were already present and reused.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — implementation followed plan interfaces exactly. TypeScript reported zero errors on first compile.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 6 is now complete: all 4 plans done (AccMemberCache schema, acc-admin.ts helpers, getAccProfile tRPC procedure, AccProfileSection UI)
- ACC profile data is fully surfaced in the Users tab modal for any admin with Autodesk Account Admin privileges
- Future work: could add sorting/filtering of projects in the modal, or a dedicated ACC admin page if the modal becomes too dense

---
*Phase: 06-acc-project-intelligence*
*Completed: 2026-04-22*
