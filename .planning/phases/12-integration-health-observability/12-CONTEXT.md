# Phase 12: Integration Health & Observability - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Make three integration-health gaps observable, without touching the four workshop
pages. Scope is fixed to OBS-01/02/03:

1. **OBS-01** — ACCDS session expiry is visible *before* a crawl fails: a `[WARN]`
   from the crawl path plus a live health indicator on the `localhost:4321`
   progress monitor.
2. **OBS-02** — the silent "role names can't resolve" condition becomes a logged
   warning instead of failing quietly.
3. **OBS-03** — the two stale `TODO[02.5]` defensive-logging diagnostics are
   removed after confirming live field names.

This is a `scripts/` + `lib/server/` + monitor-UI phase. No new analytics, no
workshop-page changes, no schema changes.

</domain>

<evidence>
## Grounding Sources

- `.planning/STATE.md` / `.planning/ROADMAP.md` / `.planning/REQUIREMENTS.md` —
  established the OBS-01/02/03 success criteria and that Phase 12 follows Phase 11
  (now COMPLETE + owner-approved) in milestone v2.1.
- `.planning/codebase/CONCERNS.md` §2.4, §5.1, §5.3 — the source concerns behind
  OBS-02, OBS-01, and OBS-03 respectively.
- `scripts/progress-monitor.cjs` — verified: standalone read-only server on
  `:4321` that **reads local Postgres only and never calls Autodesk**. Renders
  plain HTML; today has no ACCDS-session awareness.
- `scripts/accds-login.cjs` + `scripts/accds-activity-ingest.cjs` +
  `lib/acc/accdsToken.ts` — verified: the ACCDS "session" is Playwright
  `storageState` **cookies in `scratch/acc-session.json`** (gitignored,
  password-equivalent). The crawler loads them via `loadCookieHeader` /
  `createTokenProvider` and throws a **fatal `SessionExpiredError`** when they
  die; recovery = re-run `accds-login.cjs`.
- `lib/server/acc-admin.ts` — verified: the two `TODO[02.5]` guards live **here**,
  not at the roadmap's `lib/acc/acc-admin.ts`. Line 51 (`// TODO[02.5]`) + line 52
  (`let loggedRawShape = false;`) gate a one-time `[02.5-D-DIAG]` diagnostic block
  at lines ~207–219 (marked `// TODO[02.5-D]`) inside the HQ-v1 user fetch loop.
  The diagnostics print user-object keys to confirm `companyRole` / `lastSignIn`.
- `server/routers/acc-dc-graph.ts` + `lib/server/accessInstanceView.ts` —
  verified: these are the files that read `AccDcRole`; the empty→`AccRole`
  fallback (`mergeRoleNames`) lives in `accessInstanceView.ts` (per Plan 11-01).
  `lib/server/acc-hot-cache.ts` does **not** reference `AccDcRole`.
- Project memory — `AccDcRole` is **permanently empty by design** (DC never sends
  `admin_roles.csv`); role names are sourced from live `AccRole` (77/77 match).
  This is why OBS-02 is reframed below.

- **VERIFY (OBS-02 injection point):** the roadmap attributes the "after a cache
  refresh" warning to `lib/server/acc-hot-cache.ts`, but `AccDcRole` is not
  referenced there. The researcher must locate where role resolution / the
  relevant cache refresh actually happens (likely `accessInstanceView.ts`'s
  `mergeRoleNames` path and/or the DC ingest sync) and place the warning at that
  real boundary.
- **VERIFY (OBS-01 expiry read):** confirm `scratch/acc-session.json` cookies
  carry usable `expires` (or `expiry`) timestamps so "expires in N hours" is
  computable from a local file read. If absent, fall back to a last-successful-use
  heuristic and label it as such.
- **VERIFY (OBS-03 field confirmation):** confirm `companyRole` / `lastSignIn`
  are consumed downstream (grep `lib/`, `app/`) and present in persisted
  `AccMemberCache.data` before deleting the diagnostics.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- **No workshop-page UI.** `/users`, `/access-analysis`, `/template-mty`,
  `/forma-proposal` are untouched. The only "UI" is the read-only `:4321` monitor.
- **Reuse existing homes:** a shared `getSessionHealth(sessionPath)` helper belongs
  in `lib/acc/accdsToken.ts` (already owns session/token loading); the monitor's
  health row reuses its existing dense, read-only HTML render — no new framework,
  no WebGL, no ECharts.
- **Secret hygiene:** read only cookie *expiry metadata* from
  `scratch/acc-session.json`; never log cookie values, never commit the file, keep
  it gitignored.
- **No schema changes.** OBS work is logging/observability only.
- **Gates:** `npx tsc --noEmit` before any rebuild; the monitor + crawl scripts are
  `.cjs`/`tsx`-loaded, so prefer a runnable smoke check over a typecheck-only claim.

</defaults>

<decisions>
## Implementation Decisions

### OBS-01 — Session-health warning threshold
- Emit `[WARN] ACCDS session expires in <N> hours` (or `session expired`) when the
  session has **< 12 hours** remaining. Otherwise print a single one-line healthy
  status at crawl/monitor startup (not a warning).
- The crawl-side warning fires **before** the token provider is first used (startup
  preflight), so it precedes any `SessionExpiredError`.

### OBS-01 — Monitor display
- The `:4321` monitor shows an **always-on session-health status line** on every
  refresh: green "healthy — expires in Nh" / amber "< 12h" / red "expired — run
  `scripts/accds-login.cjs`". Matches the monitor's existing compact, read-only
  style; placed alongside the existing crawl/quota sections.

### OBS-02 — Warning trigger (reframed, grounded correction)
- Warn **only when role-name resolution is effectively empty** — i.e. BOTH
  `AccDcRole` AND the `AccRole` fallback yield zero usable role names. This is the
  real silent failure.
- Do **not** warn on the by-design `AccDcRole`-empty state alone (it is always
  empty; a literal warning would fire every refresh forever and contradict this
  phase's noise-reduction goal). Record this as a deliberate divergence from the
  literal roadmap wording.
- Channel: a single `console.warn` per refresh event with a stable, greppable
  prefix (e.g. `[ACC-ROLES]`); always on (not dev-gated, not rate-limited beyond
  once-per-refresh).

### OBS-03 — Stale-guard removal safety
- **Code-grounded confirmation**, no live sync required: confirm `companyRole` /
  `lastSignIn` are consumed downstream and present in persisted `AccMemberCache`
  data, then delete the `TODO[02.5]` (line 51–52) and `TODO[02.5-D]` (lines
  ~207–219) diagnostics from `lib/server/acc-admin.ts`, including the now-unused
  `loggedRawShape` module variable.

### Claude's Discretion
- Exact log prefixes/wording, the helper's signature/return shape, the monitor
  row's markup and color tokens, and how the crawl-side preflight is wired — as
  long as they honor the decisions above and the Dashboard defaults.

</decisions>

<specifics>
## Specific Ideas

- Treat Luis as the **operator** who runs ACCDS crawls intermittently and watches
  `:4321`. A dead session is fatal to the whole run and re-login is cheap, so the
  warning's job is to give him a clear heads-up *before* he kicks off a long crawl,
  and the monitor's job is at-a-glance "is my session good right now?".

</specifics>

<workshop>
## Workshop Impact

- **No workshop-page change.** Surface is the operator-facing `localhost:4321`
  monitor and the crawl/admin-sync server logs.
- Indirect demo benefit: fewer surprise crawl failures and a faster diagnosis path
  when ACC data looks stale, which protects the freshness of the four workshop
  pages.

</workshop>

<data_truth>
## Data Truthfulness

- **No data changes.** This phase adds observability over existing flows.
- The OBS-02 reframing **is** a data-truth decision: the warning must fire on the
  real failure (no resolvable role names) rather than on the cosmetic, by-design
  `AccDcRole`-empty state — so the signal honestly reflects when role labels are
  actually broken.
- OBS-01 session expiry derives from local Playwright cookie metadata; if a precise
  `expires` timestamp isn't available, the monitor must label the indicator as a
  best-effort estimate rather than implying an exact countdown.

</data_truth>

<deferred>
## Deferred Ideas

None — discussion stayed within OBS-01/02/03 scope.

</deferred>

<verification>
## Verification Expectations

- `npx tsc --noEmit` before any rebuild (typechecks the whole tree incl. tests).
- **OBS-01:** run `node scripts/progress-monitor.cjs`, load `:4321`, and confirm the
  session-health line renders for healthy / `<12h` / expired states (simulate by
  pointing at a session file with a near/expired cookie expiry). Confirm the crawl
  path prints the `[WARN]` preflight line before the token provider runs.
- **OBS-02:** confirm the warning fires only when both `AccDcRole` and `AccRole`
  resolve to zero role names, and stays silent in normal operation; verify the
  injection point matches the VERIFY'd refresh boundary.
- **OBS-03:** confirm `grep "TODO\[02.5"` over `lib/server/acc-admin.ts` returns
  nothing and `loggedRawShape` is gone; confirm `companyRole`/`lastSignIn` usage is
  intact (no regression in the admin sync).
- Guardrails: zinc theme untouched (no workshop UI), no new WebGL, no schema change,
  `scratch/acc-session.json` stays gitignored and uncommitted,
  `/users/spatial-graph` untouched.

</verification>

---

*Phase: 12-integration-health-observability*
*Context gathered: 2026-06-30*
