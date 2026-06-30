---
phase: 11-data-truthfulness-labels
plan: "01"
subsystem: documentation
tags: [TRUTH-04, integrations-doc, role-fallback, AccDcRole, AccRole]
dependency_graph:
  requires: []
  provides: [TRUTH-04-docs]
  affects: [INTEGRATIONS.md]
tech_stack:
  added: []
  patterns: [candid-label-doc, downstream-views-must-label]
key_files:
  created: []
  modified:
    - .planning/codebase/INTEGRATIONS.md
decisions:
  - "mergeRoleNames confirmed in lib/server/accessInstanceView.ts (not lib/acc/)"
  - "DC wins on conflict by design (snapshot architecture); live AccRole is fallback baseline"
  - "Silent-drop behavior when neither source resolves a roleId — documented in INTEGRATIONS.md"
metrics:
  duration_minutes: 1
  completed: "2026-06-30"
  tasks_completed: 2
  files_changed: 1
status: complete
---

# Phase 11 Plan 01: TRUTH-04 Role-Fallback Documentation Summary

Document the `AccDcRole`-empty → `AccRole` role-name fallback and DC-conflict behavior in `INTEGRATIONS.md`, closing TRUTH-04 / CONCERNS §2.4.

## What Was Done

**Task 1 — Grounding pass (no file writes):**

Located and read `lib/server/accessInstanceView.ts` (lines 21-36, 89-106) and `lib/server/accessInstanceView.test.ts`. Confirmed the following facts from source before writing documentation:

- `mergeRoleNames` lives in `lib/server/accessInstanceView.ts` (line 28), NOT in `lib/acc/`. The existing INTEGRATIONS.md one-liner said "via `mergeRoleNames`" without a path; the expanded doc now cites the exact file.
- `AccDcRole` schema fields: `id` (String @id), `name`, `accountId?`, `ingestRunId`, `ingestedAt`.
- `AccRole` schema fields: `id` (String @id — APS role ID), `accountId`, `name`, `memberCount`, `syncedAt`, `projectRoles`.
- Both models share the same APS role ID on their `id` field — that is the merge key.
- **Conflict behavior:** `mergeRoleNames(dc, live)` loads `AccRole` entries first, then applies `AccDcRole` entries on top. DC wins on conflict. Code comment: "DC overrides live".
- **Neither-resolves behavior:** `buildInstanceView` skips any `AccDcProjectUserRole` row whose `roleId` is absent from the merged map (`if (!name) continue`). Assignment is silently dropped — no error, no placeholder.
- Test `lib/server/accessInstanceView.test.ts` covers both the fallback case ("roles=0 regression") and the DC-wins case.

**Task 2 — INTEGRATIONS.md expansion (commit 81766701):**

Added a `**Role-name fallback (`AccDcRole` → `AccRole`):**` subsection to `.planning/codebase/INTEGRATIONS.md`, placed directly after the existing known-gap bullets within the ACC Data Connector section. The new block covers:

1. Why `AccDcRole` is permanently empty.
2. How `mergeRoleNames` in `lib/server/accessInstanceView.ts` builds the merged map.
3. Load order and DC-wins precedence.
4. Silent-drop join behavior when no source resolves a roleId.
5. Conflict behavior for a future state where DC delivers `admin_roles.csv`.
6. Downstream label requirement: role names reflect live APS state, not DC snapshot date.

The wording reuses the candid "downstream views must label this" precedent already established in the ACCDS section (line ~104 in the pre-edit file), per TRUTH-04 and the plan's voice guidance.

## Changed Files

| File | Action | Description |
|------|--------|-------------|
| `.planning/codebase/INTEGRATIONS.md` | Modified | +36 lines: expanded role-fallback subsection under ACC Data Connector |

## Verification Evidence

```
$ rg -n "AccDcRole" ".planning/codebase/INTEGRATIONS.md"
63: ...AccDcRole... (prisma models list)
64: Known gap: AccDcRole permanently empty (DC never sends admin_roles.csv)...
67: **Role-name fallback (`AccDcRole` → `AccRole`):**
69: The DC snapshot architecture intended `AccDcRole`...
71: `AccDcRole` is permanently empty...
80: All `AccDcRole` rows are applied on top — DC wins on conflict...
83: Both models use the same APS role ID as the primary key (AccRole.id / AccDcRole.id)...
93: Conflict behavior when DC supplies a name: If `AccDcRole` is ever populated...
214: AccDcRole permanently empty — DC never delivers admin_roles.csv (pre-existing line)
```

- Cited module path `lib/server/accessInstanceView.ts` matches Task 1 source discovery.
- No literal secrets, tokens, or DATABASE_URL values added.
- `git diff --cached --name-only` at commit time showed only `.planning/codebase/INTEGRATIONS.md`.
- No app code changed; no `/users/spatial-graph` files touched.
- No build/tsc gate needed — pure `.planning/` markdown doc.

## Dashboard Self-Check

- **Context:** 11-01-PLAN.md, 11-CONTEXT.md, STATE.md, INTEGRATIONS.md (full), accessInstanceView.ts, accessInstanceView.test.ts, prisma/schema.prisma (AccDcRole + AccRole models) all read.
- **Evidence:** `mergeRoleNames` confirmed at `lib/server/accessInstanceView.ts:28`; Prisma model fields confirmed from `prisma/schema.prisma`; conflict precedence confirmed from source code comment + Vitest tests.
- **Constraints:** Documentation-only; no code, no UI, no tsc/rebuild; zinc theme / WebGL / `/users/spatial-graph` constraints all inapplicable (no app changes). Local Secret Hygiene: no env values embedded.
- **Gates:** `rg` check only — correct for a `.planning/` markdown change. No tsc/rebuild needed.
- **VERIFY:** none — all claims grounded in source.

## Deviations from Plan

**1. [Rule 1 - Clarification] Corrected implicit module path in source**
- The existing INTEGRATIONS.md one-liner said "role names sourced from live `AccRole` via `mergeRoleNames`" without a path. The function actually lives in `lib/server/accessInstanceView.ts`, not `lib/acc/`.
- The expanded documentation now cites the exact verified path. This is a clarification in documentation accuracy, not a code deviation.

No other deviations. Plan executed exactly as written.

## Known Stubs

None. This is a pure documentation plan; no UI data wiring or stub values introduced.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Documentation-only change; threat model entry T-11-01 (information disclosure / accept) applies — doc records architecture facts already in the repo.

## Self-Check: PASSED

- [x] `.planning/codebase/INTEGRATIONS.md` exists with expanded fallback subsection
- [x] Commit `81766701` exists on `feat/access-analysis-redesign`
- [x] Cited module path `lib/server/accessInstanceView.ts` verified from source
- [x] No unrelated WIP files staged or modified
