# Phase 7: Pre-Workshop UAT - Research

**Researched:** 2026-06-19
**Domain:** Playwright E2E harness, production-mode build logistics, Playwright request interception, accessibility tooling, repo-map ratchet, codebase drill-down mapping
**Confidence:** HIGH — all findings verified directly from codebase files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Two species of gate: deterministic/scriptable = automated; perceptual = human-only.
- Full automated harness drives all four pages, runs every scriptable gate, captures screenshots, emits ONE pass/fail report. Owner reads results, does not run commands.
- Perceptual checks are owner-run, live, on the real secondary display at projector-reduced brightness. No screenshot-only substitute.
- Equal depth across all four pages — no hero page, no reduced scrutiny.
- Separate port (e.g. :3100-style), live :3000 never goes down during testing. Do NOT `npm run build` while :3000 is running.
- Promote to :3000 only after sign-off.
- Default response = fix inline, re-run to green. Issues are fixed inside Phase 7.
- Engineering gates = absolute: tsc-0, fetch-once, GPU < 400MB, reduced-motion, boundary greps must ALL pass.
- Combined sign-off rule: every engineering gate green AND no room-breaking perceptual issue remaining. Cosmetic nits may remain (noted).
- Phase 7 is DONE when automated report is all-green AND owner says "approved on the projector."

### Claude's Discretion

- Harness tooling choice (extend existing `npm run test:e2e` suite on :3100 vs. fresh production-mode UAT run vs. driving a real browser via Chrome DevTools for GPU/brightness captures).
- Screenshot capture mechanism, report file format/location, and how the per-page gate checklist is structured.
- The exact drill-down smoke sequence per page, as long as every drill in Success Criteria #2 is exercised.
- How "noted for later" cosmetic nits are recorded.

### Deferred Ideas (OUT OF SCOPE)

- None raised during discussion. Cosmetic/polish nits surfaced during UAT are logged within Phase 7 (not deferred to roadmap).
</user_constraints>

---

## Summary

Phase 7 is a verification-only gate that must prove all four redesigned pages — `/users`, `/access-analysis`, `/template-mty`, `/forma-proposal` — pass a set of hard engineering checks and survive a live projector run. The phase introduces no new code capabilities; everything it exercises was built in Phases 1–6.

The repo already has a mature Playwright e2e harness (`playwright.config.ts`, `playwright.verify.config.ts`, global-setup JWT minting, `tests/e2e/*.spec.ts`) that runs against a dev server on port 3100. For UAT the harness must pivot to a **production build** served on :3100 via `next start` — exactly the pattern already documented in `playwright.verify.config.ts` (no `webServer:` block; caller starts the server out-of-band). This avoids touching the live :3000 instance.

All four pages are pure Server Components (RSC) that pass pre-loaded data to client components — they have zero client-side tRPC queries of their own. The tRPC calls live in `UsersDirectoryClient.tsx` (8 queries via `useUsersDirectoryData`), and none of the other three pages make tRPC calls at all. The `httpBatchLink` in `lib/core/providers.tsx` batches calls into `POST /api/trpc`, so the "each endpoint fetched once" gate must be verified by counting distinct batch payloads (request bodies), not raw HTTP request counts.

The boundary greps and `repo-map:check` are fully scriptable: the repo-map check runs `npm run repo-map && node scripts/repo-map/check.cjs` and compares against baselines in `.tools/repo-map/baselines/`. The boundary diff uses `git diff --name-only origin/deploy...HEAD`.

**Primary recommendation:** Use `playwright.verify.config.ts` pattern (production `next start` on :3100, E2E_BASE_URL=http://localhost:3100) as the harness base. Build a new `tests/e2e/uat-workshop.spec.ts` that drives all four pages with scriptable gates, produces a Markdown report, and references screenshots. The owner perceptual checklist is a structured section of the same report.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Page data loading (access-analysis, template-mty, forma-proposal) | API / Backend (RSC, server actions) | — | All three pages use RSC + server functions; no client queries |
| User directory data (users page) | API / Backend (tRPC, HydrationBoundary) | Browser / Client (React-Query cache hit) | SSR prefetch → client hydration; 8 tRPC queries in `useUsersDirectoryData` |
| Drill-down panels (DrillSheet / AuthorProfileDrawer) | Browser / Client | — | Shadcn Sheet + client state; data from pre-loaded page props |
| Theme toggle (light/dark zinc) | Browser / Client | — | `ThemeToggle` in dashboard layout, `setTheme` via next-themes |
| Motion facade / reduced-motion | Browser / Client | — | `useSafeVariants` + framer-motion `useReducedMotion` |
| Folder terrain (lazy expand) | API / Backend (server action `loadOverviewTerrain`) | Browser / Client (canvas render) | `TerrainReveal` defers `loadOverview` server action to click |
| GPU memory (R3F accents) | Browser / Client (WebGL) | — | `HeaderParticleAccent` (/users) + `FormaParticleAccent` (/forma-proposal) are the only R3F mounts |
| tRPC batching | API / Backend | Browser / Client (httpBatchLink) | All tRPC calls batch through `POST /api/trpc` |

---

## Q1: Existing E2E / UAT Harness

[VERIFIED: direct file read]

### playwright.config.ts
**Location:** `C:/LECG/Dashboard/playwright.config.ts`

Key facts:
- `testDir: "./tests/e2e"`
- `globalSetup: "./playwright/global-setup.ts"` — mints a real NextAuth v5 JWT by querying the local Postgres DB for the ADMIN_EMAIL user and writing `playwright/.auth/storageState.json`
- Default port: `E2E_PORT` env var (default `"3100"`); base URL: `E2E_BASE_URL` (default `http://localhost:3100`)
- `webServer` block starts `next dev --webpack --port ${PORT}` with these env flags:
  - `NEXT_PUBLIC_ACC_GRAPH_TEST: "1"` — gates the cosmos.gl GPU physics OFF in `GraphCanvas.tsx` (spatial-graph only); keeps tests stable
  - `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS: "1"` — enables new access analysis route
  - `NEXT_DIST_DIR: ".next-e2e"` — separate build output; never clobbers `.next` (prod build)
- `reuseExistingServer: false` — always starts fresh dev server
- `viewport: { width: 1600, height: 1000 }` — NOT 1280px (UAT must override to `{ width: 1280, height: 800 }`)
- `screenshot: "on"`, `trace: "on"`, `video: "off"`
- `timeout: 120_000` (120 s per test), `expect.timeout: 20_000`
- `workers: 1`, `retries: 0`, `fullyParallel: false`

### playwright.verify.config.ts
**Location:** `C:/LECG/Dashboard/playwright.verify.config.ts`

This config is the **correct base for UAT**:
- No `webServer:` block — assumes a production `next start` on :3100 started out-of-band
- `E2E_BASE_URL=http://localhost:3100`
- `timeout: 360_000` (6 min), `expect.timeout: 30_000` — generous for production-mode cold starts
- Same `globalSetup` JWT minting
- `screenshot: "on"`, `trace: "off"`

### Global Setup Auth
**Location:** `C:/LECG/Dashboard/playwright/global-setup.ts`

- Requires env vars: `AUTH_SECRET`, `ADMIN_EMAIL`, `DATABASE_URL` (all in `.env`)
- Connects to Postgres, finds `User` row by `ADMIN_EMAIL`, fails if not ADMIN role
- Mints a real `@auth/core/jwt` `encode()` token — byte-compatible with the app's own `decode()`
- Cookie: `authjs.session-token` on `localhost`, httpOnly, SameSite=Lax
- Writes `playwright/.auth/storageState.json`

### Existing Spec Files
**Location:** `C:/LECG/Dashboard/tests/e2e/`

| Spec | Page Covered | Notes |
|------|-------------|-------|
| `acc-dc-graph.spec.ts` | `/users/spatial-graph` (OLD cosmos.gl) | Boundary: must NOT be touched by Phase 7; references the NEXT_PUBLIC_ACC_GRAPH_TEST bridge |
| `acc-cluster-blobs.spec.ts` | `/users/spatial-graph` | Spatial-graph, boundary |
| `acc-cluster-labels.spec.ts` | `/users/spatial-graph` | Spatial-graph, boundary |
| `acc-positioning.spec.ts` | `/users/spatial-graph` | Spatial-graph, boundary |
| `acc-person-graph.spec.ts` | `/users/spatial-graph` | Spatial-graph, boundary |
| `forma-proposal.spec.ts` | `/forma-proposal` | Assigns tier, persists draft, exports JSON — reusable |
| `sidebar-resize.spec.ts` | Layout | Sidebar |

**UAT harness**: create `tests/e2e/uat-workshop.spec.ts`. It must use `playwright.verify.config.ts` (production build on :3100), NOT the default dev-server config.

### Can It Be Extended?
Yes. The four target pages (`/users`, `/access-analysis`, `/template-mty`, `/forma-proposal`) are NOT covered by existing specs (except `forma-proposal.spec.ts` which covers one happy path). The UAT spec is a net-new file.

---

## Q2: Repo-Map Ratchet

[VERIFIED: direct file read of `scripts/repo-map/check.cjs` and `.tools/repo-map/manifest.json`]

### What `npm run repo-map:check` Does

Command: `npm run repo-map && node scripts/repo-map/check.cjs`

Step 1 — `npm run repo-map` runs `node scripts/repo-map/generate.cjs` which:
- Runs `dependency-cruiser` across all source inputs → writes `.tools/repo-map/dependency-cruiser.json`
- Runs `ast-grep` with rules in `sgconfig.yml` → writes `.tools/repo-map/ast-grep-report.json`, `ast-grep-fetch-calls.json`, `ast-grep-router-push.json`, etc.
- Writes `.tools/repo-map/manifest.json` (summary, baselines snapshot)

Step 2 — `node scripts/repo-map/check.cjs` compares fresh output to baselines in `.tools/repo-map/baselines/`:
- **Blocking rule: `direct-prisma-in-ui`** — current count must NOT exceed baseline (`1` in `app/(dashboard)/access-analysis/coordinationActions.ts`). Any new Prisma import in UI code FAILS.
- **Dependency-cruiser errors** — any `error` severity = FAIL (currently 0).
- **Circular imports** — any circular = FAIL (currently 0).
- **Dependency-cruiser warnings** — growth above baseline = FAIL. Current baseline: `no-scripts-to-app` = 6 warnings (all in `scripts/` → `app/` imports for legit diagnostic scripts).
- **Stale baseline files** — baseline references files that no longer exist = FAIL.

Current gate status (manifest generated 2026-06-18T22:05:15):
```
Circular imports:  Pass (0)
Dependency errors: Pass (0)
Dependency warnings: Warn (6) — growth-only failure
AST blocking rules: Baseline (direct-prisma-in-ui: 1/1 — no delta)
AST warnings/info/hints: Report (272 — not blocking)
Baseline file refs: Pass (0)
```

### Router-Push Report
**Location:** `.tools/repo-map/ast-grep-router-push.json`

Current content: 3 hits, all in auth flows:
- `app/(auth)/reset-password/page.tsx` → `/login?reset=success`
- `app/(dashboard)/account/setup/page.tsx` → `/`
- `components/auth/RegistrationForm.tsx` → `/login`

**None** of the four UAT pages use `router.push()` for drill-downs. All drills use the `DrillSheet` slide-in panel (`open` state) or `AuthorProfileDrawer` — confirming INT-01 compliance. The router-push report is a regression guard: if Phase 7 fix work accidentally introduces a `router.push()` in a drill handler, it will appear here.

### What Planner Must Run

```bash
npm run repo-map:check
# Exits 0 = gate passes
# Exits 1 = failures printed to stderr (growth in rules above)
```

Baseline files:
- `.tools/repo-map/baselines/ast-grep-baseline.json`
- `.tools/repo-map/baselines/dependency-cruiser-baseline.json`

---

## Q3: Scriptable Gate Mechanics

[VERIFIED: direct file read for each]

### Gate 1: tsc-0 (including test files)

**Exact command:** `npx tsc --noEmit`

**Expected runtime:** ~60–90 seconds on this repo (full tree including test files).

**Why not `next build`:** `next build --webpack` also typechecks the whole tree (no `ignoreBuildErrors: true` in `next.config.ts`), but it additionally compiles all pages which takes 5–8 minutes. `npx tsc --noEmit` is the cheap gate (no compilation output).

**Known gotchas (from project memory):**
- Test files (`.test.ts`, `.test.tsx`, `.spec.ts`) ARE included in tsc's scope.
- A concurrent session's test changes in the same working tree can cause phantom tsc errors — wait for any concurrent session to settle.
- Prop-shape changes must update test fixtures in the same commit or tsc fails.
- Do NOT run `npm run build` while :3000 is live (freezes the running app ~8 min).

---

### Gate 2: Each tRPC Endpoint Fetched Once Per Page Load

**tRPC setup (VERIFIED):**
- Client: `lib/core/providers.tsx` — `httpBatchLink({ url: "/api/trpc", transformer: superjson })`
- Server: `app/api/trpc/[trpc]/route.ts` — standard `fetchRequestHandler` on `POST /api/trpc`
- Batching: multiple concurrent `useQuery` calls are batched into a single `POST /api/trpc` whose body is a JSON array of procedure calls (e.g., `[{"0":{"json":...}},{"1":{"json":...}}]`)

**Which pages make tRPC calls:**
- `/users` (`UsersDirectoryClient.tsx`) — up to 8 queries via `useUsersDirectoryData` hook, plus 1 infinite query (`accActivity.usersOrderedByLastFileActivity`). Most are hydrated from SSR (`acc-route-hydration.ts`), so they should be cache-hits on mount.
- `/access-analysis`, `/template-mty`, `/forma-proposal` — NO tRPC calls on the page itself. Data is loaded in RSC via server functions (`loadInstanceView`, `loadModuleActivity`, etc.) and passed as props. These pages make zero network requests to `/api/trpc`.

**Practical measurement approach:** Playwright `page.on('request', ...)` intercept on `**/api/trpc**`. Count POST requests. For `/users`, expect 1–2 batch POSTs total (hydrated cache hits + the infinite query). For the other three pages, expect 0.

**Recommended harness pattern:**
```typescript
const trpcRequests: string[] = [];
page.on('request', (req) => {
  if (req.url().includes('/api/trpc') && req.method() === 'POST') {
    trpcRequests.push(req.url());
  }
});
await page.goto('/users');
await page.waitForLoadState('networkidle');
// Assert no duplicate procedure names in batch payloads
```

**Duplicate-fetch detection:** Parse `request.postData()` on each POST to extract procedure names from the batch array. A procedure that appears in two separate batch requests (not coalesced) is a PERF-03 violation.

**BATCHING PITFALL:** `httpBatchLink` coalesces requests that arrive in the same microtask tick. A query that fires after a user interaction (e.g., the infinite scroll sort query after mount) is legitimately a separate batch. The gate is: the same procedure key must NOT appear in two separate batches. Count occurrences of each procedure name across all batch requests.

---

### Gate 3: GPU Memory < 400MB

**R3F mounting points (VERIFIED):**
- `HeaderParticleAccent.tsx` — `/users` header accent (R3F, `frameloop="demand"`)
- `FormaParticleAccent.tsx` — `/forma-proposal` background (R3F, `frameloop="demand"`, dynamic import `ssr: false`)
- `/users/spatial-graph` (cosmos.gl + R3F) — OUT OF SCOPE, not tested in Phase 7

**What is realistic from automated testing:**

`performance.memory.usedJSHeapSize` (via `page.evaluate(() => performance.memory?.usedJSHeapSize)`) gives JS heap, not GPU memory. True GPU memory requires Chrome DevTools Protocol (CDP) `Memory.getDOMCounters` or GPU process inspection — neither is reliable in a standard Playwright run.

**Practical approach for this phase:**
1. **Automated smoke:** Use `page.evaluate(() => (performance as any).memory?.usedJSHeapSize)` after page load. Flag if JS heap > 200MB. This is a proxy, not GPU memory.
2. **Owner-observed:** The < 400MB GPU constraint is best verified by the owner opening Chrome DevTools → Memory tab → "GPU Memory" or using `chrome://gpu` during the projector pass. Document this as an owner-observed gate item in the perceptual checklist.
3. **Automated regression guard:** Assert that the `/forma-proposal` page does NOT have more than 1 `canvas` element (R3F particle accent uses 1; data pages must use 0). Assert `/users` has at most 1 canvas (header accent). Assert `/access-analysis` and `/template-mty` have 0 WebGL canvases.

```typescript
const canvasCount = await page.locator('canvas').count();
// /forma-proposal: ≤ 1 (FormaParticleAccent)
// /users: ≤ 1 (HeaderParticleAccent)  
// /access-analysis: 0 (ECharts uses SVG)
// /template-mty: 0
```

**Note:** ECharts (`echarts-for-react`) renders to SVG (not canvas) when no WebGL is involved. The `EChart.tsx` wrapper does not use `echarts-gl`.

---

### Gate 4: prefers-reduced-motion Leaves Layout Unchanged

**Mechanism (VERIFIED):**
- `components/ui/motion.ts` — `useSafeVariants(variants)` calls `useReducedMotion()` (framer-motion). When reduced, it returns variant copies with all `transition.duration = 0`, `staggerChildren = 0`, `delayChildren = 0`. End-state opacity/transform VALUES are preserved.
- Used in: `DataTable.tsx`, any component importing from `@/components/ui/motion`.
- `DrillSheet.tsx` has `data-[state=open]:duration-[350ms]` CSS class — does NOT use `useSafeVariants`, but the shadcn Sheet transition is CSS-only.

**Automated assertion:**

```typescript
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.goto('/access-analysis');
// Layout invariant: main content must be visible
await expect(page.locator('h1')).toBeVisible();
// No layout shift: key containers must be at expected dimensions
const kpiBox = await page.locator('[data-testid="kpi-strip"]').boundingBox();
// Compare to same measurement without reduced-motion
```

**What `emulateMedia({ reducedMotion: 'reduce' })` does:** Sets the `prefers-reduced-motion: reduce` media query in the page context. Framer-motion's `useReducedMotion()` hook reads this via `matchMedia`. `useSafeVariants` then zeros all durations.

**Layout invariant check:** All content must be visible (not hidden), and the bounding boxes of key containers must be non-zero and within expected viewport bounds. Since `useSafeVariants` preserves end-states, layout should be identical — only timing changes.

**Playwright emulate before goto:**
```typescript
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.goto('/users');
await page.waitForLoadState('networkidle');
// Assert content visible, no horizontal overflow
const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // 5px tolerance
```

---

### Gate 5: WCAG AA Contrast on Data Values (Both Themes)

**No existing axe/contrast tooling in the repo.** `vitest.setup.ts` has no accessibility imports. `package.json` has no `@axe-core/playwright`, `axe-playwright`, or `jest-axe`.

**Theme mechanism (VERIFIED):**
- `ThemeToggle` in `app/(dashboard)/layout.tsx` (line 71) — `aria-label="Toggle theme"` dropdown with items "Light", "Dark", "System"
- `EChart.tsx` — `const { resolvedTheme } = useTheme()`, passes `key={resolvedTheme}` to force canvas remount on switch
- Dark palette: `.dark { --background: #09090B; }` in `app/globals.css` — zinc base, no blue cast
- `cSub`/`cAxis` tokens set to `zinc-600` (#52525b, ~7.0:1 on dark background) per Phase 5-05 decision

**Practical approach for automated contrast:**

Option A (recommended for fast UAT): Use Playwright `page.evaluate()` to call `axe-core` via CDN injection:
```typescript
await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js' });
const results = await page.evaluate(() => (window as any).axe.run({ runOnly: ['color-contrast'] }));
expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toHaveLength(0);
```

Option B (lightweight): Playwright `checkAccessibility` — not available in current Playwright version without plugin.

Option C (owner-observed): Run in browser DevTools → Accessibility panel → Contrast checker on data labels. This is the most reliable for ECharts canvas text.

**CAVEAT:** ECharts SVG text (axis labels, legend labels) IS DOM-accessible and axe can check it. But the terrain (FolderPermissionTerrain) renders to an `<svg>` canvas where text contrast is a function of the live `useTheme()` theme tokens — axe can check this too. The main risk area is projector-brightness legibility, which is perceptual (owner-run).

**Theme toggle in Playwright:**
```typescript
// Switch to dark
await page.getByRole('button', { name: 'Toggle theme' }).click();
await page.getByRole('menuitem', { name: 'Dark' }).click();
await page.waitForTimeout(300); // Wait for EChart key remount
// Now run contrast checks
```

---

### Gate 6: Boundary Greps

[VERIFIED: `git log origin/deploy..HEAD` shows 1031 commits on this branch; boundary is `origin/deploy`]

#### (a) Zero Files Under `users/access-analysis/` Touched by Phase 7 Work

```bash
git diff --name-only origin/deploy...HEAD | grep "users/access-analysis/"
# Must output nothing
```

The `users/access-analysis/` directory is the OLD cosmos.gl spatial-graph (GraphCanvas, AccessAnalysisShell, GraphCanvas3D, graphTestBridge, etc.). Phase 7 must NOT touch it.

**In the UAT spec itself**, verify this as a static assertion:
```typescript
test('boundary: no users/access-analysis files modified', async () => {
  const { stdout } = await execAsync('git diff --name-only origin/deploy...HEAD');
  const spatialFiles = stdout.split('\n').filter(f => f.includes('users/access-analysis/'));
  expect(spatialFiles).toHaveLength(0);
});
```

Or run as a standalone bash assertion in the harness wrapper script.

#### (b) No Conditional GraphCanvas Mount Pattern Introduced

**What GraphCanvas is:** `app/(dashboard)/users/access-analysis/GraphCanvas.tsx` — the cosmos.gl 2D/3D wrapper. It is ONLY mounted inside `AccessAnalysisShell.tsx` (spatial-graph). It is NOT imported anywhere in the four UAT pages.

**Verified (grep):** `GraphCanvas` is imported only in:
- `users/access-analysis/AccessAnalysisShell.tsx`
- `users/access-analysis/GraphInteractions.tsx`
- `users/access-analysis/graphTestBridge.ts`
- `users/access-analysis/MapClusterLabels.tsx`

None of the four UAT pages import it.

**Forbidden pattern to grep for:**
```bash
# Would catch conditional canvas mounting on non-spatial-graph pages
grep -rn "GraphCanvas" app/\(dashboard\)/users/UsersDirectoryClient.tsx \
  app/\(dashboard\)/access-analysis/ \
  app/\(dashboard\)/template-mty/ \
  app/\(dashboard\)/forma-proposal/
# Must return no matches
```

Alternatively, run `npm run repo-map:check` — if a new `GraphCanvas` import appears outside `users/access-analysis/`, it would surface as a new dependency edge.

---

## Q4: The Four Pages and Their Drill-Downs

[VERIFIED: direct file reads of all four page routes and their client components]

### Page 1: /users

**Route file:** `app/(dashboard)/users/page.tsx`
**Client component:** `app/(dashboard)/users/UsersDirectoryClient.tsx`
**Data source:** SSR prefetch via `lib/server/acc-route-hydration.ts` → `HydrationBoundary` → `useUsersDirectoryData` hook (8 tRPC queries, all cache-hits after SSR hydration)
**Loading skeleton:** `app/(dashboard)/users/loading.tsx`

**Drill-downs to smoke-test (Success Criteria #2):**
1. **Table row → UserProfilePanel (DrillSheet):** Click any row in the DataTable → `setSelectedEmail(r.original.email)` → opens `<DrillSheet open={!!selectedEmail}>` containing `<UserProfilePanel>`. No `data-testid` on the outer DrillSheet, but shadcn Sheet renders `role="dialog"` — select via `page.getByRole('dialog')`.
2. **Activity audit panel (via AccProfileSection inside UserProfilePanel):** Within the open DrillSheet, the profile panel contains `AccProfileSection` which shows activity data. Smoke: verify the panel renders user name.
3. **Inline row expand (PeekPanel):** DataTable row has an expand affordance. The `DataTable.tsx` renders expand via `data-expand` attribute. Select via `page.locator('[data-expand]').first()` or `page.getByLabel('expand row')`.

**Key selectors:**
- DataTable rows: `table tbody tr` or `[data-density]` (DataTable sets `data-density`)
- DrillSheet (open): `[role="dialog"]`
- UserProfilePanel content: text of user name inside dialog

**PERF-03 concern for /users:** The `UsersDirectoryClient` fires an infinite query (`accActivity.usersOrderedByLastFileActivity`) post-mount that is a legitimate separate batch. The gate is: `accDcGraph.bulkUsers` (the heavy ~15MB query) must appear in exactly one batch request.

---

### Page 2: /access-analysis

**Route file:** `app/(dashboard)/access-analysis/page.tsx`
**Data loading:** RSC via `mainCharts.tsx` → 7 parallel server functions (`loadInstanceView`, `loadModuleActivity`, `loadActivityByActor`, `loadCoordinationByProject`, `loadProjectCoverage`, `loadTerrainProjects`, `loadActivityTimeline`)
**Client component:** `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx`
**Loading skeleton:** `loading.tsx` + Suspense in `page.tsx` (KpiStripSkeleton, DonutGridSkeleton, TimelineSkeleton)
**tRPC calls:** ZERO on this page

**Drill-downs to smoke-test (Success Criteria #2):**

1. **Role donut → people drill (click legend item):**
   - Selector: `[data-testid="role-legend"] button` — click any legend entry
   - Result: `data-testid="role-drilldown"` panel appears (PeopleDrillList rendered above the donut)
   - Click type: within-page, no Sheet opened (PeopleDrillList is inline)

2. **"View N people" → DrillSheet (people-sheet):**
   - Selector: `[data-testid="view-people-role"]` (or `view-people-company`, `view-people-activity-role`, `view-people-activity-company`)
   - Result: opens `[data-testid="people-sheet"]` (DrillSheet via `open={!!peopleSheet}`)
   - Verify: `page.getByTestId('people-sheet')` is visible

3. **Folder terrain expand:**
   - Selector: `[data-testid="terrain-expand"]`
   - Click: `aria-expanded` toggles from `false` to `true`
   - After click: `FolderPermissionTerrain` mounts; verify SVG canvas appears

4. **Coordination panel row expand (lazy clash drill-down):**
   - The `CoordinationByProject` panel renders project rows with `button[aria-expanded="false"]`
   - Click a row with `aria-expanded` → `expand(projectId)` calls server action `loadProjectClashes`
   - Verify: `aria-expanded="true"` on the button after click
   - The `AuthorProfileDrawer` (testid: `author-profile-drawer`) can be triggered from expanded row author names

5. **Filter banner cross-filter (INT-04/INT-05):**
   - `[data-testid="filter-banner"]` appears after any project is selected via `ProjectPicker`
   - `[data-testid="filter-scope"]` shows "N of M projects"
   - `[data-testid="filter-clear"]` dismisses

**Note:** Slice clicks on the donut do NOT open a Sheet — they open the inline `PeopleDrillList` above the legend. The "View N people" button opens the Sheet. This is a locked decision in CONTEXT.md.

---

### Page 3: /template-mty

**Route file:** `app/(dashboard)/template-mty/page.tsx`
**Data loading:** RSC → 5 parallel server functions
**Client component:** `app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx`
**Loading skeleton:** `app/(dashboard)/template-mty/loading.tsx`
**tRPC calls:** ZERO

**Drill-downs to smoke-test (Success Criteria #2):**

1. **Table row → UserProfilePanel (AuthorProfileDrawer via profileEmail):**
   - `TemplateMembersTableShell` → `handleRowClick` → `onSelectMember(email)` → `setProfileEmail(email)`
   - `TemplateAnalysisCharts` opens `<AuthorProfileDrawer email={profileEmail}>` (testid: `author-profile-drawer`)
   - Selector to click: `table tbody tr` (DataTable row); verify `[data-testid="author-profile-drawer"]` visible

2. **Role-similarity graph node → RoleOverviewSheet:**
   - `RoleSimilarityGraph` → `onNodeClick(roleId)` → `setSelectedRoleId(roleId)` in `TemplateAnalysisCharts`
   - Opens `<RoleOverviewSheet open={!!selectedRoleId}>` (DrillSheet wrapper)
   - Selector: click on a `<circle>` SVG node in the graph (or click on the text label in the `path`/`text` elements rendered in the `<svg>` canvas of RoleSimilarityGraph)
   - Verify: `[role="dialog"]` appears with role name content
   - Sub-drill: clicking a member inside RoleOverviewSheet → `setProfileEmail` → AuthorProfileDrawer

3. **Folder terrain expand (same pattern as /access-analysis):**
   - `TerrainReveal` is included in `TemplateAnalysisCharts` (`templateTerrainActions.ts` provides `loadTemplateFolderTerrain`)
   - Check: `[data-testid="terrain-expand"]` exists on /template-mty
   - Verify expand/collapse cycle works

**RoleSimilarityGraph interaction note:** The graph is a React `<canvas>`-backed SVG rendered with d3-force. Node click fires `onNodeClick?.(s.node.roleId)`. There is no `data-testid` on individual nodes. The harness must either: (a) click the SVG at a known coordinate after the graph settles, or (b) trigger via the keyboard/keyboard simulation. The graph has a settle-and-freeze behavior — wait for `<canvas>` to stop repainting before attempting a node click.

---

### Page 4: /forma-proposal

**Route file:** `app/(dashboard)/forma-proposal/page.tsx`
**Data loading:** RSC → `loadFormaFolderTree()` → passes `templateId`, `templateName`, `folders` as props
**Client component:** `app/(dashboard)/forma-proposal/components/FormaProposalClient.tsx`
**Loading skeleton:** `app/(dashboard)/forma-proposal/loading.tsx`
**tRPC calls:** ZERO

**Drill-downs to smoke-test (Success Criteria #2):**

The existing `tests/e2e/forma-proposal.spec.ts` covers the primary smoke path:
- Click role in `RoleRail` → `getByText("VDC Specialist")` is visible
- Set `TierPicker` permission tier (`getByLabel("permission tier")`)
- Reload → draft persists from localStorage
- Export JSON button → triggers download

**Additional for UAT:**
1. **HierarchyView lazy load:** After picking a role, if the mode is "hierarchy" view, the `HierarchyView` dynamic import (`ssr: false`) must mount. Selector: the `ModeSwitch` component to toggle modes, then check `<canvas>` mounts.
2. **FormaParticleAccent canvas check:** `canvas` count ≤ 1 (R3F accent GPU gate).
3. **RoleManagerDialog (role rename/delete):** `<RoleManagerDialog>` is triggered from the rail — `page.getByRole('button', { name: /manage roles/i })` or equivalent.

**Reuse from existing spec:** The `forma-proposal.spec.ts` can be imported or its happy-path can be copied into `uat-workshop.spec.ts`.

---

## Q5: Build / Serve Logistics

[VERIFIED: package.json scripts, start-local.ps1, project memory]

### Deploy Reality

- Live app: runs on `:3000` via `npm run start` (`next start -H 0.0.0.0 --port 3000`), started by Task Scheduler at Windows logon
- "Deploy" = `npm run build --webpack` + restart (NOT a git merge); the whole working tree ships
- `npm run build` while :3000 is live → freezes the running app for ~8 min (500 errors on the live instance)

### UAT Build Recipe (Separate Port)

**Step 1 — Build production output to a separate directory:**
```powershell
# In PowerShell — builds without disturbing .next (prod build dir)
$env:NEXT_DIST_DIR = ".next-uat"
npm run build
# This creates .next-uat/ with production artifacts
```

**Step 2 — Start on :3100 using the separate dist:**
```powershell
$env:NEXT_DIST_DIR = ".next-uat"
$env:PORT = "3100"
node node_modules/.bin/next start -H 0.0.0.0 --port 3100
# Or: npx next start --port 3100
```

**Step 3 — Run the UAT spec against :3100 (production mode):**
```bash
E2E_BASE_URL=http://localhost:3100 npx playwright test uat-workshop \
  --config playwright.verify.config.ts
```

**HAZARD:** Do NOT run Step 1 (`npm run build`) while `:3000` is live. Either:
- Stop the Task Scheduler :3000 instance before building, OR
- Build to `.next-uat` (separate NEXT_DIST_DIR) — Next.js should not touch `.next/` when `NEXT_DIST_DIR` is set. Verify this: if `NEXT_DIST_DIR=.next-uat` is set before the build, the output goes to `.next-uat/` and the live `.next/` serving :3000 is untouched.

**Why production mode matters:** RSC page routes, server actions, dynamic imports (`dynamic(ssr:false)`), and the `loadOverviewTerrain` server action all behave differently in development mode (webpack hot reload, unoptimized imports). UAT must validate the real production output.

### Env Flags for UAT Build

The UAT build does NOT need `NEXT_PUBLIC_ACC_GRAPH_TEST=1` (that flag is only for the spatial-graph cosmos.gl tests). The UAT pages are `/users`, `/access-analysis`, `/template-mty`, `/forma-proposal` — none of which are gated by that flag.

`NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1` — check whether this flag is still needed for `/access-analysis`. If the new dashboard is the default, this flag may be unnecessary.

---

## Q6: Screenshot and Report

[ASSUMED — no existing UAT report format in repo]

### Screenshot Mechanism

`playwright.verify.config.ts` already has `screenshot: "on"` — Playwright captures screenshots automatically on each test (pass or fail) and attaches them to the HTML report at `playwright-report/`.

For structured UAT captures, use `testInfo.attach()` (same pattern as `proofShot()` in `acc-dc-graph.spec.ts`):
```typescript
async function uatScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const body = await page.screenshot({ fullPage: false });
  await testInfo.attach(name, { body, contentType: 'image/png' });
}
```

### Recommended Report Structure

**Automated gate report:** `.planning/phases/07-pre-workshop-uat/UAT-REPORT.md`

Generated after the Playwright run. Structure:

```markdown
# UAT Report — Phase 7 Pre-Workshop

**Date:** YYYY-MM-DD
**Build:** .next-uat (production mode)
**Port:** :3100

## Engineering Gates

| Gate | Command | Result | Notes |
|------|---------|--------|-------|
| tsc-0 | `npx tsc --noEmit` | PASS/FAIL | ... |
| repo-map:check | `npm run repo-map:check` | PASS/FAIL | ... |
| boundary diff | `git diff --name-only origin/deploy...HEAD` | PASS/FAIL | zero files in users/access-analysis/ |
| GraphCanvas grep | see command | PASS/FAIL | no conditional mount |

## Per-Page Gate Results

### /users
| Gate | Result |
|------|--------|
| Page loads (200ms skeleton) | PASS/FAIL |
| tRPC: no duplicate batches | PASS/FAIL |
| Horizontal overflow at 1280px | PASS/FAIL |
| Reduced-motion layout | PASS/FAIL |
| Light theme contrast (axe) | PASS/FAIL |
| Dark theme contrast (axe) | PASS/FAIL |
| Table row → DrillSheet drill | PASS/FAIL |
| Canvas count ≤ 1 (R3F) | PASS/FAIL |

... (repeat for /access-analysis, /template-mty, /forma-proposal)

## Screenshots
- [/users light](screenshots/users-light.png)
- [/users dark](screenshots/users-dark.png)
- ... etc.

## Owner Perceptual Checklist
(See below — owner runs live on secondary display)

## Defects Found
| # | Page | Severity | Description | Status |
|---|------|----------|-------------|--------|
| D-01 | ... | BLOCKER/COSMETIC | ... | FIXED/NOTED |
```

**Screenshots directory:** `.planning/phases/07-pre-workshop-uat/screenshots/`

### Owner Perceptual Checklist

The automated report includes a structured owner-run checklist section:

```markdown
## Owner Perceptual Checklist (Live Projector Pass)

Instructions: Run on secondary display at projector-reduced brightness (1280px).
Both light and dark (zinc) themes. Mark each ✓ PASS or ✗ BLOCK or ~ COSMETIC.

### /users
- [ ] No horizontal overflow at 1280px
- [ ] Data labels legible at projector brightness (both themes)
- [ ] Table rows crisp — sticky header visible, density toggle works
- [ ] Row click → DrillSheet slides in smoothly (≤200ms, directional)
- [ ] Motion fires only on mount, not on filter changes
- [ ] No clipped modals or panels

### /access-analysis
- [ ] KPIs + donuts load first (streaming, not one big load)
- [ ] Donut legend click → inline people drill
- [ ] "View N people" button → DrillSheet slides in
- [ ] Terrain "Show" button → terrain mounts, interactive
- [ ] Coordination row expand → lazy clash data loads
- [ ] Filter banner visible when project selected, Clear works
- [ ] Cross-filter updates all three panels without page navigation
- [ ] No horizontal overflow at 1280px

### /template-mty
- [ ] Members table load, search works, row click → profile drawer
- [ ] Role-similarity graph settles + node click → RoleOverviewSheet
- [ ] Terrain expand works

### /forma-proposal
- [ ] Role rail loads (VDC Specialist visible)
- [ ] Click role → folder tree updates
- [ ] Set tier → tier chip updates
- [ ] Reload → draft persists
- [ ] Export JSON downloads
- [ ] R3F particle accent visible but subtle (z-0, opacity 0.18)
- [ ] No clipped modals at 1280px

### GPU Observation (owner, DevTools → chrome://gpu or Memory tab)
- [ ] GPU memory stays below 400MB across all four pages
```

---

## Q7: Risks and Pitfalls

[VERIFIED from project memory and codebase inspection]

### Pitfall 1: NEXT_PUBLIC_ACC_GRAPH_TEST Disables GPU Physics — But Only in spatial-graph

**What happens:** `NEXT_PUBLIC_ACC_GRAPH_TEST=1` (set in `playwright.config.ts`'s `webServer.env`) controls `GraphCanvas.tsx` line 139:
```typescript
process.env.NEXT_PUBLIC_ACC_GRAPH_TEST !== "1";
```
This disables cosmos.gl GPU physics in the spatial-graph — it does NOT affect `/users`, `/access-analysis`, `/template-mty`, or `/forma-proposal` in any way.

**For UAT:** Do NOT set `NEXT_PUBLIC_ACC_GRAPH_TEST=1` in the production UAT build. The four UAT pages are unaffected by this flag. The FormaParticleAccent R3F and HeaderParticleAccent R3F run regardless of this flag.

---

### Pitfall 2: Lasso E2E Load-Flakiness at 120s Budget

**What happens:** `acc-3d-lasso.spec.ts` has a documented flake on Luis's PC under machine load — the spatial-graph lasso test times out at the 120s global budget. This is NOT a regression in the UAT pages.

**Mitigation:** UAT spec (`uat-workshop.spec.ts`) runs at `playwright.verify.config.ts`'s 360s timeout. Do not run the spatial-graph specs in the same Playwright invocation as the UAT spec — use a file-filter: `npx playwright test uat-workshop --config playwright.verify.config.ts`.

---

### Pitfall 3: Theme Toggle Timing — ECharts Remount Delay

**What happens:** `EChart.tsx` uses `key={resolvedTheme}` to force a clean canvas remount on theme switch. After calling `setTheme('dark')` via the toggle, there's a React re-render cycle before `resolvedTheme` updates and the key changes.

**Mitigation:** After theme toggle in Playwright:
```typescript
await page.getByRole('button', { name: 'Toggle theme' }).click();
await page.getByRole('menuitem', { name: 'Dark' }).click();
// Wait for ECharts to remount (key change + paint)
await page.waitForSelector('html.dark', { timeout: 5000 });
await page.waitForTimeout(500); // Canvas remount settling time
```

The `html.dark` class is added by next-themes when dark mode is active.

---

### Pitfall 4: tRPC Batching Obscures Per-Endpoint Counts

**What happens:** `httpBatchLink` batches multiple `useQuery` calls fired in the same React render cycle into a single `POST /api/trpc`. The request body is a JSON array where each index is a procedure call (e.g., `{"0":{"json":...},"1":{"json":...}}`).

**Consequence:** A single `POST /api/trpc` request body can contain 5–8 procedures simultaneously. Counting raw HTTP requests does NOT detect duplicate fetches — you must parse the body JSON.

**Mitigation:** In the harness, intercept and parse:
```typescript
const seenProcedures = new Map<string, number>();
page.on('request', async (req) => {
  if (!req.url().includes('/api/trpc') || req.method() !== 'POST') return;
  try {
    const body = JSON.parse(req.postData() ?? '{}');
    // tRPC batch: keys are "0", "1", "2", ...
    Object.values(body).forEach((call: any) => {
      const procKey = Object.keys(call?.json ?? {})[0] ?? 'unknown';
      // Alternatively parse from URL for GET batches
    });
  } catch { /* ignore parse errors */ }
});
```

**Simpler alternative:** Use the URL path for batched requests — the tRPC HTTP batch link encodes procedure names in the URL for GET requests but uses POST body for mutations. Check: if the app uses `httpBatchStreamLink` (it doesn't — it uses `httpBatchLink`), the batch is in the POST body. The procedure names appear in the URL for GET variant, but `httpBatchLink` always uses POST. The URL will be `/api/trpc` without procedure names in the path for batched POST calls.

**Practical gate:** Assert that `POST /api/trpc` is called ≤ 2 times on `/users` load (1 main batch + 1 for infinite query). For other pages: assert 0 POST requests to `/api/trpc`.

---

### Pitfall 5: 1280px Secondary Display Constraint Cannot Be Fully Automated

**What's automatable:** Setting `viewport: { width: 1280, height: 800 }` in the Playwright test context. This validates layout at 1280px.

**What isn't automatable:** The secondary display at projector-reduced brightness — contrast at low projector illumination, physical scroll behavior on a second monitor. The owner must run this live.

**Mitigation:** Override viewport in the UAT spec:
```typescript
test.use({ viewport: { width: 1280, height: 800 } });
```
This is different from `playwright.config.ts`'s default `{ width: 1600, height: 1000 }`.

---

### Pitfall 6: Access-analysis Pages Are RSC — No tRPC, No Cache Hits to Check

**What happens:** `/access-analysis`, `/template-mty`, `/forma-proposal` load all data via RSC server functions. They make ZERO tRPC calls. The PERF-03 gate ("each tRPC endpoint fetched once") effectively passes trivially for these pages — the gate is more meaningful for `/users`.

**Mitigation:** Still run the request-intercept check on all four pages. Assert 0 tRPC requests on the three non-users pages. This confirms no client-side tRPC was accidentally introduced.

---

### Pitfall 7: Do Not Build While :3000 is Live

**Documented in project memory.** Running `npm run build` while the Task Scheduler's `next start` is serving :3000 causes the live instance to return 500 errors for ~8 minutes.

**Mitigation:** Build during off-hours or stop the :3000 instance temporarily before building. Using `NEXT_DIST_DIR=.next-uat` should isolate the build from the live `.next/` directory, but this has NOT been verified in this repo — treat it as risky until confirmed.

**Safer approach:** Stop the Task Scheduler task → build → start :3100 → run UAT → promote to :3000 → restart Task Scheduler task.

---

### Pitfall 8: RoleSimilarityGraph Node Click Requires Graph Settle

**What happens:** `RoleSimilarityGraph` uses d3-force simulation. After mount, nodes animate to their stable positions. Clicking a node before the simulation freezes fires on a wrong position or misses entirely.

**Mitigation:** `RoleSimilarityGraph.tsx` has freeze behavior (6-05 commit: settle-and-freeze). After mount + short wait (1–2s), the graph is frozen. The harness should:
```typescript
await page.goto('/template-mty');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000); // Let graph settle
// Then attempt SVG node click
const svg = page.locator('svg').filter({ has: page.locator('circle') }).first();
const firstCircle = svg.locator('circle').first();
await firstCircle.click();
```

---

### Pitfall 9: FormaParticleAccent Only Loads When Role is Selected

**What happens:** `FormaParticleAccent` is `dynamic(ssr: false)`. It renders as the background of `FormaProposalClient`. But `FormaProposalClient` is a split-panel layout: the R3F accent might only be visible when the right-panel (editor) is active.

**For the canvas-count gate:** Navigate to `/forma-proposal`, wait for page to load. Even without role selection, `FormaParticleAccent` should mount as a background layer if the right panel is rendered. Verify by waiting for `canvas` presence after a short timeout.

---

## Standard Stack for UAT Harness

All tools are already in `package.json` — no new packages needed.

| Tool | Version | Purpose | Status |
|------|---------|---------|--------|
| `@playwright/test` | `^1.59.1` | E2E automation, request intercept, emulateMedia, screenshots | INSTALLED [VERIFIED: package.json] |
| `playwright` | `^1.59.1` | Playwright core | INSTALLED [VERIFIED: package.json] |
| `vitest` | `^4.1.6` | Unit tests (`npm test`) | INSTALLED [VERIFIED: package.json] |
| `typescript` | `^6.0.3` | `npx tsc --noEmit` gate | INSTALLED [VERIFIED: package.json] |
| `repomix` | `^1.14.1` | repo-map generation | INSTALLED [VERIFIED: package.json] |
| `@ast-grep/cli` | `^0.43.0` | ast-grep for repo-map:check | INSTALLED [VERIFIED: package.json] |
| `dependency-cruiser` | `^17.4.3` | dependency analysis in repo-map:check | INSTALLED [VERIFIED: package.json] |

**No new packages required for Phase 7.**

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Auth for Playwright | Custom cookie/header auth | Existing `playwright/global-setup.ts` JWT minting |
| Screenshot capture | Manual canvas screengrab | `page.screenshot()` + `testInfo.attach()` |
| Request counting | Custom network layer | `page.on('request', ...)` Playwright interception |
| Theme switching | JS `document.body.classList` | `page.getByRole('button', { name: 'Toggle theme' }).click()` then menu item |
| Reduced-motion emulation | JS `matchMedia` override | `page.emulateMedia({ reducedMotion: 'reduce' })` |
| Production server | Custom HTTP server | `next start --port 3100` + `playwright.verify.config.ts` |
| Contrast checking | Custom contrast calculation | Inject axe-core from CDN (`page.addScriptTag`) |

---

## Package Legitimacy Audit

No new packages are recommended for this phase. All tooling is already installed in the repo.

| Package | Status |
|---------|--------|
| `@playwright/test` ^1.59.1 | Already installed |
| `playwright` ^1.59.1 | Already installed |
| All other tools | Already installed |

**No new packages to evaluate.**

---

## Automated vs. Owner Split Table

| Gate | Type | Who | Command/Mechanism |
|------|------|-----|--------------------|
| `npx tsc --noEmit` exits 0 | Engineering | Automated | `npx tsc --noEmit` |
| `npm run repo-map:check` passes | Engineering | Automated | `npm run repo-map && node scripts/repo-map/check.cjs` |
| Zero files under `users/access-analysis/` in diff | Engineering | Automated | `git diff --name-only origin/deploy...HEAD \| grep users/access-analysis/` |
| No conditional GraphCanvas mount | Engineering | Automated | grep across 4 UAT page directories |
| No horizontal overflow at 1280px | Engineering | Automated | `page.evaluate(scrollWidth vs clientWidth)` |
| `/api/trpc` zero calls on /access-analysis, /template-mty, /forma-proposal | Engineering | Automated | Playwright request intercept |
| `/api/trpc` no duplicate procedure batches on /users | Engineering | Automated | Playwright request intercept + body parse |
| Reduced-motion: layout unchanged | Engineering | Automated | `page.emulateMedia({ reducedMotion: 'reduce' })` + visible checks |
| WCAG AA contrast (DOM-accessible elements) | Engineering | Automated | axe-core CDN injection, color-contrast rule |
| Canvas count ≤ 1 on /forma-proposal and /users | Engineering | Automated | `page.locator('canvas').count()` |
| Canvas count = 0 on /access-analysis and /template-mty | Engineering | Automated | `page.locator('canvas').count()` |
| All drills open (DrillSheet, PeopleDrillList, terrain) | Engineering | Automated | Playwright click + visibility assertions |
| Screenshots for each page × theme | Engineering | Automated | `page.screenshot()` + `testInfo.attach()` |
| Page loads within 200ms skeleton (PERF-01) | Engineering | Automated | `page.waitForSelector('[data-testid="kpi-strip"]', {timeout: 5000})` |
| **Projector-brightness label legibility** | **Perceptual** | **Owner** | Secondary display at reduced brightness |
| **No clipped modals at 1280px (visual)** | **Perceptual** | **Owner** | Live visual inspection |
| **Premium feel / "does it pop"** | **Perceptual** | **Owner** | Live visual inspection |
| **Horizontal overflow (visual confirmation)** | **Perceptual** | **Owner** | Live visual + scroll test |
| **GPU memory < 400MB** | **Perceptual (observed)** | **Owner** | DevTools Memory tab or chrome://gpu |
| **Drill transitions smooth/directional (felt)** | **Perceptual** | **Owner** | Live interaction |
| **Motion fires only on mount, not filter changes** | **Perceptual** | **Owner** | Live DevTools Performance timeline |

---

## Open Questions (RESOLVED — see 07-01 Task 1)

1. **Is `NEXT_DIST_DIR=.next-uat` safe while :3000 is live?**
   - What we know: `npm run build` with a different `NEXT_DIST_DIR` writes to `.next-uat/`, not `.next/`. Next.js should not invalidate the running `.next/` instance.
   - What's unclear: Whether Next.js reads/locks the current `.next/` during a build to a different `NEXT_DIST_DIR`.
   - Recommendation: Test this in isolation first (build while :3000 is running) before relying on it. If risky, stop the :3000 Task Scheduler task before building.
   - **Resolution (07-01 Task 1):** UNVERIFIED — default to stopping the :3000 Task Scheduler task before building. `NEXT_DIST_DIR=.next-uat` isolation is recorded as unverified; the 07-02 runbook verifies-then-falls-back. The gate wrapper never runs `npm run build`.

2. **Does `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1` need to be set for the UAT build?**
   - What we know: `playwright.config.ts` sets this flag in the dev-server env. The new `/access-analysis` route (`page.tsx` → `mainCharts.tsx`) is what we're testing.
   - What's unclear: Whether the route is conditional on this flag or if it's the default.
   - Recommendation: Read `next.config.ts` for any flag-based routing. If the new access analysis is the default, this flag is unnecessary. If it's still gated, include `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1` in the UAT build env.
   - **Resolution (07-01 Task 1):** NOT required — `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS` appears only in `app/(dashboard)/users/page.test.tsx` as a fixture; the new `/access-analysis` route is the default. Omit the flag from the UAT build env.

3. **FormaParticleAccent canvas: does it mount before role selection?**
   - What we know: `FormaProposalClient.tsx` renders `FormaParticleAccent` as a dynamic background (`ssr: false`). The component is inside the right-panel area.
   - What's unclear: Whether the R3F canvas mounts on initial load (before any role is selected) or only after a role triggers the right panel.
   - Recommendation: Navigate to `/forma-proposal` and count canvases before and after clicking the first role. Document the result in UAT execution.
   - **Resolution (07-01 Task 1):** Harness navigates to `/forma-proposal`, counts `canvas` before and after clicking the first role, and asserts ≤1 WebGL context (FormaParticleAccent); the count is recorded in UAT-REPORT.md.

---

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Node.js ≥22 | Build + tests | ✓ | Specified in `package.json` `engines` |
| Local Postgres (PG 18) | global-setup JWT minting (needs DB query) | ✓ | Task Scheduler `LECG Postgres Local` task |
| `.env` with AUTH_SECRET, ADMIN_EMAIL, DATABASE_URL | global-setup | ✓ | Present (app runs) |
| Playwright browsers (Chromium) | UAT harness | ✓ (assumed) | `@playwright/test` installed; check `npx playwright install chromium` if first run |
| Port :3100 | UAT server | ✓ (assumed) | Not the default :3000; should be free |
| `NEXT_DIST_DIR=.next-uat` isolation | UAT build | VERIFY | See Open Question 1 |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| E2E Framework | Playwright `^1.59.1` |
| Config for UAT | `playwright.verify.config.ts` (production-mode, no webServer block) |
| Quick run command | `E2E_BASE_URL=http://localhost:3100 npx playwright test uat-workshop --config playwright.verify.config.ts` |
| Full engineering gates | `npx tsc --noEmit && npm run repo-map:check` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| PERF-01 | Skeleton within ~200ms | Automated | Page load + `waitForSelector` skeleton |
| PERF-02 | /access-analysis KPIs+donuts load first | Automated | Check first visible element before terrain |
| PERF-03 | Each tRPC endpoint fetched once | Automated | Playwright request intercept + POST body parse |
| PERF-04 | /users initial payload not regressed | Automated | Assert no duplicate `bulkUsers` procedure in batches |
| PERF-05 | No new WebGL context on data pages | Automated | `page.locator('canvas').count()` |
| VIS-05 | Drill transitions ≤200ms, motion on mount/drill only | Owner-observed | Perceptual checklist |
| THM-01 | WCAG AA contrast, both themes | Automated + Owner | axe-core CDN + projector pass |
| INT-01 | DrillSheet is the drill target | Automated | Click → `[role="dialog"]` visible |
| INT-02 | Chart segments clickable → people/detail | Automated | Legend click → PeopleDrillList or Sheet |
| INT-03 | Table rows clickable + expandable | Automated | Row click → dialog; row expand |
| INT-04 | Cross-filter updates without queries | Automated | Project select → filter banner + 0 new tRPC POST |
| INT-05 | Active-filter pill bar dismissible | Automated | `[data-testid="filter-clear"]` click |

---

## Security Domain

This phase runs no new production code. The only security-relevant concern is the Playwright test runner having access to the `.env` file (contains `AUTH_SECRET`, `DATABASE_URL`). The JWT minting in `global-setup.ts` is already the established pattern. No new attack surface is introduced.

---

## Sources

### Primary (HIGH confidence)
- Direct read: `playwright.config.ts`, `playwright.verify.config.ts`, `playwright/global-setup.ts` — Playwright harness mechanics
- Direct read: `scripts/repo-map/check.cjs` — repo-map check logic
- Direct read: `.tools/repo-map/manifest.json` — current baseline state
- Direct read: `lib/core/providers.tsx` — tRPC `httpBatchLink` configuration
- Direct read: `components/ui/motion.ts` — `useSafeVariants` reduced-motion mechanism
- Direct read: `app/(dashboard)/access-analysis/components/TerrainReveal.tsx` — terrain expand pattern
- Direct read: `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` — all drill-down testids and state
- Direct read: `app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx` — role-sheet drill chain
- Direct read: `app/(dashboard)/users/UsersDirectoryClient.tsx` — table row → DrillSheet pattern
- Direct read: `app/(dashboard)/forma-proposal/components/FormaProposalClient.tsx` — dynamic imports, R3F accent

### Secondary (MEDIUM confidence)
- Project memory: GPU 2D physics flag behavior, lasso load flake, theme toggle timing, deploy hazard details

---

## Metadata

**Confidence breakdown:**
- Playwright harness mechanics: HIGH — files read directly
- tRPC batching behavior: HIGH — providers.tsx confirmed httpBatchLink
- Drill-down selectors: HIGH — testids verified in component files
- GPU memory measurement approach: MEDIUM — `performance.memory` is a JS heap proxy, not GPU memory; owner observation is the true gate
- axe-core CDN injection approach: MEDIUM — standard Playwright pattern but no prior use in this repo

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (stable tooling; repo changes may shift testid names)
