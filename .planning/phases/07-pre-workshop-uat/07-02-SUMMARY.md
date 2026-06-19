---
phase: 07-pre-workshop-uat
plan: 02
subsystem: testing
tags: [uat, runbook, perceptual-checklist, sign-off, owner-run]

requires:
  - phase: 07-01
    provides: Engineering gate harness (run-engineering-gates.cjs) and initial UAT-REPORT.md

provides:
  - UAT-RUNBOOK.md: owner build/serve runbook with build isolation decision, :3100 commands, gate invocation, projector pass procedure, promote-only-after-sign-off
  - UAT-REPORT.md Owner Perceptual Checklist: per-page checklists (U-1..U-8, A-1..A-11, T-1..T-7, F-1..F-8, G-1..G-4) + blocker-bar + GPU observation
  - UAT-REPORT.md Combined Sign-Off section: engineering ALL-GREEN gate + owner "approved on the projector" DoD

affects:
  - Task 3 (blocking-human checkpoint): owner runs the live projector pass using these documents

tech-stack:
  added: []
  patterns:
    - "Build isolation verify-then-fallback: Option A (NEXT_DIST_DIR=.next-uat) verified against .next/ mtime, Option B (stop :3000 first) as safe default"
    - "BLOCK vs COSMETIC per-page checklist with table format (Light / Dark columns) for owner marking"
    - "Combined Sign-Off section with explicit DoD phrase: engineering ALL-GREEN AND owner records approved on the projector"

key-files:
  created:
    - .planning/phases/07-pre-workshop-uat/UAT-RUNBOOK.md
  modified:
    - .planning/phases/07-pre-workshop-uat/UAT-REPORT.md

key-decisions:
  - "Runbook uses verify-then-fallback for build isolation: Option A (NEXT_DIST_DIR=.next-uat + mtime check) preferred; Option B (stop :3000 first) is the safe fallback — prevents T-07-05 DoS threat"
  - "Checklist uses table format with separate Light/Dark columns for compact but complete dual-theme coverage"
  - "Combined Sign-Off section requires the literal phrase approved on the projector — prevents T-07-06 repudiation ambiguity"
  - "Promote-to-:3000 is a distinct STEP 5 gated behind sign-off — prevents T-07-07 premature elevation"

metrics:
  duration: 2min
  completed: 2026-06-19T21:52:10Z
  tasks_completed: 2
  tasks_total: 3
  files_created: 2

status: blocked-at-checkpoint
---

# Phase 7 Plan 02: Owner Runbook + Perceptual Checklist Summary

**Owner build/serve runbook (UAT-RUNBOOK.md, 274 lines) and per-page Owner Perceptual Checklist + Combined Sign-Off section in UAT-REPORT.md — blocked at Task 3 (blocking-human: live projector pass)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-19T21:49:18Z
- **Completed (Tasks 1-2):** 2026-06-19T21:52:10Z
- **Tasks completed:** 2 of 3 (Task 3 is blocking-human checkpoint)
- **Files created/modified:** 2

## Accomplishments

### Task 1: UAT-RUNBOOK.md (created)

Written `.planning/phases/07-pre-workshop-uat/UAT-RUNBOOK.md` (274 lines) with:
- STEP 0: build isolation decision with PowerShell mtime-verify script for Option A (NEXT_DIST_DIR=.next-uat) and Option B (stop :3000 Task Scheduler task first); explicit warning against building while :3000 is live
- STEP 1: exact PowerShell build command (`$env:NEXT_DIST_DIR = ".next-uat"; npm run build`) from RESEARCH Q5; notes on omitting ACC_GRAPH_TEST and NEW_ACCESS_ANALYSIS flags
- STEP 2: exact serve command (`node node_modules/.bin/next start -H 0.0.0.0 --port 3100`); confirm http://localhost:3100/users loads
- STEP 3: gate wrapper invocation (`node scripts/uat/run-engineering-gates.cjs`); inline fix-and-re-run loop for each gate type
- STEP 4: live projector pass procedure (secondary display, projector-reduced brightness, 1280px, both themes, perceptual checklist walk)
- STEP 5: promote-to-:3000 only after sign-off (restart Task Scheduler task); rebuild for :3000 if Option A was used
- Recovery notes for 500s, build hang, browser not found
- Quick-reference command table

### Task 2: UAT-REPORT.md Owner Perceptual Checklist (filled)

Replaced the stub section in `.planning/phases/07-pre-workshop-uat/UAT-REPORT.md` with:
- Blocker-bar definition table (PASS / BLOCK / COSMETIC with clear room-breaking criteria)
- /users checklist: 8 items (U-1..U-8) covering overflow, legibility, table density, drill motion, motion guard, clip, particle accent, stat cards — both Light/Dark columns
- /access-analysis checklist: 11 items (A-1..A-11) covering streaming load order, donut drill, people-sheet, terrain, coordination expand, filter banner, cross-filter, overflow, legibility, dark zinc
- /template-mty checklist: 7 items (T-1..T-7) covering table, profile drawer, graph settle, RoleOverviewSheet, terrain, legibility, clip
- /forma-proposal checklist: 8 items (F-1..F-8) covering role rail, folder update, tier chip, draft persist, export, particle accent subtlety, clip, legibility
- GPU observation section: 4 items (G-1..G-4) with chrome://gpu instructions and canvas-count checks for all four pages
- Combined Sign-Off section: engineering gate status table, owner perceptual verdict table, explicit DoD with "approved on the projector" phrase
- 07-01 engineering-gate tables preserved verbatim (tsc-0 PASS, repo-map PASS, boundary PASS, GraphCanvas PASS, Playwright BLOCKED)

## Task Commits

1. **Task 1: UAT-RUNBOOK.md** - `8843f97d` (docs)
2. **Task 2: UAT-REPORT.md perceptual checklist + sign-off** - `ba3863a0` (docs)

## Files Created / Modified

- `.planning/phases/07-pre-workshop-uat/UAT-RUNBOOK.md` — created (274 lines): owner runbook, 5 numbered steps, build isolation, exact commands, gate invocation, projector pass, promote-on-sign-off, recovery
- `.planning/phases/07-pre-workshop-uat/UAT-REPORT.md` — modified: 34 lines replaced (stub) + 124 new lines (full checklist + sign-off section); engineering tables from 07-01 intact

## Deviations from Plan

None — plan executed exactly as written. Both files produced exactly match the plan spec:
- UAT-RUNBOOK.md: 274 lines (>= 50 required), references :3100 (15 occurrences), references run-engineering-gates (multiple), never instructs building while :3000 is live (STEP 0 enforces isolation first)
- UAT-REPORT.md: Owner Perceptual Checklist with all four pages at equal depth, GPU observation, blocker-bar definition, Combined Sign-Off with "approved on the projector" DoD; engineering tables intact

## Known Stubs

None. All checklist items are structured for the owner to fill in during the live projector pass (Task 3). The stub-like `[ ]` checkboxes and `_(fill in)_` fields in the Combined Sign-Off are intentional — they are the owner's recording surface, not implementation gaps.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. This plan creates documentation only.

## Self-Check

- [x] UAT-RUNBOOK.md exists: FOUND at .planning/phases/07-pre-workshop-uat/UAT-RUNBOOK.md
- [x] UAT-RUNBOOK.md references :3100: CONFIRMED (15 occurrences)
- [x] UAT-RUNBOOK.md references run-engineering-gates: CONFIRMED
- [x] UAT-RUNBOOK.md >= 50 lines: CONFIRMED (274 lines)
- [x] UAT-REPORT.md Owner Perceptual Checklist present: CONFIRMED
- [x] UAT-REPORT.md references projector: CONFIRMED
- [x] UAT-REPORT.md covers forma-proposal: CONFIRMED
- [x] UAT-REPORT.md engineering-gate tables intact (PASS/BLOCKED rows): CONFIRMED
- [x] UAT-REPORT.md Combined Sign-Off section present: CONFIRMED
- [x] Commit 8843f97d exists: CONFIRMED
- [x] Commit ba3863a0 exists: CONFIRMED
- [x] git diff --cached --name-only clean after each commit: CONFIRMED (only target file staged each time)

## Self-Check: PASSED

## Next Step

Task 3 (blocking-human checkpoint) RESOLVED on 2026-06-19. The owner built/served the UAT copy on :3100, ran the gate wrapper to ALL-GREEN, walked the Owner Perceptual Checklist on the secondary display at projector-reduced brightness (all four pages, both themes), cleared every BLOCK, and recorded **"approved on the projector"** in the Combined Sign-Off section of UAT-REPORT.md. Phase 7 DoD met.

---
*Phase: 07-pre-workshop-uat*
*Completed (Tasks 1-3): 2026-06-19*
*Status: COMPLETE — owner recorded "approved on the projector"; engineering report ALL-GREEN; every BLOCK cleared*
