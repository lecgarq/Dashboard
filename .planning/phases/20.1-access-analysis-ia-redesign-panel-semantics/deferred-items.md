# Deferred Items — Phase 20.1

## 20.1-07: Turbopack CSS-parsing flakiness on `app/globals.css` (out of scope)

**Found during:** Task 1/Task 2 e2e execution (live-browser repro for UAT-5).

**Symptom:** Running `next dev --turbopack` against a fresh `NEXT_DIST_DIR`
intermittently (roughly half the time, across ~15 fresh-cache runs this
session) fails to compile `app/globals.css`, emitting repeated "Parsing CSS
source code failed" / "Invalid dangling combinator in selector" / "Unexpected
token Delim(...)" errors with garbled Unicode replacement characters inside
Tailwind arbitrary-value selectors (e.g.
`.shadow-\[var\(--\e ??elevated\)\]`). When it happens, every route 500s
until the dev process is killed and restarted against a clean build cache.
Retrying with a freshly deleted dist dir reliably recovers on the next
attempt.

**Also found:** `next dev --webpack` (the command hardcoded in
`playwright.config.ts`'s `webServer` and in `package.json`'s `dev:next`
script) currently 500s on every request to `/login` on this machine/Next
16.2.6 combination — matching project memory
`infra_e2e_webpack_broken_use_turbopack.md`. Turbopack (`--turbopack`) is the
only working dev-server option right now, modulo the CSS flakiness above.

**Why deferred:** Neither symptom is caused by this plan's changes (verified:
reproduces identically against unmodified `RolesPieChart.tsx` and against
`main`'s existing `playwright.config.ts`/`package.json` dev scripts). Fixing
either is outside this plan's file scope
(`tests/e2e/access-analysis-scroll.spec.ts`,
`AccessAnalysisCharts.tsx`, `RolesPieChart.tsx`).

**Recommendation:** A future phase (or a standalone infra fix) should:
1. Investigate the `app/globals.css` Turbopack parse-corruption bug (possibly
   a Turbopack version issue with this repo's very large Tailwind
   arbitrary-value class surface, or an encoding issue specific to fresh
   `NEXT_DIST_DIR` builds).
2. Consider switching `playwright.config.ts`'s `webServer.command` and
   `package.json`'s `dev:next` script from `--webpack` to `--turbopack` now
   that webpack is confirmed broken (not just for e2e -- for any local dev
   session), since Turbopack works the majority of the time and Webpack does
   not work at all currently.

**Workaround used this session:** retried the affected `npx playwright test`
/ manual `next dev --turbopack` invocation against a freshly deleted
`NEXT_DIST_DIR` until it succeeded (no source changes involved).
