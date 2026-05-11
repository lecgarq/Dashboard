---
phase: 02-core-extraction
verified: 2026-05-11T17:50:00Z
status: passed
score: 11/11 must-haves verified
---

# Phase 02: Core Extraction Verification Report

**Phase Goal:** Extract ACC core data (Members, Projects, Roles) into the new v2.0 schema and dual-write to AccMemberCache so the v1.0 dashboard continues to function. End state: every Railway release triggers a real Quick Sync that populates AccProject, AccRole, AccProjectMember, AccProjectRole, and AccMemberCache.
**Verified:** 2026-05-11
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (aggregated from 4 plans + orchestrator goal)

| #   | Truth                                                                                                                | Status     | Evidence                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | All APS projects become AccProject rows; deleted projects soft-deleted (status="inactive")                           | VERIFIED   | `quick-sync-extraction.ts:103-145` upsert + set-difference soft delete; pagination sentinel `results.length < PROJECT_PAGE_SIZE` at L85                   |
| 2   | All hub industry_roles become AccRole rows keyed by APS opaque ID                                                    | VERIFIED   | `extractAndPersistHubRoles` L220-247 calls `prisma.accRole.upsert({ where: { id }, ... })`                                                                 |
| 3   | Per-project members fetched with `?fields=` hardcoded so lastSignIn always returned                                  | VERIFIED   | MEMBER_FIELDS constant L262-263 includes literal `lastSignIn`; key-presence check L357-363 logs warning if absent                                          |
| 4   | AccProjectMember persists status, companyName, phone (flattened), addedOn, products map, projectAdmin, executive    | VERIFIED   | upsert at L588-620 includes all required columns; `normalizeProducts` L284-298 alias-maps documentManagement→docs, fieldManagement→build, costManagement→cost |
| 5   | Per-project industry roles populate AccRole + AccProjectRole with default access levels                              | VERIFIED   | `extractAndPersistProjectData` L491-548: AccRole upsert + "unassigned" AccProjectRole row via findFirst+create/update fallback (Prisma null compound key) |
| 6   | Member roles[] names resolve to AccRole IDs via per-project map; unresolved names warn but don't crash               | VERIFIED   | `roleNameToId` lowercase Map L511-513; unresolved name path warns at L628-630 without throw                                                                |
| 7   | Per-project extraction runs at pLimit(5); skip-and-continue on per-project failure                                   | VERIFIED   | `runPerProjectFanOut` L688-723: `pLimit(5)` L700, try/catch with failures array L713-718                                                                  |
| 8   | AccMemberCache.data shape matches canonical BulkAccUser; round-trip through buildAccGraphSnapshot returns nodes>0    | VERIFIED   | `buildCacheBlob` L752-804 typed `: BulkAccUser`; round-trip test `quick-sync-extraction.test.ts:719-770` asserts `snapshot.nodes.length > 0` and 3 nodes  |
| 9   | scripts/release.cjs invokes Quick Sync via `npx tsx lib/acc/quick-sync-extraction.ts`                                | VERIFIED   | `release.cjs:110` `spawnSync("npx", ["tsx", "lib/acc/quick-sync-extraction.ts"], ...)`; non-zero exit throws → recordFailure + sendFailureAlertRaw fire   |
| 10  | All vitest suites pass for quick-sync-extraction.test.ts                                                             | VERIFIED   | `npx vitest run lib/acc/quick-sync-extraction.test.ts` → 22 tests pass                                                                                     |
| 11  | tsc --noEmit clean (no new type errors across phase 2 surface)                                                       | VERIFIED   | `npx tsc --noEmit` exits 0 with no output                                                                                                                  |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact                                  | Expected                                                                  | Status     | Details                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `lib/acc/quick-sync-extraction.ts`        | extractAndPersistProjects, extractAndPersistHubRoles, extractAndPersistProjectData, runPerProjectFanOut, buildCacheBlob, writeMemberCacheFromAggregator, runQuickSync | VERIFIED   | All 7 exports present (L103, L220, L483, L688, L752, L813, L848); 912-line module, substantive (not stub)        |
| `lib/acc/quick-sync-extraction.test.ts`   | Pagination, soft-delete, role mapping, normalizeProducts, role linking, skip-and-continue, buildCacheBlob, round-trip | VERIFIED   | 22 tests, all green; round-trip test asserts non-empty graph                                                       |
| `scripts/release.cjs`                     | runQuickSyncShell spawns the TS extractor; SyncMeta('quick','success') on clean exit | VERIFIED   | L103-146 implements spawn + SyncMeta upsert; module-level header comment L8 documents Phase 2 wiring             |

### Key Link Verification

| From                                | To                                                          | Via                                          | Status   | Details                                                                          |
| ----------------------------------- | ----------------------------------------------------------- | -------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| extractAndPersistProjects           | prisma.accProject.upsert + accProject.updateMany           | set-difference soft delete                   | WIRED    | L120 upsert; L128-138 findMany active+notIn + updateMany status="inactive"      |
| extractAndPersistHubRoles           | prisma.accRole.upsert                                       | per-role upsert keyed by APS id              | WIRED    | L228 upsert keyed by `id: role.id`                                              |
| fetchProjectMembers                 | MEMBER_FIELDS URL constant                                  | hardcoded `?fields=...,lastSignIn,...`        | WIRED    | L262-263 constant; L337 URL interpolation                                        |
| extractAndPersistProjectData        | accProjectMember.upsert + accProjectRole.upsert            | name→ID via roleNameToId                     | WIRED    | L511-513 lowercase map; L633-652 upsert with resolved roleId + memberId         |
| per-project fan-out                 | pLimit(5)                                                   | p-limit                                      | WIRED    | L700 `pLimit(5)`                                                                |
| buildCacheBlob                      | BulkAccUser type                                            | import from lib/acc/acc-types                | WIRED    | L18 `import type { BulkAccUser, BulkAccProject } from "./acc-types"`            |
| writeMemberCacheFromAggregator      | prisma.accMemberCache.upsert (by email)                    | one upsert per aggregator entry              | WIRED    | L822 `prisma.accMemberCache.upsert({ where: { email }, ... })`                  |
| scripts/release.cjs runQuickSyncShell | spawnSync npx tsx lib/acc/quick-sync-extraction.ts        | CJS → TS invocation bridge                   | WIRED    | release.cjs:110; failure throws → recordFailure + sendFailureAlertRaw           |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                                              | Status    | Evidence                                                                                          |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------- |
| PROJ-01     | 02-01       | Projects extracted with pagination; type/name/jobNumber/accountId/createdAt persisted                                    | SATISFIED | extractAndPersistProjects + RawProject mapping; pagination test pinned                              |
| PROJ-02     | 02-01       | Project list refresh integrated into Quick Sync; deleted projects marked inactive                                        | SATISFIED | Set-difference soft delete L127-138; runQuickSync sequences extractAndPersistProjects               |
| ROLE-01     | 02-02       | Hub master roles extracted and persisted in AccRole                                                                      | SATISFIED | extractAndPersistHubRoles L220-247                                                                  |
| ROLE-02     | 02-03       | Per-project industry roles persisted, joined via AccProjectRole                                                          | SATISFIED | fetchProjectRoles L394-436 + AccProjectRole upserts L520-548, L633-653                              |
| ROLE-03     | 02-03       | Default access levels (docs.access_level, project_administration.access_level) persisted with each AccProjectRole row    | SATISFIED | docsAccessLevel + projectAdminAccessLevel mapped at L425-432 and stored at L543-544, L645-646      |
| MEM-01      | 02-03       | Members fetched with `?fields=` hardcoded so lastSignIn always returned                                                  | SATISFIED | MEMBER_FIELDS L262-263 literal lastSignIn; key-presence check L357-363                              |
| MEM-02      | 02-03       | Members persisted with status, companyName, phone, addedOn                                                               | SATISFIED | upsert payload L588-620; phone flattened from object L576-581                                       |
| MEM-03      | 02-03       | Full products array persisted with per-module tier (alias-normalized)                                                    | SATISFIED | normalizeProducts L284-298 with PRODUCT_ALIASES map; products column on AccProjectMember            |
| MEM-04      | 02-03       | accessLevels.projectAdmin and accessLevels.executive persisted distinctly                                                | SATISFIED | L584-585 projectAdmin/executive read; columns on AccProjectMember                                   |
| MEM-05      | 02-03       | Per-project role assignments persisted in AccProjectRole (member × project × role)                                       | SATISFIED | L633-653 AccProjectRole upsert per resolved role per member                                         |
| MEM-06      | 02-04       | Existing accMemberCache continues to be written (dual-write contract)                                                    | SATISFIED | buildCacheBlob typed `: BulkAccUser` + writeMemberCacheFromAggregator + round-trip test green       |

No orphaned requirement IDs detected — every ID listed in REQUIREMENTS.md against Phase 2 appears in at least one plan's frontmatter.

### Anti-Patterns Found

| File                                   | Line | Pattern   | Severity | Impact                          |
| -------------------------------------- | ---- | --------- | -------- | ------------------------------- |
| (none)                                 | -    | -         | -        | No TODO/FIXME/XXX/HACK/PLACEHOLDER occurrences in quick-sync-extraction.ts or release.cjs |

Acknowledged v2.0 degradation (documented, not an anti-pattern): `companyRole: null` and `isAccountAdmin: false` for all users until HQ v1 prefetch is reintroduced. This is documented in L728-734 and emitted as a runtime warning at runQuickSync start (L858-860).

### Human Verification Required

None blocking — but recommended (not required for goal-pass):
1. Trigger a Railway release and confirm a real Quick Sync run populates AccProject/AccRole/AccProjectMember/AccProjectRole/AccMemberCache against the live tenant.
2. Spot-check the dashboard graph view after release — confirms the dual-write contract holds end-to-end against production data (the round-trip test pins this against synthetic data; live data is the final acceptance).

### Gaps Summary

No gaps. All 11 must-haves verified. All 11 phase requirements satisfied. tsc clean. 22/22 vitest tests pass. Production wiring (release.cjs → tsx → quick-sync-extraction.ts) is in place with failure paths preserved (recordFailure + sendFailureAlertRaw on non-zero exit).

Two intentional v2.0 deferrals are documented in code and ROADMAP (HQ v1 enrichment for `companyRole` and `isAccountAdmin`) — these do not block the phase goal because v1.0 cache continuity is preserved (null companyRole renders as "Unspecified"; existing bulkAccSync remains source of truth for hub admin status until a later cleanup phase).

---

_Verified: 2026-05-11_
_Verifier: Claude (gsd-verifier)_
