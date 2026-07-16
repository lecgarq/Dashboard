# 29-01 Summary — Hybrid feature export (TS half)

**Status:** COMPLETE · **Commit:** `31ecc672` · **Requirements:** EMB-01, EMB-02 (TS boundary)

## What shipped

- **NEW `app/(dashboard)/users/access-analysis/instanceFeatureNumerics.ts`** —
  `InstanceFeatureNumerics` (all `number | null`) + extractor. Raw values only; python
  owns normalization. Explicit-null missing semantics (`?? null`;
  `permissionStrength` via `typeof === "number"` so 0 survives). Top-of-file comment
  block is the EMB-01 rationale table: 8 categorical token groups + 6 numerics included;
  project identity (D5), signinBucket, membershipBucket, moduleFlags, riskFlags,
  activityMix/actionCounts excluded — one line each.
- **NEW `instanceFeatureNumerics.test.ts`** — 3 tests: raw passthrough, all-missing →
  all-null (never 0), falsy-zero trap (all-zero snapshot stays 0).
- **`instanceFeatureTokens.ts`** — added `cov:${f.permissionCoverage}` token
  (crawl coverage joins the similarity definition, CONTEXT data-truth).
- **`instanceFeatureTokens.test.ts`** — new test asserting `cov:known|partial|unknown`.
- **`scripts/build-instance-features.ts`** — jsonl line is now
  `{nodeId, tokens, numerics}` (additive; python loader tolerance handled in 29-02).

## Gate outcomes (exact)

- `npx vitest run instanceFeatureNumerics.test.ts instanceFeatureTokens.test.ts` →
  **Test Files 2 passed (2) · Tests 8 passed (8)** (vitest 4.1.10).
- `npx tsc --noEmit` → exit 0, no output.
- Repo-map gate not required (no router/Prisma/architecture change; sibling module in an
  existing directory).

## Deviations

None. Plan executed as written.

## Follow-ups / debt

None new. The `.embedding/instance-features.jsonl` on disk (if any) is now stale-shape
until 29-03 regenerates it — harmless, pipeline reruns from scratch.
