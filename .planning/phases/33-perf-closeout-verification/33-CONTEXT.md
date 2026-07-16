# Phase 33: Perf Closeout & Verification - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

The life shipped in Phases 29–32 is actually felt: the app stops silently
refetching multi-MB prefetched payloads, the graph route stops parsing one
monolithic shell chunk before anything appears, and time-to-graph is
re-measured honestly. Plus one owner-added item: profile and best-effort
optimize the Canvas2D link-draw path whose truthful ceiling Phase 32 recorded.

1. **PERF-05 — shared hydration boundary fix.** A shared
   `deserializeHydrationState` (or equivalent) helper deserializes the
   superjson-wrapped `createServerSideHelpers().dehydrate()` state before
   `<HydrationBoundary>` at **all three** call sites:
   - `app/(dashboard)/users/spatial-graph/page.tsx:22-26` — already fixed
     inline (commit 9fb54cb8); migrates to the shared helper.
   - `app/(dashboard)/layout.tsx:45` — still raw; helpers created inline with
     `transformer: superjson` (line 29), prefetches
     families/clash-wiki/sim-wiki/exams/kpi-home/trello via `Promise.allSettled`.
   - `app/(dashboard)/users/page.tsx:13` — still raw; helpers via
     `createAccRouteHelpers()` + `prefetchUsersRouteAccData()`.
   A unit test pins the helper (wrapped → deserialized, raw → passthrough) so
   the bug class cannot silently return.
2. **PERF-06 — shell chunk code-split + re-measure.** Heavy static imports are
   code-split out of the `AccessAnalysisShell` initial chunk
   (CONCERNS §Ph28.1(2)); time-to-graph re-measured with the established
   `scripts/measure-spatial-graph-baseline.cjs` methodology (isolated `:3100`
   prod build, median-of-5) — **fresh pre-split baseline first**, then
   post-split; pass/fail decided by the in-phase pair (see Decisions).
3. **LINK-PERF (owner-added, 2026-07-16 discussion — no formal REQ id).**
   Profile the flag-OFF Canvas2D link-draw path (Phase-32 recorded ceiling:
   22,279 nodes / 14,200 links / 20.68 fps, Tier 0→1→2 degradation) and apply
   the highest-leverage safe optimizations. Best-effort: honest before/after
   fps recorded; no hard fps gate blocks the phase.

**Acceptance surface:** `/users/spatial-graph` (+ `/users/access-analysis`
alias) for PERF-06/LINK-PERF; app-wide dashboard routes for PERF-05
(`layout.tsx` wraps every dashboard page).

**Out of scope:** new graph features, embedding/neighbor recomputation, any
Phase 29–32 behavior change (ambient tiers, link bands, focus choreography,
panel content), the parked flag-ON 3D renderer, new dependencies, the
23-panel charts page. Milestone close/retrospective belongs to
`/lecg-close-milestone`, not this phase.

**Name-collision trap (standing):** the graph surface is
`app/(dashboard)/users/access-analysis/`; `app/(dashboard)/access-analysis/`
is the untouched charts page.
</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` Phase 33 + `.planning/REQUIREMENTS.md` PERF-05/PERF-06
  — success criteria, 28.1 median 4,360 ms reference, "any regression blocks"
  language (re-decided below), full gate sweep + autoDeploy.
- `.planning/codebase/CONCERNS.md` §Ph28.1(1)/(2) + 2026-07-16 refresh §A —
  hydration miss CONFIRMED STILL LIVE at `layout.tsx:45` and
  `users/page.tsx:13`; fixed reference implementation at
  `spatial-graph/page.tsx:22-26`; §Ph28.1(2) names the shell chunk
  (cosmos.gl, framer-motion, duckdb client, ~60 static imports) as the
  dominant remaining time-to-graph cost after the hydration fix.
- Direct reads 2026-07-16: all three call sites confirmed as described;
  `lib/server/acc-route-hydration.ts` (63 lines) owns `createAccRouteHelpers`
  for the two ACC routes; `layout.tsx` builds its own helpers inline.
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` (774 lines,
  ~60 static imports) — already `dynamic()`-loaded by
  `AccessAnalysisShellClient.tsx:16` behind `GraphLoadingSkeleton`; the split
  target is *within* this chunk. `@duckdb/duckdb-wasm` is ALREADY dynamic
  (`duckdbClient.ts:26` awaits the import; shell imports only types + the
  lazy getter) — the wasm bundle is not the static-chunk cost. Confirmed
  static heavy deps: `@cosmos.gl/graph` (`GraphCanvas2D.tsx:27`, via
  `GraphCanvas` static import) and `framer-motion`
  (`RightPanelStack.tsx:18`, others).
- `scripts/measure-spatial-graph-baseline.cjs` — re-runnable Phase-24/28
  orchestrator: preflight `:3100`, records cosmos version/BUILD_ID/commit,
  runs the `spatial-graph-baseline` Playwright spec (N=5), emits JSON. Build
  recipe embedded in the script header (`NEXT_PUBLIC_ACC_GRAPH_TEST=1`,
  `NEXT_DIST_DIR=.next-e2e`, `npx next build --webpack`, `next start -p 3100`).
- `.planning/phases/32-ambient-life-link-expression/32-VERIFICATION.md` +
  STATE — truthful full-link ceiling 20.68 fps with visible Tier 0→1→2
  degradation; recorded explicitly for Phase-33 profiling.
- `32-CONTEXT.md` — Phase 32 draw priority (ambient/selected/hover layers),
  three strength bands, 25%-floor morph web: LINK-PERF must preserve all of it.
- VERIFY: none outstanding — all figures above are from source or recorded
  phase evidence; the 4,360 ms median and 20.68 fps ceiling are prior recorded
  measurements, to be re-measured (not reused) this phase.
</evidence>

<defaults>
## Inferred Dashboard Defaults (planner may assume)

- **Helper home:** a small neutral server module (e.g.
  `lib/server/hydrationState.ts`) importable by all three server components —
  `layout.tsx` prefetches non-ACC routers, so the helper does not belong
  inside `acc-route-hydration.ts`; that file may re-export or call it. Keep
  the `{ json }`-wrapper guard so a raw state passes through unchanged.
- **PERF-05 proof:** unit test pins the helper; plus one browser-level
  network check on the isolated `:3100` build showing prefetched queries do
  NOT refetch on mount (network-request evidence, per SC "verifiably
  hydrate"). No new e2e suite — one focused check recorded in VERIFICATION.
- **Split mechanics:** `next/dynamic` (already the repo idiom at
  `AccessAnalysisShellClient.tsx`) for deferred pieces; no new dependencies,
  no webpack config surgery beyond what `next build --webpack` already does.
- **Measurement:** reuse `scripts/measure-spatial-graph-baseline.cjs`
  unmodified (or with additive-only fields); isolated `.next-e2e` build on
  `:3100`; never build while `:3000` serves (guard-bash enforces).
- **Profiling tooling (LINK-PERF):** browser-native (Performance panel /
  `performance.now()` instrumentation on the existing rAF path) — no new deps.
- **Gates:** `npx tsc --noEmit`, focused Vitest, TEST-01/02/03, PERF-02
  frozen-handle invariant (`GraphCanvas.test.ts`), repo-map check, then
  autoDeploy (deploy-sequence + route probe) on phase completion.
- **Pre-existing failures stay separate:** `acc-dc-graph.spec.ts` 14 drift
  failures and the 3 `usePredicateEngine` Phase-25 failures are known
  pre-existing; they do not gate this phase.
- Reduced-motion, zinc theme, organic layouts, no new WebGL: standing, not
  revisited.
</defaults>

<decisions>
## Locked Owner Decisions (2026-07-16)

1. **PERF-06 pass/fail = fresh in-phase baseline pair.** Measure a pre-split
   median FIRST (same `:3100` median-of-5 method, current tree with all of
   29–32 aboard), then the post-split median. **Pass = post-split measurably
   better than pre-split.** The delta vs the 28.1 median (4,360 ms) is
   recorded honestly in both directions, but drift caused by Phases 29–32
   alone does not fail Phase 33. (Owner chose over the roadmap's strict
   ≤4,360 ms reading.)
2. **Load feel: graph first, panels follow.** The graph canvas is the
   priority chunk; right-panel stack / catalog / legend UI may mount a beat
   later behind quiet placeholders. Constraints: no layout shift, fade-in
   only, subtle — the staged reveal must read as intentional on the workshop
   screen, not as jank.
3. **LINK-PERF is IN scope: profile + attempt fix.** (Owner widened beyond
   PERF-05/06.) Profile where link-path frame time goes (draw calls, bezier
   math, canvas state churn), then apply the highest-leverage safe
   optimizations. Hard constraints: PERF-02 frozen-handle invariant stays
   green; Phase-32 band widths/opacities, draw priority, tier controller, and
   25%-floor morph behavior survive unchanged in appearance.
4. **LINK-PERF gate: best-effort, no hard fps number.** Honest before/after
   fps at the full 22,279-node / 14,200-link sample recorded in
   33-VERIFICATION.md; improvement expected but no fps target blocks the
   phase. PERF-05 and PERF-06 remain the blocking gates.
</decisions>

## Deferred Items

- If LINK-PERF profiling shows Canvas2D fundamentally cannot hold Tier 0
  ≥50 fps with full links, the renderer-level rethink (e.g. cosmos-native
  links) is a **v2.6 candidate** — record findings, do not widen this phase.
- CONCERNS §3.5 prefetch-shape regression guard (Vitest pinning prefetch
  input shapes) remains a future hardening seed — PERF-05's helper test
  covers the wrapper bug class only, not key-shape drift.
