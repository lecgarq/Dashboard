# Codebase Concerns

**Analysis Date:** 2026-06-19

**Primary Sources:**
- `.tools/repo-map/manifest.json`
- `.tools/repo-map/architecture-summary.md`
- `.tools/repo-map/dependency-cruiser.json`
- `.tools/repo-map/ast-grep-report.json`
- Largest-file scan of mapped source roots

## Current Quality Gate Snapshot

| Gate | Status | Count | Meaning |
|---|---:|---:|---|
| Circular imports | Pass | 0 | No circular dependency edges detected |
| Dependency errors | Pass | 0 | No CI-blocking dependency-cruiser errors |
| Dependency warnings | Warn | 6 | All are baseline `no-scripts-to-app` warnings |
| AST blocking rules | Baseline | 1 / baseline 1 | No new direct-Prisma-in-UI finding |
| AST warnings/info/hints | Report | 277 | Review queue, not a hard failure |
| Baseline file refs | Pass | 0 | Baseline paths still exist |

## Tech Debt

**Scripts import route-owned app modules:**
- Issue: Six dependency-cruiser warnings show scripts importing code from `app/(dashboard)/...`.
- Files:
  - `scripts/build-instance-features.ts` -> `app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts`
  - `scripts/build-instance-features.ts` -> `app/(dashboard)/users/access-analysis/instanceFeatureTokens.ts`
  - `scripts/diag-activity-coordination.cjs` -> `app/(dashboard)/access-analysis/moduleOverrides.ts`
  - `scripts/diag-activity-module-audit.cjs` -> `app/(dashboard)/access-analysis/moduleOverrides.ts`
  - `scripts/diag-activity-service-xtab.cjs` -> `app/(dashboard)/access-analysis/moduleOverrides.ts`
  - `scripts/diag-activity-types.cjs` -> `app/(dashboard)/access-analysis/moduleOverrides.ts`
- Impact: Operational jobs depend on route-owned UI modules, making route cleanup risky and hiding domain logic in the wrong layer.
- Fix approach: Move shared graph/taxonomy/module helpers into `lib/acc/`, `lib/domain/access-analysis/`, or `lib/shared/`, then update both scripts and UI imports.
- Classification: Safe to plan; medium risk to implement because tests must prove behavior parity.

**ACC/Data Connector code is the largest and most coupled domain:**
- Issue: The fresh map identifies ACC/Data Connector as the largest domain and first cleanup target.
- Files: `lib/acc/dcIngest.ts` (57 KB), `lib/acc/dcIngest.test.ts` (47 KB), `lib/acc/quick-sync-extraction.ts` (35 KB), `lib/acc/folderCrawl.ts` (28 KB), `server/routers/acc-*.ts`, `scripts/acc-*`, `scripts/dc-*`.
- Impact: Ingestion, sync, graph, activity, folder, and member concerns span routers, lib helpers, and scripts. Changes have high blast radius.
- Fix approach: Split durable services into typed modules such as ingestion orchestration, CSV parsing, APS/Data Connector clients, folder/member transforms, and telemetry.
- Classification: Medium risk.

**Access-analysis UI and graph modules are large and dense:**
- Issue: Large files combine rendering, data transforms, graph interaction, state, and performance-sensitive canvas behavior.
- Files: `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx` (55 KB), `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx` (50 KB), `app/(dashboard)/access-analysis/folderTerrain.ts` (49 KB), `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` (38 KB), `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` (32 KB), `app/(dashboard)/users/access-analysis/physicsLayer.ts` (29 KB).
- Impact: Harder to change without visual regressions, redundant fetches, GPU/canvas regressions, or UAT breakage.
- Fix approach: Extract pure transforms and selectors first; leave render shell behavior stable; verify with unit tests plus targeted Playwright/UAT.
- Classification: Medium risk.

**Route-local domain taxonomy is reused outside routes:**
- Issue: Domain/taxonomy helpers under `app/(dashboard)/...` are used by scripts and domain modules.
- Files: `app/(dashboard)/access-analysis/moduleOverrides.ts`, `app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts`, `app/(dashboard)/users/access-analysis/instanceFeatureTokens.ts`.
- Impact: App route directories cannot be treated as UI-only; scripts and server/domain code rely on them.
- Fix approach: Move shared taxonomy/transform modules into a domain-owned folder, then keep route modules as UI composition only.
- Classification: Safe to plan; medium risk to implement.

## Known Bugs

No fresh repo-map artifact proves a specific runtime bug. Treat this file as a risk map, not a defect log.

If a bug is found, add:
- Symptoms
- Trigger/reproduction path
- Root cause
- Workaround
- Fix approach
- Test or UAT proof

## Security Considerations

**Direct Prisma access in UI is baselined but still sensitive:**
- Risk: `direct-prisma-in-ui` has 1 baseline finding.
- File from baseline: `app/(dashboard)/access-analysis/coordinationActions.ts`.
- Current mitigation: `repo-map:check` fails on new blocking direct-Prisma-in-UI findings.
- Recommendation: Audit the existing baseline item before tightening the rule to zero.
- Classification: Needs manual verification.

**Secrets must not leak into generated maps:**
- Risk: `.tools/repo-map/repomix-output.xml` and `.tools/repo-map/repomix/*.xml` are large source snapshots.
- Current mitigation: Repomix security check is enabled by generator config; GSD map docs should list env var names only.
- Recommendation: Keep `.env` and secret-bearing local outputs out of committed/generated context; run secret scan before committing generated docs.
- Classification: Safe.

**Auth and role checks concentrate at tRPC boundary:**
- Risk: New procedures can accidentally use `publicProcedure` when they need `protectedProcedure`, `adminProcedure`, or `editorProcedure`.
- Files: `server/trpc.ts`, `server/routers/*.ts`.
- Current mitigation: Role guards are available and simple.
- Recommendation: During router changes, explicitly review procedure guard choice.
- Classification: Safe.

## Performance Bottlenecks and Risk Areas

**Browser graph/analytics surfaces:**
- Problem: Large graph modules, heavy useEffect footprint, and canvas/WebGL paths are sensitive to fetch duplication and GPU/canvas regressions.
- Evidence: 148 `large-use-effect` matches; large files under `app/(dashboard)/users/access-analysis/` and `app/(dashboard)/access-analysis/`.
- Improvement path: Extract side-effect-free transforms; keep effects narrow; verify fetch-once and canvas count with UAT.
- Classification: Medium risk.

**Data Connector ingestion path:**
- Problem: Ingestion/backfill logic has large orchestration files and broad script/lib/router touch points.
- Evidence: `lib/acc/dcIngest.ts` and adjacent tests are among the largest source files.
- Improvement path: Split into smaller domain services with fixture-backed tests before changing behavior.
- Classification: Medium risk.

**Repo-map generation size:**
- Problem: Full Repomix artifacts are large and should be consulted selectively.
- Evidence: `.tools/repo-map/repomix-output.xml` is over 2 MB; zone slices range from config to app/server.
- Improvement path: Start analysis from `.tools/repo-map/manifest.json` and `.tools/repo-map/architecture-summary.md`; open zone XML only for focused code reading.
- Classification: Safe.

## Fragile Areas

**UAT-critical four-page workshop surface:**
- Files: `/users`, `/access-analysis`, `/template-mty`, `/forma-proposal`; tests in `tests/e2e/uat-workshop.spec.ts`.
- Why fragile: UAT gates enforce fetch-once, canvas count, reduced motion, 1280px overflow, contrast, drills, and screenshots.
- Safe modification: Run targeted unit tests, `npx tsc --noEmit`, `npm run repo-map:check`, and the UAT gate wrapper for visual/workshop changes.

**Dependency warning baselines:**
- Files: `.tools/repo-map/baselines/*.json`, `scripts/repo-map/check.cjs`.
- Why fragile: Baselines intentionally allow current warnings but fail on growth.
- Safe modification: Do not update baselines to hide regressions; fix or explicitly justify warnings.

**DuckDB/browser aliasing:**
- Files: `next.config.ts`, `lib/client/emptyDuckDbNode.ts`.
- Why fragile: DuckDB WASM is browser-oriented and server/client bundling must stay separated.
- Safe modification: Preserve aliasing and run build/type gates after changing analytics code.

## Dependencies at Risk

**NextAuth v5 beta:**
- Risk: Beta package surface can shift.
- Files: `auth.config.ts`, `server/auth.ts`, `types/next-auth.d.ts`, auth route handlers.
- Action: Treat auth upgrades as a dedicated change with login/session/role tests.

**`@cosmos.gl/graph` beta:**
- Risk: Graph rendering/layout package is beta and patched locally.
- Files: `patches/@cosmos.gl+graph+3.0.0-beta.9.patch`, access-analysis graph components/tests.
- Action: Avoid casual upgrades; verify graph UAT and canvas/GPU behavior.

**DuckDB WASM dev build:**
- Risk: Browser analytics paths depend on specific packaging/alias behavior.
- Files: `next.config.ts`, `scripts/copy-duckdb-wasm.cjs`, access-analysis DuckDB clients.
- Action: Upgrade only with build, browser, and UAT verification.

## Test Coverage Gaps

**No explicit coverage threshold:**
- What's not enforced: line/branch coverage.
- Current mitigation: large number of focused tests, TypeScript gate, repo-map gate, and Playwright/UAT gates.
- Recommendation: Add coverage only where it guides a concrete refactor; do not add a broad threshold during architecture cleanup.

**Large modules need characterization tests before atomization:**
- Files: `lib/acc/dcIngest.ts`, `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx`, `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx`, `components/dashboard/MailPanel.tsx`.
- Risk: Extracting helpers without behavior locks can regress live workflows.
- Recommendation: Add narrow characterization tests before moving logic.

## Cleanup Priority Summary

1. Safe: Move shared route-owned constants/transforms into domain/shared folders where imports already cross the boundary.
2. Safe: Keep repo-map as a standing gate and inspect warning growth after every architecture cleanup.
3. Medium risk: Split ACC/Data Connector ingestion into smaller services with tests.
4. Medium risk: Atomize access-analysis rendering modules by extracting pure transforms first.
5. Needs manual verification: Decide whether the baseline direct-Prisma-in-UI finding can be removed.
6. Needs manual verification: Separate durable scripts from diagnostics/scratch without breaking operational runbooks.

---

*Concerns audit: 2026-06-19*
*Update as warnings are fixed, baselines change, or new runtime defects are proven.*
