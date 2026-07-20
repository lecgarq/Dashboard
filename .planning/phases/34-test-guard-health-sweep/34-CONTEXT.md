# Phase 34: Test & Guard Health Sweep - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

First phase of v2.6 Full-Rate Graph. Five independent health items, no product-UI change:

1. **E2E-01** — re-baseline `tests/e2e/acc-dc-graph.spec.ts` green on an isolated `:3100`
   production build (node count 16,942 → 22,279; dead selectors → real v2.4+ surface).
2. **E2E-02** — close the `acc-3d-lasso.spec.ts` 120 s budget flake (CONCERNS §3.4),
   lever chosen from evidence.
3. **TEST-04** — resolve the 3 `usePredicateEngine` aperture failures so `npm test` is
   fully green with zero carried failures.
4. **GUARD-01** — `.claude/hooks/guard-bash.cjs` denies `powershell`/`pwsh -Command`-wrapped
   builds while `:3000` serves; regression check added.
5. **PIPE-02** — `scripts/compute_instance_embeddings.py` prunes stale
   `AccInstanceEmbedding` rows after each run (983 → 0), delete-only, gate-conditional.

**What does NOT change here:**

- **No renderer work** — Canvas2D/OffscreenCanvas/cosmos-links levers are Phase 35
  (REND-01/03). This phase only makes the suites able to gate Phase 35.
- **No fps measurement or deploy gate** — Phase 36 (REND-02).
- **No test-file splitting** — TEST-SPLIT-01 (CONCERNS §8.2/8.3 giant test files) stays
  deferred; E2E-01 re-baselines assertions inside the existing 1,167-line spec.
- **No new data source, table, migration, or npm dependency.** PIPE-02 is a delete +
  report inside the existing Python script; no schema change.
- **No graph UI edits** unless TEST-04 investigation proves a live aperture-filter bug
  (Decision 3 below pre-authorizes the smallest root-cause code fix).

**Name-collision trap (standing):** `app/(dashboard)/access-analysis/` = 23-panel charts
page — NOT touched. All TEST-04 files live under `app/(dashboard)/users/access-analysis/`
(the spatial-graph shell).

</domain>

<evidence>
## Grounding Sources

All scouted 2026-07-20 against the working tree (branch `feat/access-analysis-redesign`).

### E2E-01 — acc-dc-graph drift

- `tests/e2e/acc-dc-graph.spec.ts:17` — `const EXPECTED_NODE_COUNT = 16_942;` with the
  comment "Asserted exactly per the verification standard; bump this if the dataset
  changes." Live snapshot is 22,279 (v2.4 topology, confirmed at the 2026-07-14 dep-update
  e2e run and Phase 33 measurements).
- Dead selector `page.getByLabel("User name thumb")` at spec lines 236, 771, 775
  (curated-slider surface removed in v2.4).
- Replacement surface verified present in code: `group-by-select` testid and
  "Grouping strength" label live in
  `app/(dashboard)/users/access-analysis/GroupByControls.tsx` (+ its test).
- 3D-gated tests already `test.skip(!ACC_3D_GRAPH, …)` at lines 264/362/626/651 — the
  14 drift fails are in the default-flag (2D embedding map) path, not the parked 3D path.
- `VERIFY:` the exact current fail list — re-run the suite on a fresh `:3100` isolated
  build at plan execution before editing; the "14 fails" figure is from 2026-07-14 and
  the tree has moved (v2.5 shipped since).

### E2E-02 — lasso budget flake

- `playwright.config.ts:23` — per-test `timeout: 120_000` (this is the "120 s global
  budget"); `workers: 1`, `retries: 0`; webServer timeout 300_000;
  `NEXT_PUBLIC_ACC_GRAPH_TEST: "1"` set in config env.
- `tests/e2e/acc-3d-lasso.spec.ts` (138 lines): single test, gated
  `test.skip(!ACC_3D_GRAPH)` (line 53) and ALREADY carries `test.setTimeout(360_000)`
  (line 54). Its `gotoGraph` waitForFunction uses a 120_000 inner timeout (line 24).
- CONCERNS §3.4 (still open 2026-07-16): flake manifests under machine load; guardrail
  options named there = `test.slow()` / scoped timeout / reduced
  `NEXT_PUBLIC_ACC_GRAPH_TEST` fixture.
- `VERIFY:` reproduce the timeout under the flag-on run before choosing the lever — the
  existing 360 s `setTimeout` may already cover the test body, leaving the 120 s inner
  `waitForFunction` (line 23–25) as the actual budget that trips. Evidence decides;
  SC #2 requires consecutive recorded passing runs.

### TEST-04 — usePredicateEngine failures (reproduced live 2026-07-20)

- Repro: `npx vitest run` over the three predicate test files →
  `Test Files 1 failed | 2 passed (3)`, `Tests 3 failed | 18 passed (21)`.
- All 3 fails in `app/(dashboard)/users/access-analysis/__tests__/usePredicateEngine.test.tsx`,
  describe "usePredicateEngine — Phase 25 aperture filter (banded catalog values)":
  the resolver test passes, but the mask-predicate tests get `0.15` where `1.0` is
  expected — i.e. nodes that SHOULD match a banded catalog filter (`riskScore: High`,
  `company: Hermosillo`) are dimmed. Suspect: `valueResolvers` not honored on the
  hook's predicate path (resolution works standalone via `featureValueForDim`).
- File trap: THREE predicate test files exist — `usePredicateEngine.test.ts` (route root),
  `__tests__/usePredicateEngine.test.ts`, `__tests__/usePredicateEngine.test.tsx`. Only
  the `.tsx` one fails. Do not "fix" the wrong file.
- Provenance: failures proven pre-existing WIP at v2.4 Phase 25 (stash-and-rerun
  evidence, per REQUIREMENTS TEST-04).

### GUARD-01 — powershell-wrap bypass (root cause confirmed)

- `.claude/hooks/guard-bash.cjs:16` — quote-stripping runs FIRST:
  `cmd.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''")`. So
  `powershell -Command "npm run build"` becomes `powershell -Command ""` and the build
  regex (line 43) never sees the payload. That is the exact Phase-33 incident mechanism.
- The double-quoted-`$env:` trap to document at the rule: bash expands `$env:` inside
  double quotes to empty (recorded v2.5 trap), which is why powershell wraps get
  double-quoted in the first place — single-quoted from bash is the established form.
- **Working-tree WIP in the same file:** the `isolatedDist` NEXT_DIST_DIR exemption
  (lines 39–42) is uncommitted (HEAD `9b7337b4` lacks it). Decision 4 orders its commit
  before the GUARD-01 edit.
- No test exists for the hook today; it is a self-contained stdin→JSON script, trivially
  unit-testable by spawning `node .claude/hooks/guard-bash.cjs` with a JSON payload.
  Note the deny path for builds is async (socket probe to :3000) — a unit test must
  either stub the port or run a listener; cover both wrapped-deny and isolatedDist-allow.

### PIPE-02 — embedding stale rows

- `scripts/compute_instance_embeddings.py` (405 lines): EMB-05 trustworthiness gate at
  lines 367–384 — on `GATE FAIL` the function returns BEFORE `_upsert` (line 398).
  The prune must sit strictly after the gate-pass point so a trust regression aborts
  before ANY write, including the delete (REQUIREMENTS PIPE-02 wording).
- `_upsert(node_ids, coords, clusters, neighbors, run_id)` at line 318 receives the
  current run's full nodeId set — the prune's "absent from snapshot" complement comes
  from the same `node_ids` list; no new data source needed.
- `VERIFY:` the 983-stale-row figure live before the pruned run
  (`SELECT count(*) FROM "AccInstanceEmbedding" WHERE "nodeId" NOT IN (current set)` or
  equivalent script-side count) — figure dates from the v2.6 milestone-open audit.
- SC #5 requires a REAL run showing before→after (983→0) and the prune count in run
  output; a dry-run alone does not satisfy it.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- **Isolated builds only:** all e2e verification runs on the `:3100` harness with an
  isolated dist (`NEXT_DIST_DIR` mechanism); PowerShell-only build invocations,
  single-quoted from bash; never touch live `:3000` (`/lecg-ship` owns deploys). This
  phase has autoDeploy relevance only at phase end per config — no UI change means the
  route probe is a smoke check, not a visual UAT.
- **E2E-01 dead-test handling:** repoint an assertion to the current equivalent surface
  when one exists (physics-shell sidebar testids → `group-by-select` / "Grouping
  strength thumb" per REQUIREMENTS); delete a test only when the covered feature no
  longer exists in any form, with each deletion named in the plan summary.
- **3D-flag-gated tests stay parked:** re-baselining targets the default-flag path;
  `test.skip(!ACC_3D_GRAPH)` blocks are left gated, not deleted, not force-enabled
  (except as E2E-02's lasso evidence requires a flag-on run).
- **GUARD-01 regression check = hook unit test** (Vitest spawning the hook with JSON
  payloads), not a recorded manual matrix — repeatable beats one-shot evidence; the
  matrix remains a fallback only if the socket-probe async path proves untestable in CI
  time, with the fallback rationale recorded.
- **PIPE-02 output convention:** prune count printed in the same run summary that
  reports upserted rows (`Upserted N … / Pruned M stale`), matching the script's
  existing print style; delete-only — no schema, no soft-delete column.
- **TEST-04 rationale lands in the plan summary** (code-vs-test verdict + evidence),
  per REQUIREMENTS wording — not a new doc.
- **Commit discipline:** explicit paths only; `git diff --cached --name-only` before
  every commit; the branch carries heavy unrelated WIP (users/* deletions etc.) that
  must never be swept.

</defaults>

<decisions>
## Locked Owner Decisions (2026-07-20)

1. **E2E-01 node count: exact pin at 22,279.** Keep the verification-standard exact
   assert, bump the constant (comment stays "bump this if the dataset changes").
   Dataset drift going red is a deliberate signal, not a flake — strongest gate for the
   Phase 35/36 renderer work. No live-DB derivation, no tolerance band.

2. **GUARD-01 scope: `powershell` + `pwsh`, `-Command`-wrap forms.** The hook inspects
   inside the quoted wrapper when the command is a powershell/pwsh `-Command` invocation
   (i.e. build-regex the wrapped payload before/without quote-stripping it), denying
   wrapped `next build`/`npm run build` while `:3000` serves — same as bare forms, and
   honoring the existing `isolatedDist` exemption inside the wrapper. `-File`/
   `-EncodedCommand` forms are OUT of scope (recorded, not built). Regression check per
   defaults: hook unit test.

3. **TEST-04 pre-authorization: if evidence proves the banded-catalog aperture filter is
   broken in the live graph UI, fix the product code inside this phase without
   re-asking.** Smallest root-cause fix at the shared boundary
   (`usePredicateEngine.ts` predicate path), rationale + repro recorded in the plan
   summary. If instead the tests mis-encode intended behavior, correct the tests. No
   mid-phase owner checkpoint either way.

4. **guard-bash WIP: commit the existing uncommitted `isolatedDist` exemption FIRST as
   its own chore commit** (explicit path, `.claude/hooks/guard-bash.cjs` only), then land
   the GUARD-01 change on top. No fold-in, no leaving it working-tree-only.

## Requirement Traceability

- E2E-01 → Decision 1 + dead-test default + isolated-build default.
- E2E-02 → evidence-chosen lever (CONCERNS §3.4 options; VERIFY line in Evidence) +
  consecutive-recorded-runs SC.
- TEST-04 → Decision 3 + rationale-in-summary default.
- GUARD-01 → Decisions 2 + 4 + unit-test default + `$env:` trap documentation noted in
  Evidence.
- PIPE-02 → prune-after-gate placement + output convention default + real-run SC noted
  in Evidence.

## Deferred Items (captured, not widened)

- `-File`/`-EncodedCommand` powershell guard forms (Decision 2 scope cut).
- TEST-SPLIT-01 giant e2e file split — standing deferred; untouched here.
- Consolidation of the three duplicate `usePredicateEngine` test files — name-trap only;
  do not consolidate in this phase.

</decisions>
