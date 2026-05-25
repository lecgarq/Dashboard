# P6 Task 0 — Enriched-Field Coverage Gate

Date: 2026-05-25
Branch: `feat/access-analysis-redesign`
Mode: READ-ONLY measurement (no runtime code changed)
Script: `scripts/scratch/p6-enriched-field-coverage.cjs`
DB: local PG 18, `postgresql://postgres@127.0.0.1:5432/dashboard` (trust auth, localhost)

## Verdict

**GATE PASSES.** All five P6 dimension fields have real, non-trivial coverage on
the live local Postgres data. The node total reconciles **exactly** to the 16,942
baseline (delta 0). **No field is near-zero** (none is >95% missing). The two
lowest-coverage fields (activityRecency and activityMix, both 14.7%) are bounded
by real data sparsity (activity ingest scope + uncrawled projects), not by a
broken feed wiring.

## Coverage table

Node universe = 16,942 instances (one per `AccDcProjectUser` row, id = `lower(email)::projectId`).

| P6 field | PG source column(s) | count | % coverage | confidence | recommendation |
|---|---|---|---|---|---|
| `membershipBucket` | `AccDcProjectUser.addedOn` (non-null) | 16,942 | 100.0% | high | **SHIP** — fully populated; prior "addedOn not wired" concern is superseded |
| `activityRecencyBucket` | `AccActivity` last-activity (`email::projectId`, `sourceFile='project'`) → fallback `AccDcProjectUser.lastSignIn` | 2,484 | 14.7% | high | **SHIP** — non-trivial; the other 85.3% legitimately bucket to "none" |
| `permissionStrength` | MAX folder-grant tier via `AccDcProjectUserRole`→`AccFolderPermission`→`AccFolder`→`AccProject` (crawled only), strength>0 | 3,549 | 20.9% | high | **SHIP** — non-trivial; ceiling is crawl coverage (308/428 projects crawled "ok") |
| `riskScore` | derived (replicated `computeRiskFlags`) from isExternal, isAdmin, account `lastSignIn`, status, permStrength, folderBreadth, activityTotal; score>0 | 8,885 | 52.4% | medium-high | **SHIP** — strong coverage; see approximation caveat below |
| `activityMix` | `AccActivity` grouped categories (`email::projectId`, `sourceFile='project'`), non-empty | 2,484 | 14.7% | high | **SHIP** — same activity-join population as activityRecency |

## 16,942 reconciliation

| measure | value |
|---|---|
| `AccDcProjectUser` rows (all) | 16,942 |
| instances (`projectId <> ''`) | **16,942** |
| distinct users / projects | 3,367 / 428 |
| instances with resolvable email | 16,942 (100%) |
| baseline target | 16,942 |
| **delta** | **0** |

Exact match. `AccDcProjectUser` carries no `projectId=''` admin-sentinel rows (that
sentinel is an `AccActivity` concern), and every instance's `userId` resolves to an
`AccDcUser` with a non-empty email, so the node id `lower(email)::projectId` is
well-defined for all 16,942.

## Near-zero check (the gate)

No field is near-zero. For completeness, one **underlying input** IS fully null and
worth flagging because it changes how two derived fields behave:

- 🟡 **`AccDcProjectUser.lastSignIn` is 100% NULL** (0 / 16,942 non-null). The
  Data Connector instance-level sign-in column is simply not populated in this
  snapshot. Consequences:
  1. `activityRecencyBucket`'s documented sign-in fallback contributes **nothing**;
     its 14.7% coverage is *entirely* the `AccActivity` join. The field is still
     fine to ship, but its label should read "last activity," not "last sign-in."
  2. This is the **instance** column. The **account-level** `AccDcUser.lastSignIn`
     (used by `signinBucket` / riskFlags `cold`) is a separate column and is what
     drives `staleButActive` — see caveat below.

## riskScore approximation (documented)

`riskScore = count of true primitives (0..5)`. The script replicates
`computeRiskFlags` per instance in SQL with **real** inputs and counts `riskScore>0`
as "any primitive true." Primitive breakdown:

| primitive | rule replicated | count |
|---|---|---|
| `externalHighPerm` | external domain ∧ permStrength≥4 | 246 |
| `staleButActive` | cold (account lastSignIn null or >90d) ∧ status='active' ∧ hasAccess | 7,405 |
| `externalProjectAdmin` | external domain ∧ any product accessLevel='project_admin' | 70 |
| `broadFolderAccess` | distinct folderBreadth ≥ 25 | 3,220 |
| `highActivityHighPerm` | activityTotal≥100 ∧ permStrength≥4 | 108 |
| **ANY (riskScore>0)** | | **8,885 (52.4%)** |

Approximation caveats (why confidence is medium-high, not high):
- **`hasAccess` is hardcoded `true`** in the runtime (`featureSnapshot.ts`: "instance
  is in the feed → real membership"), so the script matches that. `staleButActive`
  therefore reduces to `cold ∧ status='active'`.
- **`cold` is dominated by null account sign-in.** `bucketSignin(null) === '>90d'`,
  so any instance whose `AccDcUser.lastSignIn` is null counts as cold. This is the
  single biggest risk contributor (7,405) and is partly an artifact of sparse
  sign-in data rather than genuine staleness. The runtime behaves identically, so
  the count is *faithful to production*, but the controller should know the score
  leans heavily on one weakly-populated input.
- internal/external uses the canonical `hermosillo.com` rule; unknown/malformed
  emails are treated as not-external (matches `internalDomains.classifyAffiliation`).

## Traps checked

| trap | finding |
|---|---|
| `@lecg.com` matches 0 users | ✅ confirmed 0 — did NOT use it; used `hermosillo.com` |
| `hermosillo.com` is the real internal domain | ✅ 1,265 internal users |
| `projectId=''` admin sentinel must not fold into instances | ✅ `AccDcProjectUser` has 0 such rows; `AccActivity` has 714 admin-sentinel rows, all excluded via `projectId<>''` and `sourceFile='project'` |
| sign-in recency ≠ activity recency | ✅ kept distinct: activityRecency uses `AccActivity` join (+null instance-signin fallback); risk `cold` uses account `AccDcUser.lastSignIn` |
| activity join key | ✅ `lower(email)::projectId`, matching `dcUserAssembly` `activityByInstance` key and the hot-cache groupBy filter |

## Supporting data facts (verified)

- `AccDcProjectUser.lastSignIn`: 0 / 16,942 non-null (instance sign-in absent).
- `AccProject.folderCrawlStatus`: ok=308, never=803, inaccessible=41 → only 308
  crawled projects supply folder grants, capping `permissionStrength` (20.9%) and
  `broadFolderAccess`.
- Activity-derived fields (recency, mix) reach 2,484 instances — the subset with
  `sourceFile='project'` activity rows joinable by `email::projectId`.

## Recommendation summary

Ship all five. Two non-blocking notes for the controller:
1. Label `activityRecencyBucket` as activity-based recency (instance sign-in input is 100% null).
2. `riskScore` is faithful to production but leans on the weakly-populated account
   sign-in (`cold`) input; consider down-weighting `staleButActive` or sourcing a
   better last-active signal in a later phase.
