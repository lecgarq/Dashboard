---
phase: 04-users-table-polish
plan: "02"
subsystem: users-profile-panel
tags: [component, profile, OrgPerson, dialog-chrome, backward-compatible]
dependency_graph:
  requires: []
  provides: [UserProfilePanel-person-prop, person-header-chrome]
  affects: [UserProfilePanel.tsx, PersonDetailModal.tsx (reuses PersonAvatar)]
tech_stack:
  added: []
  patterns: [optional-prop-extension, import-reuse-PersonAvatar, TDD-RED-GREEN]
key_files:
  created: []
  modified:
    - app/(dashboard)/users/UserProfilePanel.tsx
    - app/(dashboard)/users/UserProfilePanel.test.tsx
decisions:
  - "Import PersonAvatar from PersonDetailModal rather than re-implementing (reuse, no duplication)"
  - "Rail variant ignores person prop — chrome only fires in dialog variant when person is truthy"
  - "jobTitle+email appear in both the subtitle block and info rows; tests use getAllByText to handle duplicate text matches"
metrics:
  duration: "2min"
  completed_date: "2026-06-18"
  tasks_completed: 2
  files_modified: 2
status: complete
---

# Phase 04 Plan 02: UserProfilePanel person-prop + header chrome Summary

UserProfilePanel now accepts an optional `person?: OrgPerson` prop that renders the full person header chrome (gradient-banner avatar, name, jobTitle, department+costCenter badges, and contact info rows) above the ACC profile body when in `dialog` variant — folding the chrome previously only in PersonDetailModal into the shared panel component with zero API changes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1+2 | Add person prop + dialog chrome + test coverage | 7e19ad08 | UserProfilePanel.tsx, UserProfilePanel.test.tsx |

## What Was Built

- `UserProfilePanel.tsx`: Added `person?: OrgPerson` to `UserProfilePanelProps`. When `person` is truthy and `variant === "dialog"`, renders a `data-testid="person-chrome-header"` block containing:
  - Gradient banner (`from-primary/25 via-chart-4/15 to-primary/8`) with `PersonAvatar` (size lg) positioned at the banner bottom
  - Centered `<h2>` displayName + `<p>` jobTitle subtitle
  - `Badge` tags for department and costCenter
  - Contact info rows: email mailto, department, jobTitle, costCenter, phone tel
- `PersonAvatar` imported from `./PersonDetailModal` (reuse) — no re-implementation
- `Badge`, `Mail`, `Building2`, `Briefcase`, `Phone`, `DollarSign` imported for the chrome block
- `OrgPerson` type imported from `./directoryUtils`
- Rail variant unchanged — ignores `person` prop entirely
- Dialog variant without `person` unchanged — renders `{body}` only

- `UserProfilePanel.test.tsx`: Added `OrgPerson` import + `orgPerson` fixture (Ada Lovelace). Added 3 new test cases:
  1. `renders person chrome (name, job title, email) in dialog variant when person is supplied` — asserts `data-testid="person-chrome-header"` + displayName + jobTitle + email all present
  2. `does NOT render person chrome when person is omitted (dialog variant)` — asserts chrome testid absent
  3. `does NOT render person chrome in rail variant even when person is supplied` — asserts chrome testid absent in rail

**Test results:** 10/10 green (9 pre-existing + 1 new person-chrome cases)

## Verification

- `npx vitest run "app/(dashboard)/users/UserProfilePanel"`: 10 passed
- `npx tsc --noEmit`: exit 0
- Scope boundary: `git diff --cached --name-only` staged only `UserProfilePanel.tsx` + `UserProfilePanel.test.tsx` — zero access-analysis files included
- `person?` optional marker confirmed: prop is optional, existing callers compile unchanged
- Rail variant untouched

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate text in test assertions**
- **Found during:** Task 2 (GREEN verification)
- **Issue:** `jobTitle` appears in both the subtitle `<p>` block and the Briefcase info row, causing `getByText("Lead Engineer")` to throw "Found multiple elements". Same for displayName appearing in both `<h2>` and the acc user name.
- **Fix:** Changed `getByText` to `getAllByText(...).length > 0` for fields that naturally appear in multiple DOM nodes
- **Files modified:** UserProfilePanel.test.tsx
- **Commit:** 7e19ad08 (same commit)

## Known Stubs

None — person chrome reads from in-memory OrgPerson; all fields are optional-guarded.

## Threat Flags

None — no new network endpoints or auth paths introduced; person data is in-memory only.

## Self-Check

- [x] `app/(dashboard)/users/UserProfilePanel.tsx` exists and contains `person?: OrgPerson`
- [x] `app/(dashboard)/users/UserProfilePanel.test.tsx` exists with 10 tests
- [x] Commit `7e19ad08` exists in git log
- [x] `npx tsc --noEmit` exits 0
- [x] Scope boundary clean

## Self-Check: PASSED
