# Deep Findings → Compliance Panel — Design

**Date:** 2026-05-21
**Status:** Approved (chat), implementing
**Goal:** Surface the "deep findings / levels warnings" that today live only in throwaway
`scripts/scratch/acc-levelN-*.cjs` console scripts. Port a curated top-10 set into a
server endpoint so they appear in the existing **Active Security & Compliance Audit** panel.

## Problem

The level scripts (`acc-level2…level8`) `console.log` to a terminal and query Postgres
directly. They are never persisted or exposed via tRPC, so the dashboard cannot show them.
The live panels compute their own narrow logic:
- `governanceCompliance.ts` → 4 rules (`external-admin`, `stale-admin`, `dormant-controller`, `time-anomaly`).
- `getPermissionRiskScorecard` → Level 2 path anomalies only.

Levels 4–8 have **no path into the UI**.

## Scope — curated top 10 (spans L4–L8)

| # | Finding | Source script / warning | Severity | Subject |
|---|---|---|---|---|
| 1 | External (non-@hermosillo.com/@lecg.mx) users with `View+Download+Upload+Edit` or `Full Controller` perms | level8 #51 | critical | user |
| 2 | Data hoarding "mole" — downloads ≥15, views ≤2 | level8 #52 | critical | user |
| 3 | Activity logged after `remove-member` (post-removal) | level4 #28 | critical | user |
| 4 | ISO 19650 breach — write/control on Shared/Published folders by non-governing roles | level8 #53 | warning | folder |
| 5 | Velocity spike — single-day peak ≥10× personal daily avg | level4 #21 | warning | user |
| 6 | Email domain ≠ registered company (Hermosillo mismatch, both directions) | level4 #26 | warning | user |
| 7 | Role-permission drift — role with ≥3 distinct permTypes across projects | level5 #30 | warning | role |
| 8 | Sensitive (payroll/insurance/penalty) folders with non-"No Access" perms | level6 #44 | info | folder |
| 9 | Shadow module usage — acting in a service not provisioned for the project | level7 #45 | info | user |
| 10 | Role synonym duplication (Architect / Arquitecto) | level5 #29 | info | role |

SQL is lifted verbatim from the named scripts; findings 9 and 10 keep their JS post-processing
(semantic module validator; accent-stripped synonym grouping).

## Architecture

New module **`lib/acc/deepFindings.ts`**:
- One thin `fetchX(db)` per finding = the script's `$queryRaw` verbatim.
- One **pure** `mapX(rows[, now]): ComplianceViolation[]` per finding — shapes rows into the
  shared violation type (severity, title, description, recommendation, subjectLabel). Pure =
  unit-testable, mirrors `analyticsFindings.ts`.
- `analyzeDeepFindings(db, now?): Promise<ComplianceViolation[]>` — runs all fetchers in
  `Promise.allSettled`, each finding wrapped so one failed query never blanks the panel.

The existing `analyzeGovernanceCompliance` is **unchanged**. The router merges both result
sets and recomputes `score`/`metrics` over the combined violations.

## Shared type change (`governanceCompliance.ts`)

```ts
export interface ComplianceViolation {
  id: string;
  ruleId: string;                 // widened from the 4-value union
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  recommendation: string;         // NEW — each finding supplies its own action text
  subjectLabel?: string;          // NEW — folder path / role name when not user-scoped
  userEmail?: string;             // now optional
  userName?: string | null;
  projectName?: string | null;
  timestamp?: string | null;
  details: Record<string, unknown>;
}
```

Existing 4 rules get `recommendation` backfilled from the panel's current ruleId→action switch,
so they render identically.

## Caching & performance

`server/routers/acc-members.ts` wraps the **combined** compliance computation in a 15-minute
in-memory TTL cache (single long-running `next start` process → in-memory is sufficient). First
call after expiry runs the 10 queries in parallel; later calls are instant. Every query keeps
its script `LIMIT`.

## UI changes (`ComplianceScanPanel.tsx`)

- Render `violation.recommendation` instead of the hardcoded 4-way `ruleId` switch.
- Render identity rows (`userName`/`userEmail`) only when present; render `subjectLabel`
  (e.g. folder path or role name) when present.
- Counts and the score come from the merged set (no other layout change).

## Testing

- Unit-test the **pure mappers** (row → violation: severity, recommendation, subjectLabel,
  empty-input → []). New file `lib/acc/deepFindings.test.ts`.
- `governanceCompliance.test.ts` stays untouched.
- Raw SQL is not unit-tested (matches existing pattern).

## Out of scope (later passes)

Remaining ~26 checks (weekend warriors, rubber-stamp, role monopoly, phantom/inflated roles,
naming violations, collisions, invisible/orphan folders, churn-and-burn, pre-deprovisioning,
impossible travel, shelfware, etc.) and any persisted/precomputed-during-sync model.
