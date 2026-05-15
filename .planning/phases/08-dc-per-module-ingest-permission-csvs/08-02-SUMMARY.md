---
phase: 08-dc-per-module-ingest-permission-csvs
plan: 02
subsystem: acc-dc-ingest
tags: [bot-filter, anomaly-checks, pure-module, tdd]
requires:
  - 08-01 (Wave-0 schema foundation; AccDcUser + AccDcProject tables exist)
provides:
  - "lib/acc/dcKnownBots.ts: KNOWN_BOT_NAMES, KNOWN_BOT_AUTODESK_IDS, isBotActor"
  - "lib/acc/dcAnomalyChecks.ts: AnomalyError, AnomalyThresholds, PreviousRunMetrics, DEFAULT_THRESHOLDS, assertNoAnomalies"
affects:
  - "Plan 08-04 (dcActivityCsvIngest) — must import { isBotActor } at parse boundary"
  - "Plan 08-05 (dcAdminCsvIngest) — must import { assertNoAnomalies } inside transaction"
tech-stack:
  added: []
  patterns:
    - "Pure-module TDD (no Prisma runtime, no fetch, no fs)"
    - "Mocked Prisma.TransactionClient via vi.fn for unit testing without DB spin-up"
key-files:
  created:
    - lib/acc/dcKnownBots.ts
    - lib/acc/dcAnomalyChecks.ts
  modified:
    - lib/acc/dcKnownBots.test.ts
    - lib/acc/dcAnomalyChecks.test.ts
decisions:
  - "Bootstrap KNOWN_BOT_NAMES = 6 entries from RESEARCH.md Example 2 (Autodesk Cloud Worker, Construction Cloud Sync, BIM 360 System, ACC System, Autodesk Insight, Autodesk Service Account)"
  - "KNOWN_BOT_AUTODESK_IDS starts empty; operators may extend at runtime when an APS bot is identified by stable ID rather than display name"
  - "isBotActor checks autodeskId FIRST (more reliable when present), then name — single false-positive on a real user named like a bot is preferable to a single false-negative letting a bot bypass"
  - "DEFAULT_THRESHOLDS: maxUserDropPct=10, maxProjectDropPct=5, requireAllAdminCsvs=true, requireNonZeroInsert=true (per RESEARCH.md Pattern 4)"
  - "assertNoAnomalies(previous=null) returns silently — first-ever ingest cannot be blocked by missing baseline; cold-start safe"
  - "currentRowsByAdminCsv parameter is OPTIONAL — only required when caller wants requireNonZeroInsert/requireAllAdminCsvs evaluation; user/project drop checks always run"
  - "Prisma import is type-only (`import type { Prisma } from '@prisma/client'`) — module stays pure at runtime"
  - "guard `if (previous.userCount > 0)` before computing drop pct — avoids divide-by-zero when previous run had 0 users (e.g., post-disaster recovery)"
metrics:
  duration: ~7min
  completed: "2026-05-15T18:20:00Z"
  tasks: 2
  files: 4
  commits: 4
---

# Phase 8 Plan 02: Bot Filter + Anomaly Checks Summary

**One-liner:** Two pure libraries — bot-actor filter (DC8-02, drops Autodesk system rows at parse boundary) and anomaly checks (DC8-09, throws inside transaction to roll back snapshots with > 10% user drop or > 5% project drop) — built TDD with mocked Prisma tx, 16/16 Vitest GREEN.

## What Shipped

### lib/acc/dcKnownBots.ts (36 lines)

- `KNOWN_BOT_NAMES: Set<string>` — 6 bootstrap entries
- `KNOWN_BOT_AUTODESK_IDS: Set<string>` — empty, runtime-extensible
- `isBotActor({ name?, autodeskId? }) => boolean` — autodeskId first, then name
- 9/9 Vitest GREEN

### lib/acc/dcAnomalyChecks.ts (108 lines)

- `class AnomalyError extends Error` (name = `'AnomalyError'`)
- `interface AnomalyThresholds` + `interface PreviousRunMetrics`
- `DEFAULT_THRESHOLDS = { maxUserDropPct: 10, maxProjectDropPct: 5, requireAllAdminCsvs: true, requireNonZeroInsert: true }`
- `async assertNoAnomalies(tx, previous, thresholds?, currentRowsByAdminCsv?)`
  - silent when `previous == null`
  - throws `AnomalyError` with descriptive message on threshold violation
  - per-CSV gates only run when `currentRowsByAdminCsv` provided
- 7/7 Vitest GREEN

## Bot Names Shipped

| Name                       | Source            |
| -------------------------- | ----------------- |
| Autodesk Cloud Worker      | RESEARCH Example 2 |
| Construction Cloud Sync    | RESEARCH Example 2 |
| BIM 360 System             | RESEARCH Example 2 |
| ACC System                 | RESEARCH Example 2 |
| Autodesk Insight           | RESEARCH Example 2 |
| Autodesk Service Account   | RESEARCH Example 2 |

## Anomaly Thresholds Chosen

| Threshold              | Default | Rationale                                                                  |
| ---------------------- | ------- | -------------------------------------------------------------------------- |
| maxUserDropPct         | 10      | Per RESEARCH Pattern 4; matches CONTEXT directive ("DC wins on conflict"). |
| maxProjectDropPct      | 5       | Tighter than user drop — projects rarely churn day-to-day.                 |
| requireAllAdminCsvs    | true    | Missing CSV in current run vs previous = APS export incomplete.            |
| requireNonZeroInsert   | true    | A CSV that previously had rows producing 0 today = parse failure.          |

## Test Counts

| Module             | Cases | Status |
| ------------------ | ----- | ------ |
| dcKnownBots        | 9     | GREEN  |
| dcAnomalyChecks    | 7     | GREEN  |
| **Total**          | 16    | GREEN  |

## Commits

- `25c5187` — test(08-02): add failing tests for isBotActor (RED)
- `88216a5` — feat(08-02): implement dcKnownBots (GREEN, 9/9)
- `d5f9986` — test(08-02): add failing tests for assertNoAnomalies (RED)
- `b87290c` — feat(08-02): implement dcAnomalyChecks (GREEN, 7/7)

## Deviations from Plan

None — plan executed exactly as written. Both modules under 150-line guideline (36 + 108 = 144 total). No Rule 1-3 fixes needed.

## Downstream Hand-off

- **Plan 08-04 (dcActivityCsvIngest)** — `import { isBotActor } from './dcKnownBots'`; drop rows where `isBotActor({ name: row.actorName, autodeskId: row.actorId })`.
- **Plan 08-05 (dcAdminCsvIngest)** — inside `prisma.$transaction(async (tx) => { ... await assertNoAnomalies(tx, previousMetrics, DEFAULT_THRESHOLDS, currentRowsByAdminCsv) })`. Caller is responsible for fetching/persisting `PreviousRunMetrics` (likely via `AccDcIngestRun.metricsJson` round-trip).

## Self-Check: PASSED

- `lib/acc/dcKnownBots.ts` — FOUND
- `lib/acc/dcAnomalyChecks.ts` — FOUND
- `lib/acc/dcKnownBots.test.ts` — FOUND (modified)
- `lib/acc/dcAnomalyChecks.test.ts` — FOUND (modified)
- Commits `25c5187`, `88216a5`, `d5f9986`, `b87290c` — FOUND in git log
- 16/16 Vitest GREEN verified
