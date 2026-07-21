# 38-03 SUMMARY — Binary payload artifact, route, budget gate, staleness wiring (SCALE-02)

**Completed:** 2026-07-21 · commit `19735550` (code) · measurement on `.next-e2e`
BUILD_ID `Z9-KrhAA6MufgGzln0CQ_` (isolated `:3100`, artifact run `20260721T210323Z-80e4cff2`)

## What shipped

- `lib/server/activityUniversePayload.ts` (+ test) — artifact paths, meta reader,
  pure `assembleActivityUniverseMeta` (v1 shape: runId, count, dicts, ACT-02
  coverage). Vitest 2/2 green.
- `scripts/build-activity-universe-payload.ts` — keyset-paginated stream of
  `AccActivityEmbedding` (200k chunks) into typed arrays; reuses the Phase-37
  `encodeColumnarPayload` codec (no fork). Live run: **4,904,886 rows → 149.7 MB
  `.bin` in 58.7 s** + meta JSON (dicts + coverage figures).
- `app/api/activity-universe/payload/route.ts` — production route (no flag):
  streams the `.bin`, `ETag = embeddingRunId` + 304 revalidation, `?meta=1` JSON,
  honest 404 when artifact absent. Auth posture matches existing local data routes.
- `scripts/dc-daily-ingest.cjs` — non-fatal `[activity-universe]` staleness block
  in the success branch (owner decision 2: NO nightly refit). SQL proven live:
  `built 4,904,886, missing 0` in **4.1 s** (two anti-join PK probes; nightly-cheap).
  `node --check` clean.
- `tests/e2e/activity-payload.spec.ts` — SCALE-02 budget gate.

## SCALE-02 budget measurement (median-of-5, `:3100` production build)

| run | fetch ms | decode ms | total ms | bytes |
|---|---|---|---|---|
| 1 | 380 | 43.5 | 424 | 156,957,160 |
| 2 | 730 | 43.3 | 774 | 156,957,160 |
| 3 | 450 | 44.4 | 495 | 156,957,160 |
| 4 | 347 | 48.9 | 396 | 156,957,160 |
| 5 | 336 | 43.6 | 380 | 156,957,160 |

**Median 424 ms vs ≤2,500 ms budget — PASS with 5.9× headroom.** Column-count and
row-count integrity asserted per run (10 expected columns, positions length = 2n,
count == meta count). Full record in `test-results/activity-payload.json`.

Scoping honesty (per plan): GPU upload is not re-measured here — Phase 37 track (b)
measured 543 ms upload at 73 MB; full time-to-graph re-lands when the graph consumes
this route (Phase 39, hard gate Phase 41). Even doubling the 37 upload figure keeps
projected time-to-graph ≈ 1.5 s class, inside budget.

## Deviations

- Payload is **156,957,160 B (149.7 MB)** vs the CONTEXT "~+30 MB over 73 MB"
  estimate — the full owner-chosen column set (6×u16 + 3×u32 + f32 positions ×2)
  honestly costs ~2× the spike-minimal set. Wire time absorbed it (localhost):
  median fetch 380 ms.
- Meta served via `?meta=1` on the same route (plan allowed either; recorded).

## Gates

- Focused vitest 2/2 · tsc 0 · repo-map PASS (pre-existing warning baseline) ·
  `node --check` clean · e2e budget spec **1 passed** on `:3100`.

## Follow-ups / debt

- Route buffers the whole 149.7 MB per non-304 request (`ponytail:` comment in
  route) — fine single-user; stream if concurrency ever matters.
- Phase 39 consumes: route + meta dicts + coverage label (resolvedEmailRate 94.41%
  / unknownAuthorRate 5.59%) + "Unknown author" grouping via authorId 0 (77 rows)
  and roleId/companyId 0 for unmatched pairs.
