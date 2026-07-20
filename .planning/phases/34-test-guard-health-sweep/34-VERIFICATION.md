# Phase 34 Verification — Test & Guard Health Sweep

**Date:** 2026-07-20 · **Milestone:** v2.6 Full-Rate Graph · **Plans:** 4/4 summarized
**Roadmap goal:** every automated gate the renderer work leans on is trustworthy.

## Per-requirement coverage

### E2E-01 — acc-dc-graph re-baselined green ✅

- **Shipped:** `tests/e2e/acc-dc-graph.spec.ts` (commit `c1b78647`): exact node
  pin 22,279 (Decision 1); all dead physics-shell/curated-slider selectors
  repointed to the v2.4+ surface (Group-into/strength, `toolbar-add-filter`
  aperture, Layout/Dimensions tabs, catalog tree, catalog-id color options,
  grouped-by General, focus-session camera contract); 3 tests newly gated to the
  parked 3D shell; 4 dead-feature deletions, each named in `34-04-SUMMARY.md`
  with a NOTE comment in the spec.
- **Gate:** baseline recorded 16F/5S/6P (29.7m) → final **16 passed / 8 skipped /
  0 failed (13.8m)** on the isolated `:3100` prod build
  (`playwright.verify.config.ts` harness). 0 drift failures remain.

### E2E-02 — lasso budget flake closed ✅

- **Shipped:** `tests/e2e/acc-3d-lasso.spec.ts` (commit `c1b78647`): inner
  `gotoGraph` readiness wait 120s→240s — the evidence-identified trip point (the
  body already carried a scoped 360s `test.setTimeout`, so the config 120s
  budget never governs). CONCERNS §3.4 marked CLOSED.
- **Gate:** three consecutive recorded flag-on passes on a
  `NEXT_PUBLIC_ACC_3D_GRAPH=1` isolated build: **44.7s / 37.6s / 37.9s** —
  each >3× under the old budget.

### TEST-04 — unit suite fully green ✅

- **Shipped:** `app/(dashboard)/users/access-analysis/usePredicateEngine.ts`
  (commit `49e1202c`). Verdict: **live product bug** (Decision 3 code-fix path) —
  Phase 27 (`1e5073ff`) narrowed `groupByDimensions()` to the curated Group-into
  list while the "+ Filter" aperture kept all 17 `PRESET_DIMENSION_IDS`; 7
  aperture dims (incl. `riskScore`) had no resolver → their filters dimmed every
  node. `buildApertureValueResolvers` now iterates the aperture id-space. Full
  rationale + repro in `34-02-SUMMARY.md`.
- **Gate:** 3 predicate files 21/21; **`npm test` → 339 passed | 1 skipped
  (2,629 tests passed, 0 failed)** — zero carried failures.

### GUARD-01 — powershell-wrap deny ✅

- **Shipped:** `.claude/hooks/guard-bash.cjs` (commits `50dd815c` WIP-first per
  Decision 4, then `63ef0aca`): wrapper detected on the stripped command, payload
  build-checked un-stripped, isolatedDist exemption honored inside the wrapper,
  `$env:` double-quote trap documented at the rule, `GUARD_BASH_PORT` test seam.
  Scope cuts recorded: `-File`/`-EncodedCommand`, `-c` shorthand.
- **Gate:** `tests/hooks/guard-bash.test.ts` **10/10** (wrapped-deny ×3,
  wrapped-isolatedDist-allow ×2, port-closed allow, bare deny, bare isolated
  allow, quoted-mention allow, bulk-stage deny). In-anger proof: this phase's own
  wrapped isolated builds passed the live hook.

### PIPE-02 — embedding stale-row prune ✅

- **Shipped:** `scripts/compute_instance_embeddings.py` (commit `58a6d996`):
  `_prune(node_ids)` strictly after the EMB-05 gate-pass point; delete-only;
  count in the run summary (`Upserted N … / Pruned M stale`).
- **Gate (real run):** before `stale=983` (verified live) → run
  `GATE PASS … Upserted 22279 AccInstanceEmbedding rows / Pruned 983 stale …
  37.3s` → after `db_rows=22279 stale=0`. Python unit suite 17/17.

## Gates actually run (aggregate)

| Gate | Outcome |
|---|---|
| `npx tsc --noEmit` (after every code/spec change) | exit 0 |
| `npm test` (full) | 2,629 passed / 0 failed / 1 skipped |
| `npx vitest run tests/hooks/guard-bash.test.ts` | 10/10 |
| `python -m pytest scripts/test_compute_instance_embeddings.py -q` | 17/17 |
| acc-dc-graph full suite (:3100 prod harness) | 16 passed / 8 skipped / 0 failed |
| acc-3d-lasso ×3 flag-on runs | 3/3 passed |
| Embedding real run + before/after counts | 983 → 0 |

`node scripts/repo-map/check.cjs` not run: no imports, shared modules, routers,
or Prisma surface changed (hook script, test specs, one function-body fix, one
python function).

## Deviations carried from summaries

- Default `playwright.config.ts` dev harness 500s on `/login`; all e2e ran on the
  established `playwright.verify.config.ts` prod harness (recorded, CONCERNS §3.9).
- CONTEXT staleness: the TEST-04 resolver test also failed live (not just the two
  mask tests) and the e2e baseline was 16 fails (not 14) — both resolved by the
  same fixes, scope unchanged.
- Ponytail cut-review skipped: hygiene phase — no new shared modules or
  abstractions to cut (largest addition is one test file).

## Debt rolled to CONCERNS (dated, phase-tagged)

- §3.4 lasso flake → CLOSED; Ph33 guard-bash gap → CLOSED.
- NEW §3.8 focus-session Escape doesn't restore the camera (product gap, e2e
  deliberately not asserting it).
- NEW §3.9 default e2e dev harness broken (verify-config is the real path).
- NEW §3.10 cluster-label chips flag-ON-only after the redesign (possible silent
  feature regression — owner call).

## Deploy (autoDeploy policy)

- **Type gate:** `npx tsc --noEmit` → exit 0.
- **Build:** `npm run build` → exit 0; Next.js 16.2.10 production build compiled,
  type-checked, and generated 29/29 static pages.
- **Restart:** `LECG Dashboard Local` → `Running`; port 3000 → `Listen`.
- **Probe (2026-07-20T12:23:30-06:00):** `/api/health` → 200 with
  `database: connected`; `/users/access-analysis` → expected authenticated 307
  redirect to `/login`.
- **BUILD_ID:** `CV_frbgC6hmbArjJ53Qi7`.

**Phase result: PASS — 5/5 success criteria met and deployed.**
