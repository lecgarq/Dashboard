# 37-02 Summary — Binary payload prototype (SCALE-01 track b)

**Status:** COMPLETE 2026-07-21
**Requirement:** SCALE-01 (payload-track prototype; measured numbers land in 37-04 on `:3100`)

## Files

- `app/(dashboard)/users/scale-spike/columnar.ts` — zero-dep codec:
  `[u32 headerLen][JSON header][4-byte-aligned column buffers]`;
  `encodeColumnarPayload(count, columns)` / `decodeColumnarPayload(buf)` with zero-copy
  typed-array views (f32/u8/u16/u32) and hard throws on truncation. Header offsets computed
  with a stabilization loop (offset digit growth can change header length).
- `app/api/scale-spike/payload/route.ts` — flag-gated GET (404 without
  `NEXT_PUBLIC_ACC_SCALE_SPIKE=1`); `?n=` (default 4,862,301) `&seed=`; serves stride-2
  Float32 positions (server-side downproject — the wire carries what cosmos uploads) +
  verbId/objectTypeId/month (u8) + projectId/authorId (u16) as one `application/octet-stream`
  ArrayBuffer with `Content-Length`, `no-store`. Content synthetic (same deterministic
  generator as the render harness); the FORMAT is the deliverable — Phase 38 swaps in the
  real table read.
- `app/(dashboard)/users/scale-spike/ScaleSpikeClient.tsx` — bridge extended with
  `runPayload(n?)`: `performance.now()` marks around fetch→arrayBuffer (wire), decode,
  client-side color derivation from the verb column (realistic derived-buffer cost), and
  `handle.setPointSet` (GPU upload). Result on `__SCALE_SPIKE__.getResults().payload`.
- `app/(dashboard)/users/scale-spike/columnar.test.ts` — roundtrip (mixed dtypes, odd
  lengths/padding), zero-copy assertion, truncation throws (3 tests).

## Expected wire size at full scale (theoretical, to be measured in 37-04)

4,862,301 × (8 pos + 1 + 1 + 2 + 2 + 1 attr bytes) ≈ **~73 MB** + header.

## Deviations

None. (`runPayload` is a dedicated bridge method rather than a `runScenario` name — it
returns phase timings, not an fps sample; plan wording said "payload scenario", intent
preserved.)

## Gates

- `npx vitest run app/(dashboard)/users/scale-spike/columnar.test.ts` → **3/3 passed**.
- `npx tsc --noEmit` → **0 errors**.
- `node scripts/repo-map/check.cjs` → **passed** (pre-existing warning baseline unchanged).

## Follow-ups / debt

- If 37-04 shows decode/upload dominated by the single 73 MB allocation, Phase 38 should
  consider chunked/streamed fetch — record as evidence-gated, not assumed.
