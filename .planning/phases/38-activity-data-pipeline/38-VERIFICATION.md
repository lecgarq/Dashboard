# 38-VERIFICATION — Activity Data Pipeline & Embedding

**Verified:** 2026-07-21 · plans 3/3 summarized · commits `fa2502c2` → `015f9a67` class
(code: `fa2502c2`, `eaf402cb`, `267edf29`, `a7519a9c`, `7a6ff68e`, `19735550`)

## Per-requirement coverage

### SCALE-02 — binary columnar payload + budget ✅

- Route `app/api/activity-universe/payload/route.ts`: typed-array columnar payload
  (no per-node JSON), ETag = embeddingRunId + 304, `?meta=1`, honest 404.
- Artifact: 4,904,886 rows → **156,957,160 B (149.7 MB)** built in 58.7 s
  (`build-activity-universe-payload.ts`, keyset pagination, Phase-37 codec reused).
- **Budget gate: median-of-5 fetch+decode 424 ms vs ≤2,500 ms — PASS** on the
  isolated `:3100` production build (BUILD_ID `Z9-KrhAA6MufgGzln0CQ_`), per-run
  integrity asserts green; record in `test-results/activity-payload.json` +
  38-03-SUMMARY. GPU upload deliberately not re-measured (37 track (b) evidence;
  full time-to-graph lands with the consumer in Phase 39/41).

### EMB-07 — offline pipeline + activity-grain storage ✅

- `AccActivityEmbedding` Prisma model + raw-SQL migration
  `20260721000000_add_acc_activity_embedding`, applied via runner + registered with
  `prisma migrate resolve`; `migrate status` "up to date". Never `migrate dev`.
- `compute_activity_embeddings.py`: unified corpus (CTE-verbatim boundary; count
  asserted == real-CTE coverage total), 71-dim author+event feature matrix (author
  role/company/modules from the mergeRoleNames-backed sidecar — "author's
  properties shape the layout" literally true), **full-fit PaCMAP seed 42:
  fit 50.0 min + determinism re-fit 50.4 min, byte-identical at full 4.9M scale**,
  peak RSS 15.7 GB, quality gate (finite + trustworthiness 0.8085 baseline stored;
  rerun compare enforced), TRUNCATE+COPY 84.3 s, fresh-connection durability count
  4,904,886 == corpus.
- Ingest wiring non-fatal: `[activity-universe]` staleness log only (owner decision:
  manual refresh) — SQL proven live (`built 4,904,886, missing 0`, 4.1 s).

### ACT-02 — author inheritance + honest coverage ✅ (data layer; surface = Phase 39)

- Sidecar 22,279 (email, project) rows via `getCachedAccDcBulkUsers` →
  `buildGraphNodesFromUsers` → `buildAuthorAttributeMap` (mergeRoleNames path).
- Coverage measured against the live unified corpus and recorded:
  total 4,904,886 · nullEmail 77 · matchedPair 61.52% · matchedEmailOnly 32.89% ·
  unmatchedEmail 5.59% → **resolvedEmailRate 94.41% / unknownAuthorRate 5.59%**;
  reconciliation exact. Figures ship in the payload meta (`coverage` block) for the
  Phase-39 label; "Unknown author" grouping = authorId 0 (77 rows), with
  roleId/companyId 0 for pair-unmatched events (identity kept, attributes honest).

## Gates actually run (exact outcomes)

| gate | outcome |
|---|---|
| `npx tsc --noEmit` | 0 errors (after each TS change) |
| `npx vitest run` focused (authorAttributes, universePayload) | 2/2 + 2/2 PASS |
| `python -m pytest test_compute_activity_embeddings.py` | 7/7 PASS |
| `npm test` (full suite, phase close) | **2,649 passed / 1 skipped** (skip pre-existing); TEST-01/02/03 green |
| `node scripts/repo-map/check.cjs` | PASS (3 dep-cruiser warnings + 248 ast-grep = pre-existing baseline) |
| `npx prisma migrate status` | up to date, 21 migrations |
| `node --check scripts/dc-daily-ingest.cjs` | clean |
| e2e `activity-payload.spec.ts` on `:3100` | 1 passed — median 424 ms ≤ 2,500 ms |

## Deviations carried (from summaries)

1. RSS cap 12 → 24 GB, owner-approved after the estimate-derived cap tripped a
   successful fit (38-02); fallback clause stays armed at 90 min / 24 GB.
2. Full-fit wall-clock is **~50 min per fit** (not the 37-BASELINE ~34-min
   extrapolation); full pipeline ~102 min.
3. 🔑 psycopg3 implicit-tx savepoint rollback ate run #2's write while in-session
   verification reported success — fixed with explicit commit + fresh-connection
   durability proof (38-02 deviation 3; rolled into CONCERNS).
4. Payload 149.7 MB (~2× the spike-minimal 73 MB) — full owner-chosen column set;
   budget absorbed it (424 ms median).
5. moduleId = serviceGroup code; verb→module classification stays TS-single-sourced.
6. Unified id convention (`accds:` prefix / plain DC id) adopted over the plan's
   `a:`/`d:` sketch.

## Remaining VERIFY / gaps

- None blocking. Phase-39 consumers (graph render, hover strings on-demand,
  coverage label surface) are the next phase's scope by design.

## Deploy (autoDeploy policy — 2026-07-21)

Full deploy sequence run (stop `LECG Dashboard Local` task → tsc 0 → `npm run
build` 0 → restart): **BUILD_ID `je7yDXXumvtzNylv874vC`**, task Running. Live
`:3000` probes: `/api/health` **200** · `/api/activity-universe/payload?meta=1`
**200** · payload **200, 156,957,160 B in 0.43 s** · `If-None-Match` run-id →
**304**. Changed route verified live.

## Ponytail review (phase added shared modules)

Inline scan of the phase diff: `activityAuthorAttributes.ts` (1 pure fn),
`activityUniversePayload.ts` (3 small exports, all consumed by builder+route+test),
route minimal with a `ponytail:` ceiling comment (whole-file buffer per request).
Env-loader boilerplate duplication in scripts matches the established repo idiom.
No cuts taken.
