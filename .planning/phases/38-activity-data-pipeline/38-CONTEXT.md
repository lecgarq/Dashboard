# Phase 38: Activity Data Pipeline & Embedding - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Three requirements: **SCALE-02, EMB-07, ACT-02**. Build the offline data layer the
L2 activity universe stands on — nothing the owner sees changes yet.

1. **Embedding pipeline (EMB-07)** — offline python (pacmap + faiss-cpu lineage,
   `scripts/compute_instance_embeddings.py` discipline) computes deterministic 2D
   positions for the FULL unified activity corpus (~4.905M events: `AccActivityAccds`
   4,862,301 + DC backfill 41,714 + DC admin 871 — counts re-measured at build time).
   Full-fit PaCMAP (owner decision 1). Feature vector spans author properties (role,
   company, modules) AND event properties (verb, module/serviceGroup, objectType,
   folder, month) so the author's properties literally shape the layout. Deterministic
   seed proven twice; quality-gate regression aborts before any write.
2. **Activity-grain storage (EMB-07)** — new Prisma table storing positions + the
   dictionary-coded attribute columns the graph needs, applied via raw-SQL migration +
   `prisma migrate resolve` (pgvector shadow-DB trap: never `migrate dev`). Ingest
   wiring is a NON-FATAL staleness signal only this milestone (owner decision 2) —
   no nightly refit.
3. **Author coverage (ACT-02)** — the null/unresolved-author rate measured against the
   live corpus and recorded; coverage figure plumbed so Phase 39 can surface it as an
   honest label; unresolved events keyed to an explicit "Unknown author" grouping,
   never dropped.
4. **Binary payload route (SCALE-02)** — a production route serves the full corpus as
   binary columnar typed-array payloads (no per-node JSON). Resident columns =
   positions + dictionary-coded ints (verb, objectType, serviceGroup/module, project,
   month, author, author-role, company, folderId) per owner decision 4; hover strings
   stay on-demand. Median-of-5 `:3100` time-to-graph meets the budget (≤ ~2.5 s,
   from 37-BASELINE track (b): 73 MB in 1,072 ms at spike-minimal columns).

**NOT this phase:** any change to the live graph surface — `/users/spatial-graph`
still renders the 22,279-node user-instance universe until Phase 39; user-instance
retirement (ACT-03, Phase 39); hover/click UI (ACT-04, Phase 39); dimension sliders
(Phase 40); scrubber/e2e/hard gate (Phase 41). The 23-panel `/access-analysis` charts
page and `/template-mty` untouched; TEST-01/02/03 stay green.

**Traps:**
- `app/(dashboard)/access-analysis/` (charts page) ≠
  `app/(dashboard)/users/access-analysis/` (spatial-graph shell). Payload route +
  client decode land near the latter / `app/api`.
- Two ID spaces: `AccActivityAccds.accdsActivityId` (hash PK) vs `AccActivity.id`
  (DC rows). Unified node key must be source-prefixed to avoid collisions.
- `AccInstanceEmbedding` (22k, per-instance) is the OLD table — Phase 38 adds a new
  activity-grain table beside it; retirement of the old path is Phase 39.
- The 37 spike payload route (`/api/scale-spike/payload`) is SYNTHETIC and flag-gated —
  Phase 38 builds the real route; spike surfaces stay untouched behind their flag.

</domain>

<evidence>
## Grounding Sources

- `.planning/phases/37-scale-feasibility-spike/37-BASELINE.md` — all budgets: L2 locked
  (all resident, far-zoom render ≤ ~500k); payload 72,935,020 bytes in 1,072 ms total
  (fetch 511 / decode 0.2 / colors 17 / upload 543); PaCMAP 1M fit 379.8 s measured,
  full-fit ~34 min EXTRAPOLATED, RSS trend ~6 GB est; faiss FLAT projection 840 rows/s
  (slower than full fit); determinism re-fit identical at 100k.
- `app/(dashboard)/users/scale-spike/columnar.ts` — `encodeColumnarPayload` binary
  format (typed-array columns + JSON header) the real route reuses;
  `app/api/scale-spike/payload/route.ts` — the measured prototype route.
- `scripts/compute_instance_embeddings.py` (421 L) — seed 42 discipline, EMB-05
  gate-conditional upsert, psycopg write pattern; `scripts/spike_activity_embedding_estimate.py`
  — the ~51-dim hashed one-hot activity feature sketch (author/verb/project/objectType
  buckets + cyclic month + recency) the real vector grows from.
- `scripts/create-instance-embedding-table.ts` — raw-SQL table-creation lineage for the
  new activity-grain table; `prisma/schema.prisma` `AccActivityAccds` (fields:
  userEmail?, projectId, serviceGroup?, activityVerb, objectType?, folderId?,
  createdAt) and `AccInstanceEmbedding` (old-table shape reference).
- `lib/server/unifiedActivitySource.ts` — `mergeActivitySources` /
  `listUnifiedActivityRows` (605 L): the corpus authority for the unified merge.
- `lib/server/accessInstanceView.ts` — `mergeRoleNames` AccRole fallback (ACT-02 role
  authority); `lib/acc/activityClassification.ts` — verb→module classification.
- Phase-19 precedent (`19-02`): non-fatal post-ingest wiring in the
  `dc-daily-ingest.cjs` success branch — the pattern the staleness signal follows.
- VERIFY: full-fit ~34 min / ~6 GB RSS are extrapolations — the real run must record
  measured wall-clock + peak RSS; abort clause below if it blows past bounds.
- VERIFY: unresolved-author rate is unmeasured at activity grain (68%-of-Unknown
  deleted-membership history exists at membership grain — do not reuse; measure fresh
  against the live corpus).
- VERIFY: resident-column payload size with +4 columns (role, company, module,
  folderId) over the spike's 73 MB — estimate ~+30 MB class (Uint8/Uint16/Uint32 per
  column × 4.9M); must be measured, budget is the gate.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- New table named in the established `Acc*` style (e.g. `AccActivityEmbedding`),
  PK = source-prefixed event id, `x`/`y` `@db.Real`, dictionary-coded int columns,
  `embeddingRunId`, `updatedAt`; raw-SQL migration + `migrate resolve`; no edit to any
  existing table.
- Dictionary tables (id ↔ label maps for verb/objectType/project/author/role/company/
  folder) ship in the payload JSON header or a small side JSON — client decodes ints
  locally; no per-node strings on the wire.
- Payload route must NOT re-encode 4.9M rows per request: pipeline (or a one-time
  post-pipeline step) materializes the binary artifact; route streams it with caching
  keyed by `embeddingRunId` (`Cache-Control` + ETag). Route lives under `app/api/`,
  auth posture same as existing graph payload routes.
- Quality gate at activity grain (first run — no old baseline in the new table):
  determinism proven twice (byte-identical coords), finite-coords assert, and
  trustworthiness on a bounded subsample recorded as the stored baseline for future
  reruns (EMB-05 discipline carried).
- Fallback clause (owner decision 1, recorded): if the full fit exceeds ~90 min
  wall-clock or ~12 GB RSS, abort, record the numbers, pivot to sample-fit +
  IVF/HNSW projection with the ANN benchmark run FIRST — an owner-visible recorded
  deviation, not a silent switch.
- Author join: `userEmail` (+ `projectId` for role) via the established sources —
  `mergeRoleNames` AccRole fallback for role, DC company, provisioned modules;
  null/unmatched email → "Unknown author" id in the author dictionary.
- Timings that feed the budget: isolated `:3100` production build, median-of-5,
  PowerShell-only isolated builds; dev-server numbers are not evidence.
- Standing: commit by explicit path; tsc gate before build; guard-bash denials
  intentional; server-side SQL for any large aggregate; no new npm/python deps
  without owner approval (pacmap/faiss-cpu/psycopg already installed).

</defaults>

<decisions>
## Locked Owner Choices (2026-07-21)

1. **Full-fit PaCMAP** for the full-corpus positions — one fit, ~34 min est,
   highest layout quality, no projection error. Fallback clause: abort + pivot to
   sample-fit + IVF/HNSW (benchmarked first) only if wall-clock >90 min or RSS >12 GB,
   recorded as a deviation.
2. **Refresh is manual this milestone.** The pipeline runs when invoked; ingest wiring
   is a non-fatal staleness log only (count of new rows without positions in the
   `dc-daily-ingest.cjs` success branch). No nightly refit, no incremental projection.
   Unpositioned new events are absent until the next manual run — disclosed by the
   coverage label, never silently interpolated.
3. **Corpus = unified merge** (~4.905M: accds 4,862,301 + DC backfill 41,714 + DC
   admin 871, re-counted at build time) — matches the ACT data-authority clause;
   every activity counted. DC rows get source-prefixed node keys.
4. **Payload composition: ints resident, strings on-demand.** Resident columns =
   positions + dictionary-coded verb, objectType, serviceGroup/module, project, month,
   author, author-role, company, folderId — every Phase-40 dimension GPU-addressable
   without a second payload. Hover strings (objectName, folderName, exact timestamp)
   fetched per node on demand (Phase 39 wires the UI). Measured size vs the ≤ ~2.5 s
   budget is the gate.
5. **Carried from Phase 37 (decision 4):** payload format stays raw typed-array
   buffers + small JSON header, zero new dependencies; Arrow only on evidence of pain
   + owner approval.

</decisions>
