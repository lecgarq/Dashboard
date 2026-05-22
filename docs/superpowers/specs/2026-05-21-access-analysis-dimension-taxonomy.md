# Access Analysis — Dimension Taxonomy Spec

> **Status:** Specification. No application code changed.
> **Backed by:** [`2026-05-21-access-analysis-data-discovery.md`](../research/2026-05-21-access-analysis-data-discovery.md)
> (every dimension below cites a real, counted source field).
> **Builds on:** the existing 6-dimension registry in
> `app/(dashboard)/users/access-analysis/SliderContext.tsx` and `NodeFeatureSnapshot`
> (`interactionTypes.ts`, `featureSnapshot.ts`).

Node level legend: **UPI** = UserProjectInstance (`userId::projectId`) · **UID** = UserIdentity-derived ·
**PRJ** = Project-derived · **CO** = Company-derived · **FP** = FolderPermission-derived ·
**ACT** = Activity-derived.

Availability legend: **A1** already in `NodeFeatureSnapshot` · **A2** needs snapshot enrichment ·
**A3** needs a DuckDB query (data already in graph tables) · **A4** needs a backend/router change
(field not yet shipped to the client) · **A5** unavailable.

Data type legend: categorical · binary · scalar · temporal · multi-hot · derived/risk.

---

## 0. Summary registry

| dimensionId | label | family | type | node level | source | avail. | default wt | confidence |
|---|---|---|---|---|---|---|---:|---|
| `project` | Project | structure | categorical | UPI/PRJ | `AccDcProjectUser.projectId` | A1 | 0.35 | High |
| `role` | Role | structure | categorical | UPI | `AccDcProjectUserRole.roleId` ⋈ `AccRole.name` | A1 | 0.25 | High |
| `tier` | Permission tier | access | categorical/scalar | UPI/FP | `AccFolderPermission.permType` (role-joined) | A1 | 0.15 | Medium |
| `module` | Module signature | access | multi-hot | UPI | `AccDcProjectUserProduct.productKey` | A2 | 0.15 | High |
| `company` | Company / firm | affiliation | categorical | UPI/CO | `AccDcProjectUserCompany.companyId` ⋈ name | A2 | 0.10 | High |
| `internalExternal` | Internal / external | affiliation | categorical(3) | UID | `AccDcUser.email` + `internalDomains` | A1* | 0.10 | High |
| `isAdmin` | Admin / member | access | binary | UPI | `accessLevel='project_admin'` / `projectAdminAccessLevel` | A1 | 0.10 | High |
| `activity` | Activity volume | behavior | scalar | ACT/UID | `AccActivity` rollup | A1 | 0.05 | Medium |
| `activityMix` | Activity mix | behavior | multi-hot | ACT/UID | `AccActivity` category rollup | A3 | 0.00 | Medium |
| `signin` | Sign-in recency | behavior | temporal | UID | `AccDcUser.lastSignIn` | A1 | 0.05 | Low-Med |
| `membershipAge` | Membership age | tenure | temporal | UPI | `AccDcProjectUser.addedOn` | A2 | 0.05 | High |
| `permStrength` | Permission strength | risk | scalar | FP | max `permType` per node | A2 | 0.00 | Medium |
| `riskScore` | Access risk | risk | derived | UPI | composite (see §13) | A2 | 0.00 | Medium |

`A1*` = field exists in snapshot but the **classification rule is wrong** (`@lecg.com`, hardcoded in
both `featureSnapshot.ts` and `dataLayer.ts`); fix required.

> **Current vs proposed:** the live registry has `role, tier, project, isExternal, activity, signin`.
> This taxonomy keeps all six (renaming `isExternal → internalExternal`, fixing its rule), and adds
> `module`, `company`, `isAdmin`, `membershipAge`, `activityMix`, `permStrength`, `riskScore`.

---

## 1. `project` — Project membership

- **family** structure · **type** categorical · **node level** UPI/PRJ
- **source** `AccDcProjectUser.projectId` (label via `AccDcProject.name`)
- **availability** A1 (`NodeFeatureSnapshot.project`)
- **data reality** 428 distinct projects; every node belongs to exactly one. Strongest structural axis.
- **visual use** slider (default-high) · color · filter · **edge** (shared-project, hub-capped)
- **target strategy** one volumetric anchor per project (spherical-Fibonacci, as today). 428 anchors
  is well within readable range.
- **color strategy** hashed hue per project (current `nodeColors` FNV approach is fine).
- **edge strategy** shared-project ⇒ **project hub node**, never clique (largest projects have
  hundreds of members; see engine strategy §edge taxonomy).
- **default weight** 0.35 · **confidence** High
- **sparsity** none. **test** clustering ratio rises as slider→100; 428 distinct anchors present.

## 2. `role` — Role

- **family** structure · **type** categorical · **node level** UPI
- **source** `AccDcProjectUserRole.roleId` ⋈ `AccRole.name` · **availability** A1 (`.role`)
- **data reality** ~80 roles; single-valued for 98% of nodes (280 multi-role nodes). Broad roles
  (Architect 229u, Owner 446u) vs org-wide automation roles (Marketing 1u/27proj).
- **visual use** slider · color · filter · **edge** (same-role, threshold/top-k capped)
- **target strategy** one anchor per role; multi-role nodes use their primary (highest-privilege) role.
- **color strategy** hashed hue per role name.
- **edge strategy** same-role direct edges only for **small roles** (≤ N users, e.g. ≤25);
  large/broad roles use a role hub or are grouping-only.
- **default weight** 0.25 · **confidence** High
- **sparsity** ~40 roles have 1–20 assignments → fold rare roles into an "Other role" anchor for layout.
- **test** multi-role node count == 280; rare-role folding deterministic.

## 3. `tier` — Permission tier (folder)

- **family** access · **type** categorical (orderable → scalar) · **node level** UPI/FP
- **source** `AccFolderPermission.permType` joined through the node's `roleId`
- **availability** A1 (`NodeFeatureSnapshot.permTier`, `permissionCoverage`)
- **data reality** 5 ordered tiers (View Only → … → Full Controller). **Only ~85/1,143 projects
  crawled** → tier is `unknown` for most nodes; `permissionCoverage` flag distinguishes
  known/partial/unknown.
- **visual use** slider · color · **risk badge** (Full Controller) · **edge** (shared folder+tier)
- **target strategy** anchor per tier on an ordered axis (View Only ↔ Full Controller); `unknown`
  nodes get **no tier attraction** (stay in organic base — never collapse to an "unknown" pole).
- **color strategy** sequential ramp by tier strength (not hashed — order is meaningful).
- **edge strategy** shared-folder+tier edges only within crawled projects; threshold by folder overlap.
- **default weight** 0.15 · **confidence** Medium
- **sparsity** dominate-`unknown`: weight must scale by `permissionCoverage` so unknown nodes are not
  yanked. **test** unknown nodes receive 0 tier force; known-tier ordering monotonic.

## 4. `module` — Module signature (NEW)

- **family** access · **type** multi-hot · **node level** UPI
- **source** `AccDcProjectUserProduct.productKey` (+ `accessLevel`) · **availability** A2
- **data reality** 9 per-user product keys; `insight`+`docs` near-universal (baseline) →
  exclude from signature. Signature = {build, modelCoordination, designCollaboration, cost, takeoff,
  forma, autoSpecs}.
- **visual use** advanced slider · color (by dominant non-baseline module) · filter · **edge**
  (shared-module / shared module-combination)
- **target strategy** multi-hot → centroid of active module anchors (a node with build+cost sits
  between the two anchors). Baseline products contribute 0.
- **color strategy** color by highest-signal module; or module-count ramp.
- **edge strategy** shared *non-baseline* module ⇒ KNN/top-k on Jaccard of module sets (avoid
  baseline-driven mega-cliques).
- **default weight** 0.15 · **confidence** High
- **sparsity** most nodes only have baselines → small/empty signature; those get weak module force.
- **test** baseline exclusion verified; Jaccard symmetric; no edge from baseline-only overlap.

## 5. `company` — Company / firm (NEW)

- **family** affiliation · **type** categorical · **node level** UPI/CO
- **source** `AccDcProjectUserCompany.companyId` ⋈ `AccDcCompany.name` · **availability** A2
  (currently `NodeFeatureSnapshot.firmName` exists but is not a slider dimension)
- **data reality** 319 firms; Hermosillo = 78% of rows; long tail of external firms.
- **visual use** color · filter · **edge** (firm affiliation) · detail metric
- **target strategy** anchor per firm, but Hermosillo is so dominant it should *not* form one tight
  pole — cap its attraction or treat Hermosillo as "internal core" via `internalExternal` instead.
- **color strategy** hashed hue per firm; group rare firms into "Other firm".
- **edge strategy** firm affiliation ⇒ **firm hub node** (Hermosillo hub would otherwise be ~10k-clique).
- **default weight** 0.10 · **confidence** High
- **sparsity** 20% of nodes have no company. **test** Hermosillo never produces a raw clique.

## 6. `internalExternal` — Internal / external (FIX EXISTING)

- **family** affiliation · **type** categorical (3-way: internal / external / unknown) · **node level** UID
- **source** `AccDcUser.email` domain vs configurable `internalDomains = ["hermosillo.com"]`;
  fallback to company only when email missing.
- **availability** A1* — field `isExternal` exists but the rule is broken (`@lecg.com` matches 0 users).
  The defective `@lecg.com` rule is hardcoded in **two** sites that must both be fixed:
  `featureSnapshot.ts` (inline SQL `is_external` CASE) and `dataLayer.ts`
  (`INTERNAL_DOMAINS = Set(["lecg.com"])`).
- **data reality** internal 1,265 / external 2,102 / unknown 0 under the proposed rule. **Current code
  labels all 3,367 external.**
- **visual use** slider · color (internal/external/unknown) · filter · **risk context for edges**
- **target strategy** binary/ternary axis: internal pole ↔ external pole, unknown = no force.
- **color strategy** fixed 2–3 color scheme (not hashed): internal, external, unknown.
- **edge strategy** "external collaboration" edge = external node sharing a project with internal nodes.
- **default weight** 0.10 · **confidence** High
- **sparsity** none today (all emails present), but keep `unknown` handling for future null emails.
- **test** internal count == 1,265 with `["hermosillo.com"]`; allowlist is config-driven, not hardcoded;
  null/empty email → unknown (not external). **This dimension's fix is the top-priority defect.**

## 7. `isAdmin` — Admin vs member (NEW, promote from feature)

- **family** access · **type** binary · **node level** UPI
- **source** `AccDcProjectUserProduct.accessLevel='project_admin'` OR
  `AccProjectRole.projectAdminAccessLevel` set · **availability** A1 (already used in `mathLayer` `isAdmin`)
- **data reality** project_admin product rows are common (e.g. 4,615 docs-admin); 6,612 project-role
  admin grants. A meaningful binary split.
- **visual use** slider · color · filter · **risk badge**
- **target strategy** binary axis admin ↔ member.
- **default weight** 0.10 · **confidence** High
- **test** admin predicate matches the headline-count predicate (the shared-`isAdmin` fix in commit
  84e85ef) so headline == drill-down.

## 8. `activity` — Activity volume

- **family** behavior · **type** scalar · **node level** ACT/UID
- **source** `AccActivity` count rollup per actor (`autodeskId`/`userEmail`), bucketed
  None/Low/Med/High · **availability** A1 (`activityBucket`, `activityCountRaw`)
- **data reality** 226,190 events but **only 26% of users** have any; 38-day window. Most nodes = None.
- **visual use** slider · color · detail metric · **risk badge** (dormant-but-privileged)
- **target strategy** scalar via `log1p` + min-max (as in `mathLayer` `activity`); None = no force.
- **color strategy** sequential ramp.
- **default weight** 0.05 · **confidence** Medium
- **sparsity** dominant None → low weight; do not let "None" form a giant pole.
- **test** bucket thresholds stable; None nodes get 0 activity force.

## 9. `activityMix` — Activity mix (NEW, optional)

- **family** behavior · **type** multi-hot · **node level** ACT/UID
- **source** `AccActivity` normalized category rollup (view/upload/edit/delete/projectEvent/memberEvent)
  via `lib/acc/activityCategories.ts` · **availability** A3 (DuckDB rollup; data present)
- **data reality** view 106k, projectEvent 59k, upload 44k, edit 14k, delete 1.4k, memberEvent 451.
- **visual use** color (dominant behavior) · filter · detail panel breakdown
- **target strategy** not a primary layout axis (behavior is noisy); default weight 0 (color/detail only).
- **default weight** 0.00 · **confidence** Medium
- **test** category rollup matches §2a totals (view 106,630 etc.).

## 10. `signin` — Sign-in recency

- **family** behavior · **type** temporal · **node level** UID
- **source** `AccDcUser.lastSignIn` bucketed (<7d/<30d/<90d/>90d/never) · **availability** A1 (`signinBucket`)
- **data reality** **66% null**; user-level only (per-instance is 100% null — do **not** use
  `AccDcProjectUser.lastSignIn`).
- **visual use** slider · color · **risk badge** (never-signed-in + privileged)
- **target strategy** temporal axis; never/unknown = no force (the 2,233 nulls must not pole).
- **default weight** 0.05 · **confidence** Low-Medium
- **sparsity** majority unknown → weight scaled down; surface as detail metric primarily.
- **test** never/unknown nodes get 0 signin force; buckets match §8 distribution.

## 11. `membershipAge` — Membership age (NEW, untapped)

- **family** tenure · **type** temporal · **node level** UPI
- **source** `AccDcProjectUser.addedOn` (days since added) · **availability** A2
- **data reality** **100% populated per instance** (0 null), range 2021 → today. The only
  fully-covered per-node temporal signal.
- **visual use** slider · color (tenure ramp) · detail metric · **edge** (same join-cohort, bucketed)
- **target strategy** scalar tenure axis (newest ↔ oldest); robust because no missing data.
- **color strategy** sequential ramp by age.
- **default weight** 0.05 · **confidence** High
- **sparsity** none. **test** 0 nulls; monotonic age ordering.

## 12. `permStrength` — Permission strength (NEW, derived)

- **family** risk · **type** scalar · **node level** FP
- **source** max ordinal of node's `permType` across folders (View Only=1 … Full Controller=5)
- **availability** A2 · **data reality** Full Controller concentrated in 16 roles / 141 rows.
- **visual use** slider · color (risk ramp) · **risk badge**
- **target strategy** scalar risk axis; `unknown` coverage = no force.
- **default weight** 0.00 (off by default; opt-in risk lens) · **confidence** Medium
- **test** ordinal monotonic; coverage-gated.

## 13. `riskScore` — Composite access risk (NEW, derived)

- **family** risk · **type** derived · **node level** UPI
- **source** composite of: external (`internalExternal`) × admin (`isAdmin`) × high permTier ×
  dormant sign-in × broad folder reach. (E.g. the **27 external project-admins** and **328 internal
  admins** surfaced in discovery §6 are the high-signal cohorts.)
- **availability** A2 (computed from the above dimensions) · **data reality** see §6/§7.
- **visual use** color (risk ramp) · **risk badge** · filter · sort in detail/list
- **target strategy** not a layout axis by default; a **lens/preset** that recolors + badges.
- **default weight** 0.00 · **confidence** Medium
- **sparsity** depends on permission coverage. **test** external-admin set size == 27; weights documented.

---

## 14. Universal slider weighting model

For dimension *d* and node *n* the **effective per-node weight** is:

```
effectiveWeight(d, n) =
    sliderNorm(d)            // [0,1]  user slider / 100
  × baseDimensionWeight(d)   // table above (default wt)
  × confidence(d)            // High=1.0, Medium=0.7, Low=0.4
  × availability(d, n)       // 1 if node has the attribute, 0 if missing/unknown
  × transformer(d, n)        // type-specific: categorical=1; scalar/temporal=normalized value
```

Then the node's layout target is the confidence/availability-weighted blend of active dimension
anchors (see engine strategy §slider model for the full vector math). **Key invariants:**

- `availability = 0` for missing/unknown values ⇒ sparse dimensions never drag unknown nodes into a pole.
- All sliders 0 ⇒ all `effectiveWeight = 0` ⇒ organic base layout (no sphere/disc/origin collapse).
- `confidence` down-weights Low-coverage dimensions (signin, permStrength) automatically.

---

## 15. Visual-form coverage matrix (does every parameter get used?)

| Parameter | slider | color | filter | edge | preset | badge | detail | position |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| project | ✓ | ✓ | ✓ | ✓(hub) | ✓ | | ✓ | ✓ |
| role | ✓ | ✓ | ✓ | ✓(cap) | ✓ | ✓ | ✓ | ✓ |
| tier | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ |
| module | ✓ | ✓ | ✓ | ✓(knn) | ✓ | | ✓ | ✓ |
| company | | ✓ | ✓ | ✓(hub) | ✓ | | ✓ | ✓ |
| internalExternal | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| isAdmin | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ |
| activity | ✓ | ✓ | ✓ | ✓(cooc) | ✓ | ✓ | ✓ | ✓ |
| activityMix | | ✓ | ✓ | | ✓ | | ✓ | |
| signin | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ |
| membershipAge | ✓ | ✓ | ✓ | ✓(cohort) | ✓ | | ✓ | ✓ |
| permStrength | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ |
| riskScore | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |

Every extracted parameter maps to **at least one** visual form, satisfying the product requirement.
