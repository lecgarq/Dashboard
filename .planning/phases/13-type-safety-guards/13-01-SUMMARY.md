---
phase: 13-type-safety-guards
plan: 01
subsystem: type-system
tags: [type-safety, never, compile-time-guard, lean-payload, drift-assert]
dependency_graph:
  requires: [Phase 10 boundary fixes]
  provides: [TYPE-01, TYPE-02 compile-time guards]
  affects: [lib/server/acc-hot-cache.ts, app/(dashboard)/users/accGraphFilters.ts]
tech_stack:
  added: []
  patterns: [local type alias narrowing, conditional type drift assert, import type erased at runtime]
key_files:
  modified:
    - lib/server/acc-hot-cache.ts
    - app/(dashboard)/users/accGraphFilters.ts
  created: []
decisions:
  - TYPE-01: LeanBulkAccProject/LeanBulkAccUser local type aliases + annotated lean .map; never[] enforced at construction site; shared BulkAccUser/BulkAccProject in acc-types.ts unchanged
  - TYPE-02: conditional type _DimKeysAreValid (subset, not equality); type-only import; _dimKeyGuard const; TODO replaced with live assert block comment
metrics:
  duration: 390s
  completed: "2026-06-30"
  tasks_completed: 2
  files_modified: 2
status: complete
---

# Phase 13 Plan 01: Type-Safety Guards Summary

Two compile-time-only guards that turn latent bug classes into hard `npx tsc --noEmit` errors.

## What Was Built

### TYPE-01 — lean bulkUsers roles/modules narrowed to never[] (`lib/server/acc-hot-cache.ts`)

At the lean-branch construction site in `getCachedAccDcBulkUsers` (the `if (!leanProjects) return assembled;` / `.map(...)` block), added local type aliases:

```ts
type LeanBulkAccProject = Omit<BulkAccProject, "roles" | "modules"> & {
  roles: never[];
  modules: never[];
};
type LeanBulkAccUser = Omit<BulkAccUser, "projects"> & {
  projects: LeanBulkAccProject[];
};
```

The lean `.map` is annotated `(u): LeanBulkAccUser` / `(p): LeanBulkAccProject`. Per-project literals use:

```ts
// lean payload — always empty; use bulkUser / hover-prefetch for per-project data
roles: [] as never[],
modules: [] as never[],
```

`never[]` is assignable to `string[]`, so `LeanBulkAccUser[]` is assignable to `BulkAccUser[]` — the function's declared return type, non-lean callers, and all consumers compile unchanged. The shared `BulkAccUser` / `BulkAccProject` interfaces in `lib/acc/acc-types.ts` are **unchanged**.

Also added `BulkAccProject` to the existing `import type { BulkAccUser }` from `@/lib/acc/acc-types`.

**Negative-case proof:** Changed lean literal to `roles: ["x"]` (no assertion). `npx tsc --noEmit` errored:
```
lib/server/acc-hot-cache.ts(411,19): error TS2322: Type 'string' is not assignable to type 'never'.
```
Guard bites. Reverted to `[] as never[]`.

### TYPE-02 — one-directional subset drift assert (`app/(dashboard)/users/accGraphFilters.ts`)

Replaced the line-15 `TODO` comment block with:

1. A type-only import at the top of the file:
   ```ts
   import type { SimilarityDim } from "@/lib/acc/userSimilarity";
   ```
   `import type` is erased at runtime; userSimilarity.ts does not import accGraphFilters.ts (no cycle); no runtime dep introduced into this pure module.

2. A conditional type + const guard after `SimilarityDimKey`:
   ```ts
   type _DimKeysAreValid =
     SimilarityDimKey extends SimilarityDim
       ? true
       : ["DRIFT", Exclude<SimilarityDimKey, SimilarityDim>];
   const _dimKeyGuard: _DimKeysAreValid = true;
   ```
   - Compiles today (7 filter keys ⊆ 12 engine dims).
   - If a filter key is renamed/removed so it leaves the engine union, `_DimKeysAreValid` resolves to `["DRIFT", <key>]` and `= true` fails, naming the drifted key.
   - NOT bidirectional: the 5 engine-only dims (admin-tier, internal-external, company-role, module-mix, firm-affiliation) are intentionally absent from `SimilarityDimKey` and would fail a bidirectional assert.

Updated the comment block to document the live assert rather than a deferred TODO.

**Negative-case proof:** Renamed one `SimilarityDimKey` member to `"roles-XYZ"`. `npx tsc --noEmit` errored:
```
app/(dashboard)/users/accGraphFilters.ts(50,7): error TS2322: Type 'boolean' is not assignable to type '["DRIFT", "roles-XYZ"]'.
```
Guard bites, drifted key named. Reverted.

## Verification Results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` (whole tree) | PASS — 0 errors |
| `npx vitest run accGraphFilters` | PASS — 51/51 |
| TYPE-01 negative case: `roles: ["x"]` | ERRORS TS2322 "Type 'string' is not assignable to type 'never'" |
| TYPE-02 negative case: `"roles-XYZ"` in SimilarityDimKey | ERRORS TS2322 `["DRIFT", "roles-XYZ"]` |
| `lib/acc/acc-types.ts` BulkAccUser unchanged | VERIFIED — no diff |
| `/users/spatial-graph` untouched | VERIFIED |
| Zinc theme, WebGL guardrail | Not applicable — compile-time-only change |

## Changed Files

| File | Change | Commits |
|------|--------|---------|
| `lib/server/acc-hot-cache.ts` | TYPE-01: BulkAccProject import + LeanBulkAccProject/LeanBulkAccUser aliases + lean .map annotations + never[] literals + comment | e0d46b91 |
| `app/(dashboard)/users/accGraphFilters.ts` | TYPE-02: import type SimilarityDim + _DimKeysAreValid conditional type + _dimKeyGuard const + TODO replaced with live assert comment block | 965993fd |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| e0d46b91 | feat(13-01) | TYPE-01 — narrow lean bulkUsers roles/modules to never[] |
| 965993fd | feat(13-01) | TYPE-02 — add one-directional subset drift assert in accGraphFilters.ts |

## Deviations from Plan

### Auto-corrected File Path (CONTEXT.md correction already pre-authorized)

The CONTEXT.md / plan objective noted that CONTEXT.md assumed the lean `bulkUsers` return type lived in `server/routers/acc-members.ts`, but the plan's `<objective>` section (and the `<context>` `<interfaces>` block) already corrected this to `lib/server/acc-hot-cache.ts` — the real lean construction and return site. No deviation from the plan as written; the plan included the verified file path.

### TYPE-01 approach: local type aliases (as planned)

The plan's "Concrete approach" specified introducing `LeanBulkAccProject`/`LeanBulkAccUser` type aliases and annotating the lean `.map`. This was implemented exactly. The simpler `as never[]`-only approach was considered and rejected because `as` assertions bypass type checking — the negative-case proof confirmed that `["x"] as never[]` does NOT produce a tsc error (the assertion overrides the check), making a guard-only-via-cast approach ineffective. The plan's specified approach (type alias + annotation) correctly causes `roles: ["x"]` WITHOUT an assertion to error TS2322.

## Dashboard Constraints Applied

- No runtime behavior changed — compile-time type guards only.
- No WebGL added, no /users/spatial-graph touched.
- Zinc theme unaffected.
- No rebuild / `:3000` restart performed.
- Pre-existing unrelated working tree changes preserved — only `lib/server/acc-hot-cache.ts` and `app/(dashboard)/users/accGraphFilters.ts` staged and committed (by explicit path).
- Pre-staged index confirmed empty before each commit (staging hazard on WIP branch).

## Workshop Impact

None. This is contributor safety hardening only. The four workshop pages (`/users`, `/access-analysis`, `/template-mty`, `/forma-proposal`) behavior is unchanged.

## Data Truthfulness

None. Types describe an existing runtime contract (lean payload is already always-empty at runtime; filter union already subsets the engine union). No metric, source, or coverage claim added or altered.

## Known Stubs

None.

## Threat Flags

None. Both changes are compile-time-only (no network, runtime, schema, or payload change). The `import type` is erased at runtime. Per the threat model (T-13-01, T-13-02): accepted, gates passed.

## Dashboard Self-Check

- **Context:** STATE.md (phase 13, position and decisions), PLAN.md (13-01), 13-CONTEXT.md (locked decisions), acc-hot-cache.ts (lean branch lines 391-402), accGraphFilters.ts (TODO line 15, SimilarityDimKey lines 19-26), userSimilarity.ts (SimilarityDim lines 20-32), acc-types.ts (BulkAccUser/BulkAccProject — verified unchanged), tsconfig.json (strict: true, isolatedModules: true, @/* alias).
- **Evidence:** Lean branch confirmed at acc-hot-cache.ts:391-402 returning `BulkAccUser[]`; TODO at accGraphFilters.ts:15; SimilarityDimKey 7-member; SimilarityDim 12-member; `import type { BulkAccUser }` verified as the existing import pattern; BulkAccProject confirmed required for the Omit alias.
- **Constraints:** never[] (not readonly); subset (not equality); type-only import; shared BulkAccUser/BulkAccProject untouched; no new files/packages; spatial-graph out of scope; no rebuild.
- **Gates:** `npx tsc --noEmit` (primary, whole tree, PASS); `npx vitest run accGraphFilters` (51/51, PASS); both negative-case proofs run and reverted (error text recorded above). No rebuild gate — this is compile-time-only.
- **VERIFY:** None remaining.

## Self-Check: PASSED

- [x] `lib/server/acc-hot-cache.ts` exists and committed (e0d46b91)
- [x] `app/(dashboard)/users/accGraphFilters.ts` exists and committed (965993fd)
- [x] Both commits verified: `git log --oneline -5` confirms e0d46b91 and 965993fd
- [x] `lib/acc/acc-types.ts` unchanged (no diff against HEAD)
- [x] `npx tsc --noEmit` passes — 0 errors
- [x] `npx vitest run accGraphFilters` 51/51 green
- [x] Negative-case proofs run and reverted (error text recorded)
- [x] Only the 2 source files staged per task (explicit path, diff --cached verified before each commit)
