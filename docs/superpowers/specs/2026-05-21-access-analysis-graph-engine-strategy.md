# Access Analysis — Graph Engine Strategy

> **Status:** Specification. No application code changed; no renderer swapped.
> **Backed by:** [`2026-05-21-access-analysis-data-discovery.md`](../research/2026-05-21-access-analysis-data-discovery.md)
> and [`2026-05-21-access-analysis-dimension-taxonomy.md`](./2026-05-21-access-analysis-dimension-taxonomy.md).
> **Reviews (critically) the current engine:** `mathLayer.ts`, `featureTargets.ts`,
> `physicsLayer.ts`, `positionsCache.ts`, `nodeColors.ts`, `sameUserEdges.ts`, the cosmos.gl /
> three.js renderers, and the `graphTestBridge`.

Goal: a semantic, organic, **neural-style** spatial graph over **16,942** UserProjectInstance nodes
— colored, multi-layer edges, never a sphere/disc/hairball, alive after load, every dimension usable.

---

## 1. Current engine — what to keep, what to revisit

| Layer | Current | Verdict |
|---|---|---|
| Node model | `userId::projectId`, 16,942 nodes | **Keep** (locked) |
| Feature snapshot | `NodeFeatureSnapshot` via DuckDB join | **Keep**, enrich (module, company, addedOn, isAdmin) |
| Layout math | `mathLayer.ts` (Σ unit-vector × feature × slider) | **Revise** — see §2 |
| Targets | `featureTargets.ts` volumetric spherical-Fibonacci, `ANCHOR_RADIUS=16000` | **Keep**, extend per type |
| Physics | `physicsLayer.ts` d3-force-3d, two-bus (physics/mask) | **Keep** — clean PHYS-04 invariant |
| Cache | `positionsCache.ts` FNV hash, `LAYOUT_VERSION` | **Keep**, extend key (§5) |
| Edges | `sameUserEdges.ts` (chain, same-user only) | **Extend** to multi-layer taxonomy (§4) |
| Colors | `nodeColors.ts` FNV hue, 4 modes | **Keep** hashed for categorical; add sequential ramps |
| 2D renderer | cosmos.gl 3.0.0-beta.9, typed-array buffers | **Keep** (baseline) |
| 3D renderer | three.js 0.184 InstancedMesh + LineSegments | **Keep** (baseline) |
| Test bridge | `graphTestBridge` + Playwright :3100 | **Keep**, extend assertions |

**No renderer replacement is recommended now** (see §3).

---

## 2. Slider model (universal) — and a critical review of current math

### 2.1 Required semantics

- **Slider = 0:** no semantic attraction for that dimension. Does **not** filter or hide nodes. Nodes
  remain in the organic base distribution — **not** a sphere, **not** a flat disc, **not** collapsed to origin.
- **Slider = 100:** maximum attraction; nodes sharing the value cluster tightly but collision/repulsion
  keeps clusters readable.
- **Intermediate:** proportional force, blended across all active sliders. No single slider should
  destroy the layout unless intentionally maxed.

### 2.2 The math

Per node *n*, the blended layout target is:

```
target(n) = Σ_d [ unit(d) · f_d(n) · effectiveWeight(d, n) ]   /   Σ_d effectiveWeight(d, n)

effectiveWeight(d, n) = sliderNorm(d) · baseWeight(d) · confidence(d) · availability(d,n) · transformer(d,n)
```

where `unit(d)` is the dimension's anchor direction (categorical: per-value anchor; scalar/temporal:
a single axis scaled by the normalized value), and the denominator normalizes so adding dimensions
doesn't inflate magnitude. **All sliders 0 ⇒ numerator and denominator 0 ⇒ fall back to the organic
seed position** (never origin).

### 2.3 Critical review of the *current* constants (do not assume final)

From `mathLayer.ts` / `featureTargets.ts` / `physicsLayer.ts`:

| Constant | Current | Concern / recommendation |
|---|---|---|
| `mathLayer` target | `Σ uᵈ·fᵈ·sᵈ / Σ sᵈ` | Missing `confidence` & per-node `availability` factors → sparse dims (signin 66% null, tier ~93% project-null) drag unknown nodes. **Add availability/confidence (taxonomy §14).** |
| `ANCHOR_RADIUS` | 16000 | Tuned for current node count; re-check collision readability at 17k+ and with 428 project anchors. |
| `STRENGTH_AT_ONE` | 0.1 | d3 default; fine, but verify slider=100 actually tightens (clustering ratio test). |
| `REPULSION_ZERO/ONE` | -10 / -60 | At sliders=0 nodes go *tight* (repulsion -10) — risks a blob, not "organic". **Re-evaluate so 0-state is a spread organic cloud, not a clump.** |
| `DECAY_ZERO/ONE` | 0.1 / 0.02 | Fast freeze at 0 may look static on load. Consider a gentle idle motion for the "alive after load" requirement. |
| `LAYOUT_HALF_EXTENT` | 350 | Normalization scale; keep but verify 3D zRange is non-degenerate. |
| `VELOCITY_DECAY` | 0.4 | d3 default, locked — fine. |
| 2D vs 3D targets | `buildFeatureTargets` volumetric (x/y/z) | 2D should project the same semantic anchors (drop z), not a separate ring layout, for 2D/3D parity. |

### 2.4 Anchor / target generation

- **Categorical** (project, role, company, tier, internalExternal): one anchor per value on the
  volumetric spherical-Fibonacci set (current approach). Fold rare values ("Other role"/"Other firm").
- **Scalar/temporal** (activity, signin, membershipAge, permStrength): a single axis; node placed
  along it by normalized value. `unknown` ⇒ availability 0 (no pull).
- **Multi-hot** (module, activityMix): centroid of active anchors (baseline products excluded).
- **2D:** same anchors, z-projected. **3D:** full volumetric. One target builder, two projections.

### 2.5 Smoothing / reheat / collision

- Reheat gently on slider change (`ALPHA_MAX_REHEAT=0.3`, `SKIP_THRESHOLD=0.02`) — keep.
- Collision radius scales with node degree (denser hubs need more room).
- Cache key includes quantized sliders so re-tweaking returns instantly (§5).

---

## 3. Renderer / engine recommendation — **evolve current stack + scoped spikes**

**Decision (approved): keep the native stack; treat any renderer replacement as a measured spike, not
the implementation path.**

Baseline to evolve:
- 2D: **cosmos.gl** · 3D: **custom three.js** · physics: **d3-force-3d / `physicsLayer`** ·
  data: **DuckDB/Arrow + typed arrays** · tests: **`graphTestBridge` + Playwright e2e**.

Rationale: the stack already renders 16,942 nodes + ~13.5k same-user edges in 2D and 3D with semantic
colors, volumetric targets, custom slider physics, a position cache, and an e2e regression harness.
There is no proven hard limit that justifies a rewrite. Do **not** switch renderers before completing
data discovery (done), dimension taxonomy (done), edge taxonomy (§4), and measurable perf criteria.

### Future research spikes (optional, not on the critical path)

1. **UMAP 3D semantic seed** — precompute initial positions from real `NodeFeatureSnapshot` vectors
   for a better organic "neural" base + less manual anchor tuning. *Not* a replacement for interactive
   slider physics; feeds the seed/cache only.
2. **ForceAtlas2 / graph-embedding** — topology layout from the edge taxonomy (same user/project/
   company/role/module/permission). Must avoid clique explosion (§4).
3. **React Force Graph evaluation** — go/no-go criteria, all must hold: handles 16,942+ nodes; many
   edge layers; custom semantic sliders; real 3D node colors; test-bridge observability; no regression
   to lasso/search/selection; no large rewrite without measurable gain.
4. **Cosmos replacement** — only if hard limits are *proven*: 2D color/edge can't be validated; slider
   interactions stay visually incompatible; lasso can't be made accurate; perf fails with realistic
   edge layers.

---

## 4. Edge taxonomy (multi-layer, neural look, no cliques)

**Hard rule:** never build full cliques for large groups. A 446-user role or a 10,569-instance company
must use a hub node, aggregate edge, top-k, or similarity threshold — never O(n²) raw edges.

Today only **same-user** edges exist (`sameUserEdges.ts`, chain topology, ~13.5k edges). Proposed layers:

| edge type | source | meaning | est. raw size | clique risk | strategy | default | layer |
|---|---|---|---|---|---|---|---|
| **same-user** | `userId` across instances | same person, many projects | ~13.5k (chain) | low (chains) | direct chain (current) | **on** | base |
| same-project | shared `projectId` | co-membership | huge (428 projects, some 100s of members) | **extreme** | **project hub node** + aggregate | toggle | structure |
| same-company | shared `companyId` | firm affiliation | huge (Hermosillo ~10.5k) | **extreme** | **firm hub node** | toggle | affiliation |
| same-role | shared `roleId` | role peers | high (Architect 229, Owner 446) | **high** | direct only ≤25 users; else role hub / top-k | toggle | structure |
| role-combo | identical role set | exact role twins | small (280 multi-role) | low | direct | toggle | structure |
| shared-module | non-baseline product overlap | tool peers | medium | medium | **top-k KNN on Jaccard** | toggle | access |
| shared-permission | shared folder + tier | access twins | medium (crawled projects only) | medium | threshold on folder overlap | toggle | access |
| similar-permission | permission-profile similarity | near access twins | medium | medium | **KNN threshold** | preset-only | access |
| membership-cohort | bucketed `addedOn` | joined together | medium | medium | bucket hub or top-k | preset-only | tenure |
| external-collaboration | external node in project w/ internal | cross-org work | medium | medium | derived, top-k | toggle | risk |
| high-risk | external+admin / Full Controller | risk relationships | small (27 ext-admins) | low | direct | preset-only | risk |
| member-event | `assign-member`/`assign-admin` activity | who-added-whom | small (451 events) | low | direct, directed | toggle | behavior |
| activity-cooccurrence | same files/issues touched | collaboration | unknown (needs entity ids) | medium | top-k, A4 | future | behavior |

### Rendering the "neural" look

- Thin, low-opacity background links (current base `[0.62,0.72,0.93,0.1]` is a good start).
- Selected/focused paths brighten (`linkEmphasis.ts` already does base/bright/dim) — extend per layer.
- Per-layer color + width + opacity; layers independently toggleable; **never all-on by default**
  (default = same-user only, others opt-in) to avoid a hairball.
- Hub nodes rendered distinctly (larger, dimmer) so aggregate edges read as a star, not a mesh.

### Edge-count budget

Keep total rendered edges within the 3D sampler cap (`ACC_GRAPH_3D_MAX_EDGES ≈ 12k`) per active
layer; aggregate/hub strategies keep each layer well under that. 2D (cosmos) tolerates more but apply
the same budget for parity and readability.

---

## 5. Prefetch / cache strategy

The user must never see meaningless static points on load. Layered plan:

### Precompute now (client, on data load)
- `NodeFeatureSnapshot` (enriched) — already built post-load; cache in DuckDB.
- Dimension registry + per-dimension anchor sets (deterministic).
- 2D & 3D feature targets (`buildFeatureTargets`).
- Initial positions: **seed from a default preset** (organic) so first paint is meaningful, then
  refine. Persist in `positions` table.
- Same-user edge list + base color buffers.

### Cache key (extend current FNV hash)
Current key = `LAYOUT_VERSION | sorted nodeIds | quantized sliders`. **Extend to:**

```
key = layoutVersion
    | dimensionRegistryVersion     // bump when dimensions/weights change
    | nodeSetHash                  // sorted nodeIds
    | sliderPresetHash             // quantized slider values
    | mode (2D | 3D)               // separate caches per projection
    | edgeLayerSetHash             // which edge layers are active
```

### Runtime (not precomputed)
- Live slider drags (reheat from cache when key matches; recompute otherwise).
- Mask/filter/search/lasso (PHYS-04: mask bus only, never touches physics or cache).
- Edge emphasis on selection.

### Invalidation
- Bump `LAYOUT_VERSION` when target *meaning* changes (e.g. adding availability/confidence to math).
- Bump `dimensionRegistryVersion` when dimensions/weights change.
- DC ingest changes the node set ⇒ `nodeSetHash` changes ⇒ natural invalidation (this is also why
  e2e `EXPECTED_NODE_COUNT` drifts).
- **Avoid stale globe layouts:** any legacy sphere/globe cache entries are invalidated by the
  `LAYOUT_VERSION` namespace (current `feature-targets-v1`); bump again if migrating.

### Future backend support (A4)
- Server-side precompute of feature snapshot + targets + edge lists shipped as Arrow buffers, so the
  first load is instant and identical across machines. Not required for the evolve-current path.

---

## 6. Test strategy (no manual devtools)

- **Unit:** dimension registry; target generation (categorical/scalar/multi-hot); slider math
  (availability/confidence factors); edge generators (cap/hub/top-k, no cliques); color buffers; math
  invariants (no NaN, all-sliders-0 ⇒ organic).
- **Integration:** feature-snapshot enrichment vs the discovery inventory (e.g. internal==1,265,
  view events==106,630); cache key generation/invalidation; physics clustering on sampled real data.
- **E2E (`graphTestBridge` + Playwright :3100):** app loads; node count == live (update the constant);
  no NaN positions; 2D renders; 3D renders; sliders don't crash; color mode changes the actual
  renderer buffer (signature hash); edges render; per-layer toggle; lasso smoke.
- **In-app diagnostics (build it, so humans never open devtools):** a debug/stats overlay showing
  node count, edge count (per layer), current mode, slider profile, color mode, cache/layout version,
  and clustering ratio. Today these exist only via `window.__ACC_GRAPH_TEST__`; surface them in a
  toggleable on-screen panel.

---

## 7. Proposed implementation phases (for the eventual, separate build-out)

> Sequenced so each phase is independently shippable and test-gated. **Not started here.**

1. **P1 — Fix internal/external + enrich snapshot.** Replace `@lecg.com` with configurable
   `internalDomains` allowlist; add `module`, `company`, `isAdmin`, `membershipAge` to
   `NodeFeatureSnapshot`. Unit + integration tests vs discovery counts. *(Highest value, lowest risk.)*
2. **P2 — Slider math hardening.** Add `confidence` + per-node `availability` to `mathLayer`; re-tune
   `REPULSION_ZERO`/decay so slider=0 is an organic cloud (not a blob); 2D/3D target parity.
   Layout-math validation tests.
3. **P3 — Color modes + sequential ramps + risk badges.** Hashed hue for categorical; ordered ramps
   for tier/activity/membershipAge/permStrength; risk badges (Full Controller, external-admin,
   dormant-privileged).
4. **P4 — Edge taxonomy v1.** Add same-project (hub), same-company (firm hub), same-role (capped),
   shared-module (KNN). Per-layer toggles + emphasis. Clique-prevention tests.
5. **P5 — Cache/prefetch upgrade.** Extend cache key (registry version, mode, edge-layer set);
   meaningful first-paint preset; invalidation tests.
6. **P6 — In-app diagnostics overlay** (node/edge/mode/preset/color/version/clustering) + e2e
   assertions; update `EXPECTED_NODE_COUNT` handling to tolerate ingest drift.
7. **P7 (optional) — Spikes:** UMAP seed, ForceAtlas2, React Force Graph eval — each behind its
   go/no-go criteria (§3).

---

## 8. Recommendation digest

- **Renderer:** evolve cosmos.gl + three.js + d3-force-3d; spikes optional, criteria-gated.
- **Dimensions:** keep 6, fix `internalExternal`, add module/company/isAdmin/membershipAge (+ optional
  activityMix/permStrength/riskScore).
- **Edges:** multi-layer, hub/top-k/threshold capped, same-user default-on, rest opt-in.
- **Cache:** extend the FNV key (registry version + mode + edge-layer set); meaningful first paint.
- **First fix to ship:** the internal/external defect (1,265 users, incl. 328 privileged, mislabeled today).
