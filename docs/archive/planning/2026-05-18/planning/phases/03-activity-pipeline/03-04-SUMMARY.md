---
phase: 03-activity-pipeline
plan: 04
subsystem: UI + sync visibility
tags: [ui, widget, trpc, activity, sync-pill, attribution]

# Dependency graph
requires:
  - phase: 03-activity-pipeline
    plan: 02
    provides: trpc.accActivity.listInvitations (InvitationGroup shape with primary + others[])
  - phase: 03-activity-pipeline
    plan: 01
    provides: AccDataConnectorJob.status terminal states ("success"/"failed") consumed by extended getSyncFreshness
provides:
  - RecentlyAddedWidget row-list section (10 rows visible, stacked avatars, inviter filter pill, See-all stub)
  - SyncFreshnessPill amber/Partial state for Deep-Sync-ingest failure & partial-success
  - accSync.getSyncFreshness extended with deep.{ingestState, partial, lastIngestAt, lastIngestError}
affects:
  - Phase 5 (DASH-18) may extend "See all" link to a kind:"invitations" side-panel body

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Initials-based avatar fallback (no avatarUrl in AccProjectMember schema; reused AdminAccessWidget initialsOf pattern)"
    - "Stacked-avatar via absolute positioning with ring on the front avatar (no <Avatar> primitive)"
    - "Hover popover for '+N others' inviter list — pure CSS state on a setState boolean, no Popover primitive"
    - "Partial-success heuristic: parse rowsByFile={...} JSON embedded in SyncMeta('deep').lastError"

key-files:
  created:
    - .planning/phases/03-activity-pipeline/03-04-SUMMARY.md
  modified:
    - server/routers/acc-sync.ts
    - components/layout/SyncFreshnessPill.tsx
    - app/(dashboard)/users/dashboard/widgets/RecentlyAddedWidget.tsx

key-decisions:
  - "Heatmap NOT visually filtered when inviterFilter is active — CONTEXT.md does not require it; keeping the heatmap as an unchanged at-a-glance view minimizes complexity and matches the existing 04.1 widget contract. Documented in 'Open question Q1' in 03-RESEARCH.md."
  - "Avatar sizes: invitee 28px (front, blue #DBEAFE), inviter 22px (behind, grey #D1D5DB), 6px overlap. Inviter sits centered vertically behind the invitee. Initials-based fallback (no avatarUrl/imageUrl column exists in AccProjectMember)."
  - "'See all' link dispatches setSelected({kind:'day', dateIso: <today>, emails: <union of invitee emails>}) instead of a richer kind:'invitations' side-panel body — CONTEXT.md defers richer side-panel work to Phase 5. The link is gated by invitationGroups.length > 10 (no link shown when widget already shows all rows). data-testid='recently-added-see-all' for follow-up panel-body work."
  - "Partial-success detection in getSyncFreshness reads the Stage-2 cron's 'rowsByFile={\"project\":N,\"admin\":M}' summary that scripts/deep-sync-ingest.cjs writes to SyncMeta('deep').lastError. Partial = exactly one CSV ingested zero rows; both-zero implies empty export window (treated as green). Avoids needing a new schema column."
  - "Ingest amber surfaces ONLY when Quick-Sync is otherwise green/skipped — Quick-Sync failure/amber paths from SYNC-03 take precedence (single visible status; no double-amber confusion)."

# Metrics
duration: ~5min
completed: 2026-05-11
---

# Phase 3 Plan 4: RecentlyAdded WHO-added-WHOM + activity-ingest pill rollup Summary

**RecentlyAddedWidget extended with a 10-row invitation list below the heatmap (stacked invitee/inviter avatars, "(+N others)" hover popover, click-to-filter inviter pill); SyncFreshnessPill surfaces Deep-Sync-ingest amber/Partial state by reading an extended getSyncFreshness — no new pill, no manual sync UI added.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-11T21:55Z
- **Completed:** 2026-05-11T22:00Z
- **Tasks:** 3
- **Files created:** 1 (this SUMMARY.md)
- **Files modified:** 3 (acc-sync router, SyncFreshnessPill, RecentlyAddedWidget)

## Accomplishments

- **Task 1 — `server/routers/acc-sync.ts`:** `getSyncFreshness` now joins the most recent `AccDataConnectorJob` row (any status) alongside SyncMeta and emits four new fields under the existing `deep` key: `ingestState` (`green` / `amber` / `running` / `none`), `partial: boolean`, `lastIngestAt: Date | null`, `lastIngestError: string | null`. The partial-success heuristic parses the `rowsByFile={"project":N,"admin":M}` summary the Stage-2 cron writes into `SyncMeta('deep').lastError`. All existing fields preserved verbatim — SYNC-03 callers (Phase 1) unchanged. `getActiveDeepSyncJob` untouched.

- **Task 2 — `components/layout/SyncFreshnessPill.tsx`:** Added an amber branch that fires when Quick-Sync is otherwise green/skipped but ingest reported amber. Label is `Partial {ago}` for partial-success or `Sync failed {ago}` for hard failure; tooltip surfaces the `lastIngestError` reason and last attempt timestamp via `formatDistanceToNow`. Reuses existing `bg-amber-500` token (CONTEXT lock: no new color tokens). 15s-while-running / 5min-otherwise refetch cadence and collapsed-sidebar dot rendering preserved. NO TOASTS, NO MODALS, NO MANUAL TRIGGER UI added.

- **Task 3 — `app/(dashboard)/users/dashboard/widgets/RecentlyAddedWidget.tsx`:** Heatmap and segmented `[7d|30d|90d]` control preserved. New row-list section below the heatmap consumes `trpc.accActivity.listInvitations({windowDays, inviterFilter})` and renders up to 10 `InvitationGroup` rows newest-first. Each row:
  - **Stacked avatars** — invitee 28px in front (blue tint, ring), inviter 22px behind (grey tint, 6px overlap, vertically centered). Initials computed from `name` with email-local-part fallback (no `avatarUrl` column exists).
  - **Body text** — `{inviterName} invited {inviteeName}` line 1; `{projectId} · {ago} ago` line 2 (project-name resolution deferred — `listInvitations` returns `projectId` only).
  - **`(+N others)` suffix** for multi-inviter cases with a hover popover listing every other inviter newest-first with `formatDistanceToNow` timestamps.
  - **Unresolved inviter** (`inviterName === null`) renders an `AlertTriangle` icon + `Invited by Unknown`; the inviter avatar slot shows a generic warning placeholder; the row is non-clickable.
  - **Inviter click** sets local `inviterFilter` state to the inviter's `autodeskId` + name; the pill `Filtered by: Jane Doe ×` (matching existing `ActiveFilterPill` styling from `UsersDirectoryClient.tsx:532-553`) renders at the top with a `time-window filter relaxed` hint; `×` clears the filter. The query refetches with `inviterFilter` set; server relaxes the time window per Plan 02 contract.
  - **`See all →`** link (visible only when `invitationGroups.length > 10`) dispatches `setSelected({kind:'day', dateIso: <today>, emails: <union>})` to the existing side panel (`data-testid="recently-added-see-all"` for follow-up).
  - **Empty states** — no-filter / zero rows shows `No invitations in the last {windowDays} days`; filter-active / zero rows shows `No invitations by {name}` + inline clear button.

## Task Commits

1. **Task 1: getSyncFreshness extended with deep-sync-ingest rollup** — `3e96f11` (feat)
2. **Task 2: SyncFreshnessPill amber/Partial state** — `83f07ca` (feat)
3. **Task 3: RecentlyAdded row list + stacked avatars + inviter filter** — `ac9941c` (feat)

## Files Created/Modified

- `server/routers/acc-sync.ts` — added `parseRowsByFile` + `computeIngestState` helpers; `getSyncFreshness` now returns `deep.{ingestState, partial, lastIngestAt, lastIngestError}` alongside existing fields. (~112 lines added)
- `components/layout/SyncFreshnessPill.tsx` — `FreshnessData.deep` typed with the new ingest fields; new amber branch in `computePillState` for partial/failed ingest. (~30 lines net added)
- `app/(dashboard)/users/dashboard/widgets/RecentlyAddedWidget.tsx` — added `initialsFromName`, `AvatarCircle`, `InviterFilterPill`, `InvitationRowItem` helpers + the row-list rendering, `listInvitations` query wiring, inviter-filter state, and the "See all" dispatcher. Heatmap and segmented-window control untouched. (~415 lines net added, 4 removed)

## Decisions Made

See frontmatter `key-decisions` block. Highlights:
- **Heatmap stays unchanged when inviter filter is active** (CONTEXT does not require visual filtering of the calendar).
- **No avatar images** — the Prisma `AccProjectMember` model has no `avatarUrl` / `imageUrl` / `profilePicture` column (verified via grep); we use initials with email-local-part fallback. Matches the existing `AdminAccessWidget` pattern.
- **Partial-success uses an embedded JSON heuristic** instead of a new schema column — Plan 02's Stage-2 cron already writes `rowsByFile={...}` to `SyncMeta('deep').lastError`, so no migration is needed.
- **"See all" reuses `kind:"day"` side-panel handler** as a stub — a richer `kind:"invitations"` body is Phase 5 work.

## Open Questions / Validation Pending

- **`listInvitations` first-ingest validation:** `AccActivity` is still empty (no Railway cron run yet). The row list will render `No invitations in the last 30 days` until the first ingest completes. UAT for the inviter-click-to-filter flow is deferred to post-ingest.
- **Project-name resolution in row body:** Currently shows `projectId` (cuid string) — the `listInvitations` tRPC return shape does not include project name. If UAT shows the cuid is unhelpful, a follow-up join in `acc-activity.ts` can add `projectName` to each row.
- **`See all` stub:** The link dispatches to the existing `kind:"day"` side panel body. If operator feedback says invitations-by-day mixing is confusing, follow-up should extend `selectionContext` with `kind:"invitations"` + a new `InvitationsBody` component in `DashboardSidePanel`.

## Deviations from Plan

None. Plan executed as written. No Rule 1-3 auto-fixes were needed; no Rule 4 architectural escalation.

The only soft-call I made beyond the plan text:
- The plan said "if extending the side panel is too much for this plan, keep 'See all' as a no-op stub link". I went one step further and wired it to the existing `kind:"day"` handler so the click still opens *something* useful (today's invitee emails) rather than being a dead link. The follow-up note above documents the upgrade path.

## Deferred Items

- Project-name (not just projectId) in row body — pending UAT signal.
- `kind:"invitations"` side-panel body for a "See all" experience purpose-built for invitations.
- First-ingest validation that `listInvitations` actually returns rows — depends on Railway cron picking up `scripts/deep-sync-ingest.cjs` (operator action from Plan 02 summary still pending).

## Issues Encountered

None. All three tasks committed cleanly on the first verify pass.

The pre-existing typecheck errors in `app/(dashboard)/users/UsersDirectoryClient.tsx` (lines 245 + 933) are Plan 03-03's territory (parallel wave) and were not touched here.

## User Setup Required

None new. This plan introduces no env vars, no migrations, no Railway config beyond what Plan 02 already requested.

## Self-Check: PASSED

- FOUND: server/routers/acc-sync.ts (modified — `ingestState` field added, verified via Read)
- FOUND: components/layout/SyncFreshnessPill.tsx (modified — `ingestState` branch added, verified via Read)
- FOUND: app/(dashboard)/users/dashboard/widgets/RecentlyAddedWidget.tsx (modified — `listInvitations` + `InvitationRowItem` present, verified via Read)
- FOUND: .planning/phases/03-activity-pipeline/03-04-SUMMARY.md (this file)
- FOUND commit: 3e96f11 (Task 1 — verified via `git log --oneline | grep 3e96f11`)
- FOUND commit: 83f07ca (Task 2 — verified via `git log --oneline | grep 83f07ca`)
- FOUND commit: ac9941c (Task 3 — verified via `git log --oneline | grep ac9941c`)

---
*Phase: 03-activity-pipeline*
*Completed: 2026-05-11*
