# Pitfalls Research

**Domain:** Premium UI/UX overhaul of a mature brownfield BIM analytics dashboard
**Researched:** 2026-06-17
**Confidence:** HIGH — derived from codebase audit (CONCERNS.md, TESTING.md, PROJECT.md) and known incident history

---

## Critical Pitfalls

### Pitfall 1: WebGL / 3D accents that block the main thread on data pages

**What goes wrong:**
Adding a Three.js or cosmograph canvas as a "hero accent" on `/access-analysis` or `/users` causes the browser's compositor to share the GPU with ECharts, DuckDB-WASM, and the existing GraphCanvas WebGL context. On Luis's Windows PC (sole deploy machine), a GPU context switch during a live workshop can freeze the tab for 2–5 seconds — exactly when someone in the room is watching.

**Why it happens:**
The "cinematic feel" references (landonorris.com, igloo.inc) are purpose-built WebGL experiences with no competing analytics load. Transplanting the same technique onto a page that also runs DuckDB-WASM (623k activity rows, ~500MB peak WASM memory) and five ECharts canvases creates resource contention that never appears in a screenshot.

**How to avoid:**
- Restrict true WebGL/3D accents to a single isolated route (`/forma-proposal` hero, or a standalone splash) that carries no other heavy client computation.
- On `/access-analysis` and `/users`, use CSS 3D transforms + `backdrop-filter` + layered box-shadows ("2.5D") rather than WebGL. These run on the compositor thread, not the main thread.
- If a 3D accent lands on a data page, gate it behind `prefers-reduced-motion` AND an `IntersectionObserver` that pauses the WebGL loop when the element is not in the viewport.
- Measure frame budget before shipping: Chrome DevTools Performance tab, assert < 16ms frame time with all data panels rendered simultaneously.

**Warning signs:**
- DevTools shows GPU memory > 800MB with both ECharts + the new accent active.
- `FolderPermissionTerrain` (already causes 2–3s lag on large crawls per CONCERNS.md) and the new accent fight for the same render budget.
- The existing `GraphCanvas.tsx` invariant (both 2D and 3D containers always mounted, CSS visibility switch) means two WebGL contexts are already alive on `/users/access-analysis` — a third from a hero accent triples GPU pressure.

**Phase to address:** Design/foundation phase, before any WebGL accent is implemented. Establish "CSS 3D only on data pages; WebGL only on dedicated route" as a hard rule.

---

### Pitfall 2: Performance regression from re-introduced redundant data fetching

**What goes wrong:**
The existing `/access-analysis` page was optimized (2026-06-01) from a 77s OOM-causing bulkUsers load to ~9s via SQL GROUP-BY aggregation. A reskin that moves data-fetching responsibility from RSC loaders to new client components (common when adding interactive panels) can re-introduce the old eager-load pattern, blowing past the memory ceiling and causing blank screens during workshops.

**Why it happens:**
Redesigning panels often means extracting them into new client components that each call `trpc.useQuery(...)` rather than consuming the already-fetched RSC prop. The query deduplication that worked at the page level breaks when the same endpoint is called from three separate panels. The hydration-key mismatch pattern (documented 2026-06-03: prefetch returning `undefined` vs client fetching `{permSummary, activityMix}`) caused a full redundant heavy refetch.

**How to avoid:**
- All new panels must consume data from existing RSC props or a single shared React context — never add a new `trpc.useQuery` for data that the page already fetches at the RSC level.
- Before each phase ships, run `next build && next start` and check the Network tab: zero duplicate requests for `bulkUsers`, `activityMix`, or `permSummary` endpoints.
- If a new panel genuinely needs additional data, add one new RSC loader, pass the result as a prop, and do not call the endpoint client-side.
- Track the `acc-hot-cache` cache key version in CONCERNS.md: every new flag on `bulkUsers` must bump the version string, or stale slots silently serve wrong data.

**Warning signs:**
- Network waterfall shows the same tRPC endpoint called twice (once in RSC prefetch, once on client hydration).
- `/access-analysis` cold load time regresses past 10s after a new panel is added.
- `PG_POOL_MAX` connections spike (was set to 32 after the 77s incident — if it climbs back toward saturation, something is fetching more than once).

**Phase to address:** Every phase that adds a new panel to `/access-analysis` or `/users`. Establish a pre-ship checklist item: "network tab audit, zero duplicate queries."

---

### Pitfall 3: Light/dark parity breakage via hardcoded colors in charts and surfaces

**What goes wrong:**
ECharts canvases ignore the Tailwind/CSS-var theming system. A chart styled for dark zinc (`#09090B`) with hardcoded `color: '#ffffff'` axis labels becomes invisible in light mode. The inverse — white labels on a white background — is worse in a workshop projector environment where the presenter cannot quickly switch themes.

**Why it happens:**
The design references are dark-first. When implementing a new donut or timeline chart, the temptation is to hardcode the values that look correct on screen (dark mode). The existing pattern requires ECharts to read `resolvedTheme` via `useTheme` for canvas colors (documented in PROJECT.md "Theming history"), but new charts frequently skip this and hardcode hex values.

**How to avoid:**
- Enforce the existing `useTheme` → `resolvedTheme` pattern in every new ECharts component. Create a shared `getChartTheme(resolvedTheme)` helper that returns a token object; every new chart imports that helper — no inline hex values.
- Use Tailwind's CSS-var tokens (`--foreground`, `--muted-foreground`, `--border`, `--card`) for all non-canvas surfaces. Hardcoded `zinc-900`, `slate-*`, or raw hex values are banned.
- Add a dual-theme smoke test for every new chart component: render in light, assert axis label color is not white; render in dark, assert axis label color is not black.
- The DARK_MODE.md conventions already exist — reference them at the start of every UI phase (dark palette is zinc, not slate: `#09090B` bg, no blue cast).

**Warning signs:**
- A new chart component has `color: '#fff'` or `color: '#000'` without a `resolvedTheme` conditional.
- `tailwind.config.ts` shows new color classes like `text-zinc-50` hardcoded in JSX rather than `text-foreground`.
- Toggling theme in the running app reveals any axis label, tick, or tooltip that disappears or clashes.

**Phase to address:** Design tokens / foundation phase. Lock the `getChartTheme` helper and dual-theme test pattern before any chart is reskinned.

---

### Pitfall 4: Breaking drill-downs and filter state during the UsersDirectoryClient split

**What goes wrong:**
`UsersDirectoryClient.tsx` is 2,474 lines with a complex filter/sort/virtualization state machine and 6+ heavy tRPC queries. Splitting it into smaller components — the correct long-term move — can silently break: (a) filter state that persists across tab switches, (b) the window-virtualized roster that depends on a single `ref` to the scroll container, (c) the person detail modal that reads from the same filter context as the roster, and (d) tests that import and render the full component as a unit.

**Why it happens:**
When extracting sub-components, developers lift state upward — but the filter context and tRPC cache live implicitly inside the monolith. Moving a panel out loses access to the shared query cache key, causing it to independently refetch. The virtualization `ref` breaks if the scroll container's DOM parent changes during extraction.

**How to avoid:**
- Before splitting, write a golden-path integration test for `UsersDirectoryClient` that covers: search → filter by field → click row → modal opens with correct person → close modal → filter state unchanged. This is the regression guard.
- Extract using the "seam" pattern: create a new `UsersContext` (React context) that holds filter state and the tRPC query result, then move panels one at a time while keeping the context in the parent. Never pass the raw tRPC result as a prop — that defeats deduplication.
- The virtualization `ref` (`useVirtualizer` or equivalent) must remain in the component that owns the scroll container — do not extract the roster list without also extracting its scroll parent.
- Run `npx tsc --noEmit` after every extraction step. The monolith has TypeScript types inferred from internal state; extracting panels often reveals implicit `any` types that were previously hidden.

**Warning signs:**
- After extracting a panel, the "clear filters" action no longer resets the virtualized list (the scroll position is stale because the `ref` is now in a different component).
- `npm test` shows the existing `UsersDirectoryClient` test rendering fewer items than before the split.
- The Network tab shows the same tRPC query called twice after extraction.

**Phase to address:** The dedicated `/users` redesign phase. Split must be preceded by the integration test golden path and a TypeScript clean pass.

---

### Pitfall 5: build-blocking TypeScript errors introduced by UI changes in test files

**What goes wrong:**
`next build` typechecks the entire tree including test files (no `ignoreBuildErrors`). A reskin that renames a prop (e.g., `roleRows` → `rows` on `AccessAnalysisCharts`) or changes a component's TypeScript interface silently breaks test files that import and render the old interface. The deploy on `:3000` is blocked until the test file is also updated — and because test files use `jsdom` environment directives and `vi.mock` chains, the error is often not obvious from `tsc` output alone.

**Why it happens:**
Developers update the component interface, update the implementation, confirm the UI looks correct — but don't re-run `npx tsc --noEmit` before `npm run build`. The test files are not in the normal development feedback loop (vitest runs correctly with old types via module resolution tricks, but `tsc` catches them).

**How to avoid:**
- Make `npx tsc --noEmit` the mandatory last step before any `npm run build`. Add this as an explicit checklist item in every phase's definition of done.
- When changing a component's exported TypeScript interface (props, return types), immediately grep for all test files that import that component and update them in the same commit.
- Use the pattern from TESTING.md: component tests use `// @vitest-environment jsdom` and import the real component — this means renaming a prop breaks the test at TypeScript level, not at runtime.
- Keep test fixtures typed: `const summary: RoleActivitySummary = {...}` — if the type changes, the fixture fails tsc immediately.

**Warning signs:**
- `npx tsc --noEmit` passes but `npm run build` fails (rare, indicates a test file imports an interface not covered by `noEmit`'s project scope — check `tsconfig.json` includes).
- A component prop rename triggers a vitest failure in a test the developer didn't touch.
- The error appears in `__tests__/` files referencing an interface from the just-changed component.

**Phase to address:** Every phase. Enforce `npx tsc --noEmit` as a gate before rebuild. Document it in the phase definition of done.

---

### Pitfall 6: Over-animation overwhelming the live workshop audience

**What goes wrong:**
Stagger animations on a table of 3,000 users, chart mount transitions firing on every filter change, or entrance animations that replay on tab focus — all of these work beautifully in a quiet design review but create sensory overload when a presenter is talking and clicking through data live in front of an audience.

**Why it happens:**
The design references (landonorris.com, igloo.inc) use ambient loops and dramatic reveal animations because the visitor controls the pace. In a workshop, Luis controls the pace but the audience watches — re-triggering animations on every interaction competes with the presenter's narration and distracts from the data.

**How to avoid:**
- Animate only: mount (once, on page load), filter result changes (transition, not replay), and explicit drill-down reveals. Never animate on hover, focus, or tab switch.
- All animations must respect `prefers-reduced-motion`: wrap every Framer Motion / CSS transition with `@media (prefers-reduced-motion: reduce) { animation: none; transition: none; }` or the Framer Motion `useReducedMotion` hook.
- Duration ceiling: 300ms for data transitions, 500ms for page-level reveals. Nothing slower.
- Pre-workshop UAT protocol: run the page with a screen recorder for 5 minutes of realistic clicking. Review the recording for animation fatigue — if motion appears in more than 30% of frames during active use, reduce.

**Warning signs:**
- Framer Motion `staggerChildren` on a list with more than 50 items.
- CSS `transition: all` on chart container elements (causes reflows on every filter change).
- Animation plays when switching between the Role donut and the Activity donut — those are filter interactions, not reveals.

**Phase to address:** Every UI phase. Add `prefers-reduced-motion` and duration ceiling to the design token / component library foundation, so it's automatic rather than opt-in.

---

### Pitfall 7: New "analytics" that the Prisma DB cannot actually support

**What goes wrong:**
The redesign brief includes "new per-page analytics strictly derivable from the existing Prisma DB." In practice, proposed metrics like "user engagement score" or "permission risk velocity over time" sound straightforward but require historical snapshots that the DB doesn't store (only current state is in `BulkAccUser`, `AccDcProjectUser`), or cross-joins that produce the user-wide vs project-scoped ambiguity already documented in CONCERNS.md.

**Why it happens:**
Analytics ideas are generated during design (based on what looks good on a dashboard mockup) rather than by auditing what the schema can actually answer. The `AccActivity` table has 623k rows but only covers the 428 DC-extractable projects (724 are locked at 403). Any "activity trend" metric silently under-counts by ~63%.

**How to avoid:**
- For every proposed new metric, perform a schema feasibility check before any design work: (1) which Prisma model holds the raw data, (2) is that model populated for all 1,152 projects or only the 428 DC-extractable ones, (3) does the query require a Prisma schema change (explicitly out of scope)?
- The confirmed safe data sources: `AccRole` (77 roles, live), `AccUser` (all users), `AccActivity` (428 proj, 623k rows), `AccFolderPermission` (21k rows after GROUP-BY), `AccIssue` (14,233 issues, MC-validated), `AccDcProjectUser` (per-instance).
- Metrics that are banned without a schema change: anything requiring `addedOn` timestamps for membership age (not in client feed), historical permission changes (no change-log table), per-project activity for the 724 locked projects.
- Document each new metric with: "Source: [Prisma model], Coverage: [428 of 1152 projects / all users], Query: [rough SQL]."

**Warning signs:**
- A design mockup shows a "trend over time" chart but there is no `createdAt` or date field on the underlying model.
- A proposed KPI would require comparing two snapshots but the DB only stores the current snapshot.
- The metric would be labeled "all projects" but `AccActivity` only covers 428.

**Phase to address:** New analytics discovery phase (before any implementation). Every proposed metric goes through the feasibility gate before it enters the roadmap.

---

### Pitfall 8: "Looks impressive on screenshot, fails in the live room"

**What goes wrong:**
Several known failure modes specific to the workshop scenario:
- **Projector contrast**: Dark zinc (`#09090B`) with low-luminance accent colors (muted purple, dark teal) that are readable on a calibrated monitor become invisible on a typical conference room projector. The audience sees a near-black canvas.
- **First-click latency**: The `/access-analysis` cold load was 77s before optimization; the post-optimization 9s is still visible. In a workshop, the presenter opens the page in front of the audience — a 9s blank screen feels like a crash. No loading skeleton = lost confidence.
- **Data that doesn't fit**: Charts designed at 1440px that are presented at 1080p projector output clip labels, overflow containers, or show horizontal scrollbars.
- **Drill-down lag on click**: The folder terrain causes 2–3s lag on Hermosillo (10,000+ folders, per CONCERNS.md). A presenter clicking a project folder in front of an audience during that lag loses the room.

**How to avoid:**
- **Projector contrast**: Test every page on a projector or with Windows "Projector" display mode (often lower contrast). Minimum contrast ratio: WCAG AA (4.5:1) for body text, 3:1 for large text. Use `color-contrast()` in CSS or a browser plugin during design review.
- **Loading skeletons**: Every page must have a skeleton or progressive reveal that appears within 200ms (before the first byte of data). The `/access-analysis` 7-parallel RSC loaders + DuckDB-WASM already block — add `<Suspense>` boundaries with skeletons per panel.
- **Responsive layout at 1080p**: Design at 1280px or 1366px (common projector/laptop resolution), not 1440px or 1920px. Use `min-w-0` + `overflow-hidden` on all chart containers to prevent overflow.
- **Folder terrain lag**: Either memoize the terrain layout (the CONCERNS.md fix) before the workshop, or add a "click to expand" lazy-load pattern so the terrain only renders when the user explicitly expands it — not on page load.

**Warning signs:**
- A chart label uses `text-muted-foreground` in dark mode but that resolves to `zinc-400` — on a projector at 50% brightness, it's invisible.
- No `<Suspense>` boundary wrapping the chart panels in the RSC page component.
- A chart container has no max-height and its data has 50+ categories — the chart will overflow vertically at 1080p.

**Phase to address:** Pre-workshop UAT phase (final phase before milestone is done). Run all 4 pages on a secondary display set to 1280×800 with projector-style reduced brightness. Fix any contrast or overflow issues before sign-off.

---

### Pitfall 9: GraphCanvas WebGL context destroyed by conditional rendering

**What goes wrong:**
When redesigning the layout of `/users/access-analysis`, a developer wraps `GraphCanvas` in a conditional (`show && <GraphCanvas />`) to hide it when a different panel is active. This destroys the WebGL context. The graph goes blank and the cosmos.gl simulation state is lost — restoring it requires a full reinit (2–5s cold start for 17k nodes).

**Why it happens:**
The invariant is documented in CONCERNS.md but is easy to forget: "Both 2D and 3D canvas containers MUST always be mounted. If you conditionally render one based on `mode`, the WebGL context is destroyed." Layout redesigns naturally try to hide the graph when a panel is expanded, using conditional rendering because it's the React default.

**How to avoid:**
- The invariant must be in the phase plan for any work touching `/users/access-analysis` layout: "Use `visibility: hidden` / `display: none` via CSS class, never conditional unmount, for GraphCanvas and its children."
- Add a vitest test for `GraphCanvas.tsx` that asserts the component is never unmounted when `mode` changes (mock the dispatcher, assert `onMount` fires once regardless of mode switches).
- If the layout redesign requires "hiding" the graph, use `opacity-0 pointer-events-none absolute inset-0` — the element stays mounted, the WebGL context stays alive.

**Warning signs:**
- JSX like `{showGraph && <GraphCanvas ... />}` anywhere in the file.
- The graph panel has a `display: none` applied via inline style (also destroys the WebGL context in some browsers — use `visibility: hidden` instead).
- After a panel toggle, the graph takes > 2s to re-appear (indicates cold reinit, context was destroyed).

**Phase to address:** `/users` redesign phase, specifically during layout restructuring. Add the invariant as a code comment and a lint rule (ESLint no-conditional-graph-canvas custom rule, or a simple grep CI check).

---

### Pitfall 10: Scope creep — the `/users/spatial-graph` boundary dissolving

**What goes wrong:**
The spatial graph is explicitly out of scope (PROJECT.md: "separate future project; needs full dedicated attention"). But because `UsersDirectoryClient`, `GraphCanvas`, `physicsLayer`, and `dimensionCatalog` all live in the same routes and the `/users` page links to the graph — a "small improvement" to the directory page (e.g., adding a "View in graph" button) bleeds into touching graph code, which has its own fragile invariants (node identity contract, physics NaN propagation, clique explosion).

**Why it happens:**
The `/users` directory and spatial graph share the same route tree (`app/(dashboard)/users/`). Any UI work on `/users` is physically adjacent to the graph code. A "small integration" feels like one line of code but pulls in graph dependencies, e2e test scope, and physics invariants.

**How to avoid:**
- Treat the boundary as a hard file-system rule: no files under `app/(dashboard)/users/access-analysis/` are touched during this milestone. If a UI change in the directory page seems to require a graph code change, it is out of scope.
- The one permitted interaction: a navigation link from the directory to the graph route. No prop passing, no shared state.
- Keep the spatial graph's e2e suite (`tests/e2e/acc-dc-graph.spec.ts`, `acc-3d-lasso.spec.ts`) passing with no modifications — they serve as the boundary regression guard.

**Warning signs:**
- A commit touching both `UsersDirectoryClient.tsx` and any file in `access-analysis/` (graph code).
- `graphTables.ts`, `physicsLayer.ts`, or `dimensionCatalog.ts` modified during a "directory redesign" commit.
- The e2e lasso flake reappears after a directory change (indicates the shared route structure was touched).

**Phase to address:** Project kick-off — document the file-system boundary in the phase plan and enforce it via PR review.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding `#09090B` instead of `var(--background)` | Faster to write | Dark/light switch breaks; projector contrast undetectable | Never |
| Adding `trpc.useQuery` in a new panel instead of consuming RSC props | Self-contained panel | Duplicate network request; possible OOM regression | Never |
| Animating with `transition: all` on chart wrapper | Easy to write | Reflow on every property change; frame drop during filter | Never |
| Skipping `npx tsc --noEmit` before rebuild | Saves ~30s | Deploy blocked by test-file type error | Never |
| Conditionally mounting `<GraphCanvas>` | Clean JSX | WebGL context destroyed; 5s cold reinit | Never |
| Using `min-h-screen` on page root | "Full height" feeling | Breaks under `overflow-hidden` main; scroll lost | Never — use `h-full overflow-y-auto` |
| Adding a new `DimensionDescriptor` without a test | Quick dimension add | Auto-creates physics target; layout changes unexpectedly | Never without a `featureTargets.test.ts` entry |
| Pre-aggregating chart data on the client (DuckDB-WASM) | No backend change | 500MB WASM memory; thread block 50–200ms per chart | Acceptable short-term if dataset < 10k rows; replace with server aggregation at scale |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| DuckDB-WASM + new WebGL accent on same page | Tab freeze 2–5s during workshop | CSS 3D only on data pages; WebGL on dedicated route only | Immediately on first workshop run |
| `bulkUsers` called from multiple client components | Network shows 2+ identical requests; load time doubles | Single RSC fetch, shared via prop or context | As soon as second panel added |
| `FolderPermissionTerrain` without memoization | 2–3s lag on Hermosillo project click | `useMemo` on tree layout; lazy-expand on click | Any project > 5,000 folders |
| Stagger animation on virtualized list | 60-column table stutters on scroll | Animate max 20 items; skip animation for offscreen rows | > 50 items in viewport |
| ECharts `option` object recreated on every render | Chart flickers on parent re-render | `useMemo` on the `option` object; only rebuild on data change | Immediately if option is inline object literal |
| `AccActivity` GROUP-BY without composite index | Query > 218ms on cold start | Add `(email, projectId)` index (already flagged in CONCERNS.md) | At 623k rows (current scale) |
| DuckDB table instances not cleaned on unmount | Memory leak during 30-min workshop session | `useEffect` cleanup calling `db.dropTable()` | After ~10 rapid tab switches |

---

## UX Pitfalls

| Pitfall | Workshop Impact | Better Approach |
|---------|----------------|-----------------|
| No loading skeleton on data pages | Presenter clicks nav, audience sees blank screen for 9s — looks broken | Skeleton per panel, visible within 200ms, before any data arrives |
| Drill-down opens a modal that clips at 1080p projector height | Bottom of modal (action buttons) cut off; presenter can't click | Design modals at 768px max-height; use scrollable body |
| Chart labels in `muted-foreground` color | Invisible on low-contrast projector | Use `foreground` for all data labels; `muted-foreground` only for metadata |
| Filter reset animation replays chart entrance | Distraction when presenter changes filters live | Chart entrance only on page load; filter changes use a fade (100ms), not a full remount |
| "No data" state that looks like an error | Audience thinks app is broken | Explicit illustrated empty state with "No data for this filter" message |
| Horizontal scroll on data tables at 1280px | Audience can't read truncated columns | Column priority: hide low-value columns below breakpoint; use `overflow-hidden text-ellipsis` |

---

## "Looks Done But Isn't" Checklist

- [ ] **Dark mode parity**: Toggle to light mode on every new page — assert no invisible text, no hardcoded hex colors in chart options.
- [ ] **Projector contrast**: View each page on a secondary display at reduced brightness (simulate projector). All data labels readable.
- [ ] **TypeScript clean**: `npx tsc --noEmit` exits with 0 errors including test files before any `npm run build`.
- [ ] **No duplicate queries**: Network tab shows each tRPC endpoint called once per page load.
- [ ] **Loading state**: Every async panel has a `<Suspense>` boundary with a skeleton visible within 200ms.
- [ ] **Reduced motion**: `prefers-reduced-motion: reduce` in DevTools — all animations disabled, layout unchanged.
- [ ] **1280px layout**: Page renders without horizontal scroll or overflow at 1280px width.
- [ ] **GraphCanvas always mounted**: No conditional render of `<GraphCanvas>` — use CSS visibility only.
- [ ] **Drill-down still works**: All existing drill-downs (role donut → people, activity donut → people, folder terrain click, model-coord panel) fire correctly after reskin.
- [ ] **Spatial-graph boundary**: `git diff --name-only` for any `/users` work shows zero files under `access-analysis/` (graph code).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| WebGL context destroyed by conditional render | MEDIUM | Remove conditional; replace with CSS class toggle; graph cold-reinits on next load (~5s) |
| tsc error blocks deploy | LOW | `npx tsc --noEmit`, fix flagged test file type mismatch, rebuild |
| Duplicate tRPC query regression | LOW | Identify which new component added `useQuery`; convert to RSC prop or context consumer |
| DuckDB-WASM OOM crash | HIGH | Remove client-side chart that triggered it; move aggregation to Prisma/server action; rebuild |
| Hardcoded color invisible in light mode | LOW | Replace with CSS-var token; run dual-theme test; rebuild |
| Animation-induced frame drop during workshop | MEDIUM | Remove animation (set `transition: none`); rebuild; faster to disable than optimize live |
| UsersDirectoryClient split regression | HIGH | Revert to monolith (git revert); re-introduce split one panel at a time with integration test guard |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| WebGL on data pages | Foundation / design tokens phase | Chrome DevTools: GPU memory < 400MB with all panels open |
| Redundant data fetching | Every panel-addition phase | Network tab: each endpoint called once per load |
| Light/dark parity breakage | Foundation / design tokens phase (getChartTheme helper) | Dual-theme smoke test for every chart component |
| UsersDirectoryClient split regression | `/users` redesign phase | Integration test golden path; `npm test` count unchanged |
| tsc errors in test files | Every phase (pre-ship gate) | `npx tsc --noEmit` exits 0 before any rebuild |
| Over-animation | Every UI phase (component library foundation) | `prefers-reduced-motion` check; 5-min screen recording review |
| New analytics not in DB | New analytics discovery phase (before implementation) | Schema feasibility gate per metric |
| Presentation failures | Pre-workshop UAT phase | 1280px display; projector brightness test; drill-down smoke |
| GraphCanvas conditional render | `/users` redesign phase | Grep for `{show && <GraphCanvas` pattern; vitest mount-once assertion |
| Spatial-graph scope creep | All `/users` phases | `git diff --name-only` check excludes `access-analysis/` files |

---

## Sources

- `C:/LECG/Dashboard/.planning/codebase/CONCERNS.md` — performance bottlenecks, fragile areas, known bugs (2026-06-17 audit)
- `C:/LECG/Dashboard/.planning/codebase/TESTING.md` — test framework, patterns, e2e setup (2026-06-17 audit)
- `C:/LECG/Dashboard/.planning/PROJECT.md` — constraints, requirements, theming history, design references (2026-06-17)
- Incident history (MEMORY.md entries): 2026-06-01 bulkUsers 77s OOM fix; 2026-06-03 hydration-key cache miss; 2026-06-03 layout thrash (`min-h-screen` / `overflow-hidden`); 2026-05-18 dcIngest silent data loss; 2026-06-01 APS refresh-token rotation breakage
- Known fragile invariants: GraphCanvas always-mounted contract; node identity `userId::projectId` contract; dimension registry auto-creates physics targets; cache key version increment required per flag

---

*Pitfalls research for: Premium UI/UX overhaul, LECG BIM Dashboard*
*Researched: 2026-06-17*
