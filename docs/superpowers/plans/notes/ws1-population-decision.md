# WS1 Task 1 — Node Population Decision

**Date:** 2026-05-20
**Status:** Approved by user

## Decision

The access-analysis graph population is **"DC users with ≥1 project membership"** — sourced from `AccDcUser` joined to `AccDcProjectUser`, NOT the legacy `AccMemberCache` path.

## Measured ground truth (local `dashboard` DB)

| Metric | Count |
|--------|-------|
| Legacy cache universe (old graph) | 1,223 (882 ACC + 341 directory) |
| `AccMemberCache` rows total | 3,955 |
| `AccDcUser` total | 3,367 (2,728 active / 639 inactive) |
| **DC users with ≥1 project membership (node population)** | **3,367** (0 orphans) |
| DC users with no project membership (excluded) | 0 |
| DC users missing from the legacy cache | 551 |
| Cache-only entries (excluded as directory/stale/non-ACC) | 1,136 |

## Key distinctions (record explicitly)

- **User universe = 3,367 users.**
- **Render / analysis instances ≈ 16,934 user-project instances** (`userId::projectId`; one node per (user, project) pair = `AccDcProjectUser` row count). The graph renders instances, not users.

## Rationale

- The graph must represent real ACC relationships, not the legacy cache.
- DC source **adds 551 real ACC users** the old graph silently omitted.
- DC source **drops 1,136 cache-only / stale / non-ACC entries** that have no ACC relationships.
- **Do NOT cap to active users only.** Inactive users remain analytically useful — they expose stale access, over-permissioned accounts, and cleanup opportunities.

## WS2 performance risk (carry forward)

The current pairwise similarity approach (`lib/acc/userSimilarity.ts` `topKNeighbors`, O(n²), comment: "acceptable up to ~2,000 users") is **NOT acceptable at ~16,934 instances if it scans globally**. WS2 must avoid a full O(n²) comparison and use **blocking / indexing first** — group candidates by shared project, shared model, shared folder, and firm (where appropriate) before any pairwise scoring. This is a WS2 design requirement, not a WS1 change.
