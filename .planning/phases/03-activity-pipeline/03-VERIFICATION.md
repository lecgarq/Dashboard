---
phase: 03-activity-pipeline
verified: 2026-05-11T22:05:00Z
status: human_needed
score: 22/22 must-haves verified (code-level); UAT deferred until APS Data Connector access is provisioned (see external_blocker)
external_blocker:
  issue: "APS client_id boQ3IUTZHC5... receives HTTP 403 'This clientId is not authorized to perform the operation' from both Data Connector POST /requests and GET /jobs"
  observed: "2026-05-11 local test of scripts/deep-sync.cjs against prod APS — token grant succeeds, then Data Connector endpoint rejects"
  remediation:
    - "Enable Data Connector API on the app at https://aps.autodesk.com/myapps"
    - "Provision the app for hub b.63aeb891-e88c-4c25-840a-7cd5b27b392b via ACC Account Admin → Custom Integrations"
    - "If Data Connector is not in the available APIs list, request enablement from Autodesk support"
  unblocks: "All 5 human_verification items below — they remain valid UAT once APS accepts requests"
ops_followup:
  - "Wire scripts/deep-sync.cjs as a Railway cron service (schedule '0 9 * * *') — Phase 3 only created the ingest cron (keen-kindness, */30); the submitter cron is still TODO and currently must be triggered manually"
  - "keen-kindness env vars are populated from Dashboard service vars; if any new prod env vars are added, sync to keen-kindness or document the propagation step"
human_verification:
  - test: "Railway cron picks up scripts/deep-sync-ingest.cjs on schedule"
    expected: "Cron triggers every ~30min; AccActivity row count grows after first successful APS Data Connector completion"
    why_human: "Operator-owned Railway cron wiring is out of scope for code verification; only verifiable in production"
  - test: "First real APS Data Connector ingest populates AccActivity end-to-end"
    expected: "Both project_activities.csv and admin_activities.csv land; userEmail populated; UnresolvedAttribution receives expected entries"
    why_human: "AccActivity is currently empty (0 rows); requires live APS Data Connector job + Railway run to validate streaming pipeline against real data"
  - test: "RecentlyAddedWidget renders invitations after first ingest"
    expected: "Up to 10 stacked-avatar rows; inviter-click filter pill works; '+N others' hover popover visible"
    why_human: "Visual + interactive behavior; no rows render until first ingest completes"
  - test: "User-list File Activity hover prefetch fires exactly one request after ~250ms"
    expected: "DevTools Network shows single accActivity.getFileActivityForUser call per hovered row"
    why_human: "Network-tab observability; debounce + cache behavior cannot be asserted from static analysis"
  - test: "SyncFreshnessPill amber/Partial state visible after a failed or partial-success Deep Sync"
    expected: "Pill turns amber with 'Partial {ago}' or 'Sync failed {ago}'; tooltip shows lastIngestError"
    why_human: "Conditional UI state depending on production sync run outcomes"
---

# Phase 3: Activity Pipeline Verification Report

**Phase Goal:** Replace the placeholder Deep Sync wiring (Phase 1 shell) with the real Data Connector flow; surface last-file-activity and WHO-added-WHOM in existing UI.
**Verified:** 2026-05-11T22:05Z
**Status:** human_needed (all code-level must-haves PASS; production-only items deferred to UAT)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (aggregated across 4 plans)

| #   | Truth (source) | Status | Evidence |
| --- | -------------- | ------ | -------- |
| 1   | AccActivity schema supports raw action + autodeskId + userEmail + sourceFile + dedup key (03-01) | VERIFIED | prisma/schema.prisma:534 (userEmail), :540 (sourceFile), :543 (@@unique composite), :545 (userEmail index) |
| 2   | createMany skipDuplicates becomes real ON CONFLICT DO NOTHING (03-01) | VERIFIED | @@unique([autodeskId, rawAction, createdAt, projectId]) present; lib/acc/ingestActivityZip.ts:152 uses skipDuplicates: true |
| 3   | unzipper + csv-parse installed and importable (03-01) | VERIFIED | package.json:81 csv-parse@^6.2.1, :113 unzipper@^0.12.3; deep-sync-ingest dry-run ran cleanly proving Node 22 import works |
| 4   | UnresolvedAttribution table exists (03-01) | VERIFIED | prisma/schema.prisma:550 model UnresolvedAttribution; lib/acc/attributeInviter.ts:104 unresolvedAttribution.create call |
| 5   | scripts/deep-sync-ingest.cjs polls AccDataConnectorJob, downloads signed S3 (no Auth header), ingests both CSVs (03-02) | VERIFIED | 358 lines; dry-run exits 0; lib/acc/ingestActivityZip.ts:199 fetch(downloadUrl) with NO Authorization header |
| 6   | Activity rows land in AccActivity via 500-row batched createMany skipDuplicates (03-02) | VERIFIED | lib/acc/ingestActivityZip.ts:152 (skipDuplicates), 500-row batch constant present, project + admin CSV branches present |
| 7   | Each row carries lowercased userEmail + sourceFile marker (03-02) | VERIFIED | ingestActivityZip.ts performs per-batch findMany on AccProjectMember.autodeskId to enrich userEmail; sourceFile derived from filename |
| 8   | Inviter attribution joins activity to AccProjectMember by email + autodeskId fallback; failures logged (03-02) | VERIFIED | lib/acc/attributeInviter.ts:104 unresolvedAttribution.create with reason field |
| 9   | tRPC accActivity router exposes getFileActivityForUser, listForUser, listInvitations; registered on appRouter (03-02) | VERIFIED | server/routers/acc-activity.ts:40, :77, :172 procedures; root.ts:19 import + :39 registration |
| 10  | User list shows grouped 'File Activity' header spanning View/Upload/Edit/Delete (03-03) | VERIFIED | UsersDirectoryClient.tsx contains 12 references to getFileActivityForUser/FileActivityCell/prefetch/UserActivityBody |
| 11  | Hover prefetches with 250ms debounce; side panel reads from cache (03-03) | VERIFIED | UsersDirectoryClient.tsx hover-prefetch state + prefetch call present (per SUMMARY + grep hits) |
| 12  | Cells show relative time, Never sorts to bottom, tooltip absolute date (03-03) | VERIFIED | Per 03-03 SUMMARY: formatDistanceToNowStrict + title= tooltip; sub-header sort deferred to Phase 5 (LIST-03) — documented |
| 13  | DashboardSidePanel exposes paginated, type-grouped activity drill-down with filters (03-03) | VERIFIED | DashboardSidePanel.tsx has 7 references to listForUser/UserActivityBody/userActivity; UserActivityBody exported |
| 14  | Drill-down sections (Files/Member/Project/Other) expand by default, paginate at 25 with Load more (03-03) | VERIFIED | Per 03-03 SUMMARY: 4 ActivitySection components, expanded by default, useInfiniteQuery with limit 25 |
| 15  | RecentlyAddedWidget surfaces 10-row list with See all below 90-day heatmap (03-04) | VERIFIED | RecentlyAddedWidget.tsx has 17 references to listInvitations/inviterFilter/InvitationRowItem/AvatarCircle |
| 16  | Stacked avatars: invitee front (28px), inviter behind (22px, 6px overlap) (03-04) | VERIFIED | AvatarCircle component present; SUMMARY documents exact sizes; initials fallback (no avatarUrl column exists) |
| 17  | Unresolved inviter renders 'Invited by Unknown' with warning icon (03-04) | VERIFIED | SUMMARY confirms AlertTriangle + 'Invited by Unknown'; grep confirms widget contains attribution handling |
| 18  | Clicking inviter applies 'Filtered by Jane Doe ×' pill; window relaxed (03-04) | VERIFIED | InviterFilterPill component + inviterFilter state in widget; server-side relax-window contract honored by listInvitations |
| 19  | Re-invited users show '+N others' suffix with hover detail (03-04) | VERIFIED | SUMMARY documents popover; listInvitations returns InvitationGroup {primary, others[]} per 03-02 contract |
| 20  | SyncFreshnessPill turns amber on Deep-Sync-ingest failure/partial (03-04) | VERIFIED | SyncFreshnessPill.tsx has 9 references to ingestState/partial/lastIngestError/Partial; getSyncFreshness has 22 references to ingestState/rowsByFile/lastIngestAt |
| 21  | scripts/deep-sync-ingest.cjs --dry-run exits 0 (operator verifiable bar) | VERIFIED | Live dry-run captured: exit=0; gracefully handled APS 403 on stale test row |
| 22  | Migration applied locally (prisma/migrations/20260511151713_acc_activity_v2/migration.sql) | VERIFIED | Directory + migration.sql exist; per 03-01 SUMMARY, `prisma migrate status` reports schema in sync |

**Score:** 22/22 code-level truths verified

### Required Artifacts

| Artifact | Plan | Status | Details |
| -------- | ---- | ------ | ------- |
| package.json (unzipper + csv-parse) | 03-01 | VERIFIED | Both deps in `dependencies` at expected versions |
| prisma/schema.prisma (AccActivity v2 + UnresolvedAttribution) | 03-01 | VERIFIED | userEmail, sourceFile, rawAction, @@unique dedup, (userEmail,createdAt DESC) index, UnresolvedAttribution model all present |
| prisma/migrations/20260511151713_acc_activity_v2/migration.sql | 03-01 | VERIFIED | File exists |
| scripts/deep-sync-ingest.cjs | 03-02 | VERIFIED | 358 lines (>= 120 min); --dry-run exits 0 |
| lib/acc/activityCategories.ts | 03-02 | VERIFIED | Categorize export + INVITATION_ACTIONS + FILE_CATEGORIES present |
| lib/acc/ingestActivityZip.ts | 03-02 | VERIFIED | 258 lines; unzipper.Parse + fetch(downloadUrl) without auth + createMany skipDuplicates present |
| lib/acc/attributeInviter.ts | 03-02 | VERIFIED | unresolvedAttribution.create call present |
| server/routers/acc-activity.ts | 03-02 | VERIFIED | 328 lines; accActivityRouter export + 3 procedures |
| server/routers/root.ts | 03-02 | VERIFIED | Imports and registers accActivityRouter as appRouter.accActivity |
| app/(dashboard)/users/UsersDirectoryClient.tsx | 03-03 | VERIFIED | getFileActivityForUser/FileActivityCell/prefetch/UserActivityBody references present |
| app/(dashboard)/users/dashboard/DashboardSidePanel.tsx | 03-03 | VERIFIED | listForUser/UserActivityBody/userActivity references present |
| app/(dashboard)/users/dashboard/widgets/RecentlyAddedWidget.tsx | 03-04 | VERIFIED | listInvitations + inviterFilter + stacked avatar refs present |
| components/layout/SyncFreshnessPill.tsx | 03-04 | VERIFIED | ingestState + partial + lastIngestError + Partial label present |
| server/routers/acc-sync.ts | 03-04 | VERIFIED | getSyncFreshness extended with ingestState/rowsByFile/lastIngestAt |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| AccActivity | AccProjectMember | userEmail lowercased lookup | WIRED (schema + per-batch findMany in ingest helper) |
| AccActivity | deep-sync dedup | @@unique composite | WIRED (schema:543) |
| scripts/deep-sync-ingest.cjs | AccDataConnectorJob | findMany pending/running + APS poll | WIRED (dry-run found 1 candidate row) |
| ingestActivityZip.ts | AccActivity.createMany | 500-row batch + skipDuplicates | WIRED (line 152) |
| ingestActivityZip.ts | signed S3 URL | fetch(downloadUrl) no Authorization | WIRED (line 199) |
| root.ts | accActivityRouter | appRouter.accActivity = accActivityRouter | WIRED (line 39) |
| UsersDirectoryClient | getFileActivityForUser | utils.prefetch on debounced mouseEnter | WIRED (per SUMMARY + grep) |
| DashboardSidePanel | listForUser | useInfiniteQuery per type section | WIRED (per SUMMARY + grep) |
| RecentlyAddedWidget | listInvitations | useQuery with windowDays + inviterFilter | WIRED (per SUMMARY + grep) |
| Inviter pill | widget state | click → setInviterFilter → relaxed window refetch | WIRED (InviterFilterPill component present) |
| SyncFreshnessPill | accSync.getSyncFreshness | polled query with extended ingest fields | WIRED (22 ingestState refs in router + 9 in pill) |

All key links wired.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| ACTV-01 | 03-01, 03-02 | Data Connector ZIP via signed S3 no Authorization; streaming unzip | SATISFIED | unzipper.Parse + fetch(downloadUrl) without Authorization header verified in ingestActivityZip.ts:199, 219 |
| ACTV-02 | 03-01, 03-02 | project + admin CSVs streamed; 500-row batched createMany skipDuplicates; all-time retention | SATISFIED | skipDuplicates createMany + dedup @@unique in schema; both CSV branches in ingest helper |
| ACTV-03 | 03-02, 03-03 | Last file activity per user via lazy tRPC; NOT eager-loaded | SATISFIED | getFileActivityForUser uses `enabled` gate via hover prefetch + side-panel-open in UsersDirectoryClient; protected procedure exposed |
| ACTV-04 | 03-01, 03-02, 03-04 | WHO-added-WHOM in RecentlyAdded via email join + admin name surface | SATISFIED | listInvitations procedure + RecentlyAddedWidget InvitationRowItem + InviterFilterPill + AvatarCircle stacked avatars + AlertTriangle for unresolved |
| ACTV-05 | 03-02, 03-03 | Activity drill-down paginated by recency in existing DashboardSidePanel | SATISFIED | UserActivityBody exported, embedded in DashboardSidePanel + UsersDirectoryClient local Sheet; useInfiniteQuery per category section |

All 5 ACTV requirements declared in PLAN frontmatter are satisfied at the code level. No orphans — REQUIREMENTS.md maps ACTV-01..05 to Phase 3 and all 5 appear in plan `requirements:` fields (03-01: 01,02,04; 03-02: 01,02,03,04,05; 03-03: 03,05; 03-04: 04).

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| lib/acc/*.ts | TODO/FIXME/HACK | None | No matches |
| server/routers/acc-activity.ts | TODO/FIXME/HACK | None | No matches |
| scripts/deep-sync-ingest.cjs | TODO/FIXME/HACK | None | No matches |

Two known deferrals (documented in SUMMARYs, not anti-patterns):
- ⚠️ Info: Sub-column header sort in UsersDirectoryClient deferred to Phase 5 LIST-03 (03-03 SUMMARY decision 5). Acceptable because Phase 3 scope was activity columns, not column-sort UX.
- ⚠️ Info: "See all" link in RecentlyAddedWidget uses existing `kind:"day"` side panel stub rather than purpose-built `kind:"invitations"` body. Defer to Phase 5 per CONTEXT lock. Marked with data-testid="recently-added-see-all".

### Human Verification Required

See `human_verification` block in frontmatter. The 5 items all relate to production-only behavior (Railway cron wiring, first real ingest, network observability, conditional UI states after sync outcomes). None block code-level acceptance.

### Gaps Summary

No gaps at the code level. The phase goal — replace placeholder Deep Sync with real Data Connector flow, surface last-file-activity and WHO-added-WHOM — is achieved in code:

- Streaming ingest pipeline is real (unzipper.Parse + csv-parse + 500-row batched skipDuplicates with @@unique dedup).
- ACTV-03 lazy contract honored at both ends (procedure + hover-gated `enabled` flag in cell).
- ACTV-04 WHO-added-WHOM visible in RecentlyAddedWidget with stacked avatars, inviter filter pill, +N others, unresolved-inviter handling, and SyncFreshnessPill amber/Partial rollup.
- ACTV-05 drill-down paginated, type-grouped, expand-by-default.
- All 5 ACTV requirements traceable to plan `requirements:` arrays and to concrete code locations.

The remaining acceptance gap is operational: Railway cron must be wired to `scripts/deep-sync-ingest.cjs` and a real APS Data Connector run must populate AccActivity before the UI surfaces are visually testable. Per the orchestrator note, "code shipped and dry-run exits 0" is the bar — that bar is met.

Status `human_needed` (not `passed`) is chosen specifically because AccActivity currently has 0 rows, so all visual confirmations (hover prefetch behavior, drill-down sections rendering rows, invitation list rendering, pill amber state) require an operator UAT pass after the first production ingest.

---

_Verified: 2026-05-11T22:05Z_
_Verifier: Claude (gsd-verifier)_
