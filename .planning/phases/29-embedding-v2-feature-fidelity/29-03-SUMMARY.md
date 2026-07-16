# 29-03 Summary — Live-DB run + EMB-06 smoke

**Status:** COMPLETE · **Commits:** none (no source diff — run evidence only) ·
**Requirements:** EMB-04, EMB-05 (evidence), EMB-06

## Run evidence (verbatim from pipeline output, 2026-07-16)

- `npx tsx scripts/build-instance-features.ts` →
  `Wrote 22279 instance feature rows to .embedding/instance-features.jsonl`.
  Spot-checked line shape: `cov:` token present, numerics populated with real values
  (e.g. `{"folderBreadth":28,"accessibleDataBytes":0,"activityTotal":0,"membershipAgeDays":947,"permissionStrength":4,"riskScore":3}`).
- `python scripts/compute_instance_embeddings.py` (env loaded via wrapper; secrets never
  printed):
  ```
  nodes=22279 vocab=473 numeric_cols=8 hybrid_cols=481
  duplicate-rate old-definition (tokens)=84.3% new-definition (tokens+numerics)=20.4% (unique 3488 -> 17732)
  trustworthiness(k=10, cosine, sample=5000): old=0.9388 new=0.9597
  GATE PASS: new >= old.
  Upserted 22279 AccInstanceEmbedding rows (12 clusters, run 20260716T173543Z-345c0e14) in 20.9s total
  ```
- **embeddingRunId:** `20260716T173543Z-345c0e14` · **runtime 20.9 s** (was minutes-scale
  t-SNE) · duplicate rate **84.3% → 20.4%** (measured baseline slightly below the ~87%
  estimate — data grew since the estimate) · trustworthiness **0.9388 → 0.9597**.
- DB spot check (read-only): **22,279 rows** carry the new runId; 3 sampled rows all
  in ±1000 extent, cluster ints, 10 neighbors each.

## EMB-06 smoke (live :3000, no rebuild needed — coords are data)

- `/users/spatial-graph` renders the NEW map: tight separated islands with real
  within-cluster spread (no jittered mega-blob), 22,279 nodes / 3,791 people, KMeans-12
  cluster coloring coherent.
- Console: **zero errors, zero (0,0)-fallback / missing-embedding warnings**.
- Anchor-morph round trip: Group into = Role, strength 0 → 60 → nodes morphed into role
  clumps → Home back to 0 → settled back to the embedding baseline. Screenshots captured
  in-session.
- PERF-02 frozen-handle invariant: `npx vitest run "GraphCanvas.test"` →
  **Test Files 1 passed (1) · Tests 25 passed (25)**.

## Deviations

- First pipeline attempt exited at the gate's DB read: python does not self-load `.env*`
  (the TS builder does). Manual runs need env in the process; the nightly ingest path
  provides it (execSync inherits ingest's env) — no code change, wrapper used for the
  manual run.
- Slider keyboard "Left×40" didn't register after focus loss; Home key used. UI behaved
  correctly.

## Follow-ups / debt

- PaCMAP MN_ratio/FP_ratio at defaults — the tight-islands look landed without tuning;
  revisit only if the owner's eyeball UAT asks for tighter separation.
