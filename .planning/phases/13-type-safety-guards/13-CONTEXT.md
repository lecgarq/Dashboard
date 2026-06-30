# Phase 13: Type-Safety Guards - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Two internal, compile-time-only type guards. No runtime behavior, no workshop-page,
data-authority, UI, or deploy/rebuild impact.

1. **TYPE-01** — the lean `bulkUsers` return type in `server/routers/acc-members.ts`
   marks `roles`/`modules` as always-empty so consumers cannot silently expect
   populated arrays. _(CONCERNS §4.1, REQUIREMENTS TYPE-01)_
2. **TYPE-02** — `app/(dashboard)/users/accGraphFilters.ts:15` replaces the deferred
   `TODO` with a compile-time assert that fails if the filter union drifts out of the
   canonical engine union. _(CONCERNS §4.2, REQUIREMENTS TYPE-02)_

Out of bounds: resolving the two `dataLayer.ts` per-project roles/modules `TODO`s
(blocked on the DC CSV join → DC-02, external), expanding the filter UI to expose more
similarity dims, and any `/users/spatial-graph` change.

</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` (Phase 13 entry, lines 112-122) — goal + 2 success criteria;
  depends on Phase 10 (complete).
- `.planning/REQUIREMENTS.md` — TYPE-01, TYPE-02 (both Pending; only open v2.1 items
  besides Phase 14).
- `.planning/codebase/CONCERNS.md` §4.1 / §4.2 — original concern descriptions and
  guardrail wording (`never[] // lean payload — always empty`; `AssertExtends` / `satisfies`).
- `app/(dashboard)/users/accGraphFilters.ts` — VERIFIED: `SimilarityDimKey` is a **7-member**
  union (lines 19-26); the `TODO` lives at line 15; the comment notes the type is kept local
  "to avoid a cross-module type-only cycle (imported by both client UI and pure unit tests)."
- `lib/acc/userSimilarity.ts:20-32` — VERIFIED: `SimilarityDim` is a **12-member** union
  (the 7 filter keys + `admin-tier`, `internal-external`, `company-role`, `module-mix`,
  `firm-affiliation`). The two unions are intentionally a **subset relationship**, not equal.
- `server/routers/acc-members.ts` — VERIFIED: `BulkAccUser` enrichment fields are explicitly
  **optional** ("fields are optional on BulkAccUser so no existing consumer is broken", lines 8-14).
- VERIFY (for researcher/planner): the exact lean `bulkUsers`/bulk-summary procedure name and
  its return-shape location in `server/routers/acc-members.ts`, and that no current consumer
  of the lean payload *writes/reassigns* `roles`/`modules` (readers are unaffected by `never[]`).

</evidence>

<defaults>
## Inferred Dashboard Defaults

- `npx tsc --noEmit` is the primary and sufficient gate — both criteria are "the assert
  compiles / `tsc` passes." No rebuild or `:3000` restart is required (no runtime change).
- Keep `accGraphFilters.ts` import-light: it is imported by both client UI and pure Vitest
  tests, so the drift assert must use a **type-only** import (`import type`) of `SimilarityDim`,
  which is erased at runtime and cannot reintroduce the documented cross-module cycle or pull
  the similarity engine's runtime deps into the pure module.
- Narrow only the lean procedure's **return type** — do not change the shared `BulkAccUser`
  interface (it is also produced, populated, by `enrichedUsers`/`bulkUser`).
- No new files, packages, or dependencies; edits stay inside the two named files (plus an
  optional inline type alias).

</defaults>

<decisions>
## Implementation Decisions

### TYPE-02 — drift assert semantics (accGraphFilters.ts)
- **One-directional subset assert**: every `SimilarityDimKey` must be a valid `SimilarityDim`.
  This *passes today* (7 ⊆ 12) and fails to compile only if a filter key is renamed/removed so
  it no longer maps to the canonical engine union. Shape, e.g.:
  ```ts
  type _DimKeysAreValid =
    SimilarityDimKey extends SimilarityDim ? true
    : ["DRIFT", Exclude<SimilarityDimKey, SimilarityDim>];
  const _dimKeyGuard: _DimKeysAreValid = true;
  ```
- **Rejected: bidirectional equality.** It would *fail immediately* (engine has 5 dims the
  filter union deliberately omits) and pressure a 5-filter scope expansion — wrong for a
  type-safety phase. The exact `satisfies`-vs-conditional-type form is Claude's discretion as
  long as the semantics are subset.

### TYPE-01 — lean payload guard (acc-members.ts)
- Type the lean `bulkUsers` return `roles`/`modules` as **`never[]`** with an explicit comment:
  `// lean payload — always empty; use bulkUser / hover-prefetch for per-project data`.
- Narrow the **lean return only**, not the shared `BulkAccUser`. `never[]` keeps readers
  (`.map`, `.length`) compiling and blocks pushing/assigning non-empty values.
- **Rejected: comment-only** (not compiler-enforced) and **`readonly never[]`** (over-strict;
  blocks reassignment and risks consumer touch-ups beyond this phase's scope).

### Claude's Discretion
- Exact assert syntax/helper name (`AssertExtends` alias vs inline conditional vs `satisfies`),
  comment wording, and where in each file the guard sits — provided semantics match the above.
- Whether to add a tiny named type alias for readability vs an inline `const _guard`.

</decisions>

<specifics>
## Specific Ideas

- The drift assert is a *latent-bug catcher*, not a feature: it should read as an obvious
  invariant a future contributor can't miss when editing either union.
- Prefer an assert that, on failure, surfaces *which* key drifted (e.g. via `Exclude<...>` in
  the error type) rather than a bare `never`, so the compile error is self-explaining.

</specifics>

<workshop>
## Workshop Impact

- **None** — repo-only internal type hardening. No change to `/users`, `/access-analysis`,
  `/template-mty`, or `/forma-proposal` rendering or data. Benefit is contributor safety:
  the lean-payload trap (memory 2026-06-18) and silent filter-union drift become compile errors.

</workshop>

<data_truth>
## Data Truthfulness

- **No data changes.** Types describe an existing runtime contract (lean payload is already
  empty at runtime; the filter union already subsets the engine union). No metric, source, or
  coverage claim is added or altered.

</data_truth>

<deferred>
## Deferred Ideas

- Populating per-project `roles`/`modules` in the lean payload — blocked on the DC CSV
  `activity_in_module` / `total_activity` join (DC-02, external). The two `dataLayer.ts`
  `TODO`s stay until then.
- Exposing the 5 engine-only similarity dims (`admin-tier`, `internal-external`,
  `company-role`, `module-mix`, `firm-affiliation`) as UI filters — product/UX decision,
  not part of a type-safety phase.

</deferred>

<verification>
## Verification Expectations

- `npx tsc --noEmit` is the success gate for BOTH criteria (assert compiles; lean return
  narrows without breaking existing readers). No rebuild / `:3000` restart needed.
- Run the existing Vitest suite (`npm test`) to confirm the `accGraphFilters` pure tests still
  pass — the type-only import must not pull runtime deps into that module.
- Negative-case check: temporarily break each guard (rename a filter key; push a value onto the
  lean array) and confirm `tsc` errors, then revert — proves the guard actually bites.
- Dashboard guardrails: zinc theme untouched, no new WebGL, `/users/spatial-graph` not modified
  (the two edited files are the route's filter module and the members router only).

</verification>

---

*Phase: 13-type-safety-guards*
*Context gathered: 2026-06-30*
