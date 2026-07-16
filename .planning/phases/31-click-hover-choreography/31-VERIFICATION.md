# Phase 31 Verification — Click & Hover Choreography

**Status:** VERIFIED + DEPLOYED
**Completed:** 2026-07-16
**Production BUILD_ID:** `YTIBgQ4sRBXlonyphxjTq`

## Requirement coverage

### LIFE-01 — Click choreography

**PASS.** `GraphCanvas2D.tsx` exposes the frozen Cosmos camera snapshot,
focus, and restore seam. `GraphInteractions.tsx` snapshots once per focus
session, focuses subsequent match navigation without replacing the snapshot,
and restores through the shared null-isolate path used by background click,
Escape, and rail Close. Camera calls use 180ms / 2.25 scale and
`enableSimulation=false`; reduced motion uses duration 0.

`usePredicateEngine.ts` now lights exactly the selected instance plus the
supplied Phase-30 distinct matches. Same-user project memberships and twins
remain dim. `SimilarityWebOverlay.tsx` and `similarityWeb.ts` draw the ambient
web first, selected-to-match edges second (including authoritative fallback
edges omitted by the capped global web), and hovered incident edges last.

Evidence:

- Commits `849d74d4`, `4821cac3`.
- `GraphCanvas.test.ts`, `GraphInteractions.test.tsx`,
  `usePredicateEngine.test.ts`, and `similarityWeb.test.ts`.
- Isolated production Playwright: 10 match rows produced 11 lit nodes; a match
  click changed the isolated node while retaining the same rail; Close cleared
  focus. Existing click/Escape browser smoke also passed.

### LIFE-02 — Hover life

**PASS.** Hover immediately lifts the renderer index for incident-edge
priority while leaving click focus intact. A cancellable 80ms timer reveals
`NodeTooltip` at the real graph-wrapper origin. The tooltip shows permission
tier, activity recency, and folder breadth, with partial/unknown coverage
rendered truthfully.

Evidence:

- Commit `849d74d4`.
- `GraphInteractions.test.tsx`, `SimilarityWebOverlay.test.tsx`, and
  `NodeTooltip.test.tsx`.
- Isolated production Playwright verified the real handler path, headline
  tooltip copy, delayed reveal, clean cancellation, and zero console errors.

### LIFE-04 — Enriched click panel

**PASS.** The floating match card was removed. One right rail now contains one
identity header and Close action, the complete closest-match/twin/why evidence,
then the existing ACC profile body in one scroll region. Loading, empty, and
error states are explicit. User detail remains above lasso and base controls.
The rail swaps concurrently over 180ms ease-out; reduced motion removes
translation and uses duration 0.

Evidence:

- Commit `923428f1`.
- `NeighborMatchesPanel.test.tsx`, `UserProfilePanel.test.tsx`,
  `RightPanelStack.groupBy.test.tsx`, and `embeddingMapSeam.test.tsx`.
- Isolated production Playwright verified one rail header, no `Open profile`
  action, matches before the ACC body, ten distinct match rows, in-place match
  navigation, Close clear, and zero console errors.

### PERF-02 invariant

**PASS.** `GraphCanvas.test.ts` stayed green. No interaction camera call starts
or reheats Cosmos simulation; every new programmatic camera call explicitly
passes `enableSimulation=false`.

## Gate record

- Plan 31-01 focused Vitest: **6 files / 47 tests passed**.
- Plan 31-02 focused Vitest: **4 files / 30 tests passed**.
- Phase-wide focused + TEST-01/02/03 gate (excluding the separately recorded
  Phase-25 aperture file): **15 files / 109 tests passed**.
- Broad relevant run: **121 passed / 3 failed**. The three failures are the
  already-recorded Phase-25 banded-catalog aperture tests in
  `__tests__/usePredicateEngine.test.tsx`; STATE records their stash-and-rerun
  proof as pre-existing WIP. One stale same-user-footprint assertion found by
  this run was updated to the locked Phase-31 match-only behavior.
- `npx tsc --noEmit`: **clean** before the isolated build, before deployment,
  and after the live-route smoke addition.
- `node scripts/repo-map/check.cjs`: **passed** against the tracked baseline
  before regeneration (2 dependency warnings, 236 ast-grep findings).
- `npm run repo-map:check`: regeneration completed, then reported one
  above-baseline `no-scripts-to-app` warning from the pre-existing uncommitted
  `scripts/build-instance-features.ts` →
  `instanceFeatureNumerics.ts` import. No Phase-31 file participates in that
  boundary. The generated architecture summary was not committed.
- Legacy `run-engineering-gates.cjs --static-only`: typecheck and boundary
  checks passed; its repo-map subgate reflected the unrelated warning above,
  and its Unix `grep` command cannot run under Windows PowerShell. This wrapper
  is not used as positive Phase-31 evidence.
- Impeccable deterministic design gate over all changed TSX surfaces: `[]`
  (**zero findings**).
- Isolated webpack production build on `:3100`: **passed**, BUILD_ID
  `hG0GCNyPEH_lE6r_iUSWg`.
- Existing production-browser smokes on the isolated build: click/Escape and
  embedding-map neighbor section **2 passed**. The legacy hover smoke failed
  before exercising hover because `getNodeScreenPosition` returned null; the
  Phase-31 handler-based replacement spec passed instead.
- `tests/e2e/phase31-focus.spec.ts` on isolated `:3100`: **2 passed** (hover
  tooltip/cancel; click/10 matches/11 lit nodes/navigation/Close).
- Live authenticated smoke on `:3000`: **1 passed** for both
  `/users/spatial-graph` and `/users/access-analysis`.
- Production `npm run build`: **passed**. Dashboard task Running, port 3000
  listening, `/api/health` 200 with database connected. Unauthenticated route
  probes returned the expected 307 auth redirect; authenticated Playwright
  proved both graph shells rendered.

## Deployment

`autoDeploy:true` invoked the full local deploy sequence. The scheduled
Dashboard task was stopped, port 3000 freed, typecheck and production build
passed, then the task was restarted and probed. The rebuild deployed the
complete current working tree, as this repository's local policy specifies;
Phase-31 commits themselves remained surgically scoped.

Production evidence:

- Dashboard task: **Running**
- Postgres scheduler entry: **Ready**; `/api/health` reports database connected
- Port: **3000 listening**
- BUILD_ID: `YTIBgQ4sRBXlonyphxjTq`
- Authenticated routes: `/users/spatial-graph` and `/users/access-analysis`
  both rendered the graph shell

## Deviations and debt

- `embeddingMapSeam.test.tsx` required no source edit; its existing seam stayed
  green.
- The old sequential `AnimatePresence mode="wait"` rail swap contradicted the
  locked one-transition behavior and was replaced by a concurrent fixed-width
  swap during 31-02.
- No new durable Phase-31 debt or `VERIFY:` item remains. The three Phase-25
  aperture failures and broad e2e drift remain in existing STATE/CONCERNS
  entries and were not duplicated.

## Phase commits

- `e9c7164f` — capture Phase 31 context
- `d7e40204` — plan click and hover choreography
- `849d74d4` — add graph focus choreography
- `923428f1` — unify graph focus rail
- `4821cac3` — verify production focus choreography
- `a2df4754` — probe live graph routes
