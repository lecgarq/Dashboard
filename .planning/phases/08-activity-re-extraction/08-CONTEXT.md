# Phase 8: Activity Re-Extraction (free ACCDS web-session crawler) - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Bring `AccActivityAccds` current for the admin-accessible ACC project set using the **free, no-quota ACCDS web-session crawler** (`scripts/accds-activity-ingest.cjs`, session bootstrapped by `scripts/accds-login.cjs`). This is the hard data gate before any data-dependent view (Phases 12–14: calendar heatmap, behavior-mix, hottest files, folder reach, Sankey) is built.

This phase is **extraction operations on an existing crawler**, not new product code. It does NOT use the Data Connector API (no ~25/day DC quota, no `DC_403_BISECT`, no APS refresh-token rotation). Auth is the logged-in ACC web session (`scratch/acc-session.json`, password-equivalent, gitignored). The crawler hits the web-UI activity endpoint: `https://developer.api.autodesk.com/accds/v0/projects/{projectId}/data?template=activities`.

</domain>

<decisions>
## Implementation Decisions

### Extraction method (LOCKED)
- **ACCDS session-cookie crawler ONLY.** The quota-bound DC/APS user-context path is explicitly not used for activity. Owner was emphatic: "the one that asks me a session cookie, that one."
- Re-login on `SessionExpiredError` via `node scripts/accds-login.cjs`; resume the un-crawled remainder via `ACCDS_RESUME=1` (project-level skip — skips any project that already has ACCDS rows).
- Throughput levers stay as-is unless a run proves them inadequate: `ACCDS_CONCURRENCY=6` projects × `ACCDS_PAGE_CONCURRENCY=8` pages.

### History depth (LOCKED: max available)
- Crawl the **widest history the session API will return** — owner wants "extract ALL." Set `ACCDS_MONTHS_BACK` high enough to cover each project's full lifetime (the crawler splits into ≤30-day windows via `splitWindows`, so a large value just creates more windows — it is not capped client-side).
- `VERIFY:` whether `accds/v0` itself floors how far back `filter[created_at]` can reach. If it caps, accept the cap and **label the real span** in any downstream date-range UI rather than implying full history.

### Project source & coverage (LOCKED: spike full membership first)
- The crawler currently iterates `distinct AccActivity.projectId` (≈428) — that 428 ceiling is **inherited from the old DC extraction**, not a property of the session endpoint.
- **Plan task 1 is a spike:** enumerate the owner's *full* ACC project membership (potentially ~1,152) and test `accds/v0` on projects where he is a **member but not admin**.
  - If `accds/v0` returns activity for member-only projects → feed the full membership list as the crawler's project source and crawl **everything reachable** (no admin change, no quota). This is the "extract ALL" win.
  - If `accds/v0` requires admin → fall back to the known ≈428 admin set for this phase's gate; the ~724 become a deferred Account-Admin action (see Deferred).
- `VERIFY:` the membership-enumeration source (session-based project list vs APS 3-leg project list) — decided in the spike.

### Admin-grant route (LOCKED: do NOT self-elevate now)
- Owner asked "can you add me as admin on the member-only ones?" Answer: not unilaterally. Granting admin on ~724 live production projects is a bulk, hard-to-reverse, outward-facing change (ACC notifications, audit logs, real access changes in a shared account).
- **Spike the session endpoint first** — find out if admin is even needed before changing anyone's admin.
- The admin grant is revisited ONLY if the spike proves `accds/v0` is admin-gated, AND then only with **Account Admin sign-off**, prototyped on **one** project (reversible/observable) before any bulk run. `VERIFY:` whether the dashboard's APS app even holds account-admin write scope (it is proven for folder *reads*, not member *writes*) — checked only if/when this route is pursued.

### Folder data for Phase 13 treemap (LOCKED: yes)
- Also run the **2-legged APS folder crawl** (`scripts/folder-crawl-cron.cjs` → `lib/acc/folderCrawl.ts`) to populate `AccFolder.totalSizeBytes` (+ `AccFolderPermission`) so the Phase 13 storage treemap (FOLD-04) has real data.
- This is an APS **app-credential** job (the existing weekly production path): **no DC per-user daily quota, no login session, no refresh-token rotation** — none of the friction the owner is avoiding. Clarified and approved on that basis.
- Mirror the activity crawl's project scope where practical; `AccFolderPermission` queries must use `GROUP BY` + `LIMIT` (v2.0 OOM incident: 5M rows, 77s).

### Currency / gate definition (LOCKED: report, don't block)
- **No strict recency gate.** Owner: "all the loose data." Take everything available; record the actual latest `AccActivityAccds.createdAt` and surface it as a labeled fact. Do NOT block Phases 12–14 on a freshness threshold.
- The verification gate is therefore **coverage + presence**, not recency: the crawled project set is complete (per the spike outcome) and `AccActivityAccds` holds rows; `scripts/diag-accds-recency.cjs` is used to *report* the latest date, not to fail the build on it.

### Timeline (LOCKED)
- **No hard date — run to completion.** Crawl fully, resuming on session expiry, before gating downstream phases. No urgent MTY-first batching required.

### Claude's Discretion
- Exact `ACCDS_MONTHS_BACK` numeric value to express "full lifetime" (pick a safe large value, e.g. covering the oldest project).
- Concurrency tuning if a run is too slow or trips rate limits (`retry-after` already handled in `fetchActivityWindow`).
- Folder-crawl scheduling/ordering relative to the activity crawl (independent jobs; either order is fine).
- Which diagnostic(s) to run for reconciliation (`scripts/verify-accds-merge.cjs`, `scripts/diag-accds-vs-dc.cjs`) and how to present the reconciliation summary.

</decisions>

<specifics>
## Specific Ideas

- Owner's framing, verbatim intent: "extract ALL with the workaround that doesn't need quota… the one that asks me a session cookie." Currency over completeness-of-freshness — "all the loose data" beats a strict today-only gate.
- The session-endpoint spike is the centerpiece: it may make the entire 428-vs-1,152 admin problem moot for *reading* activity, without touching production permissions.

</specifics>

<deferred>
## Deferred Ideas

- **Unlock the ~724 member-only projects via Account Admin** — organizational action (Account Admin grants Luis Account Admin, or scripted per-project admin grant). Only pursued if the session spike proves `accds/v0` is admin-gated, and then only with explicit Account-Admin sign-off + 1-project prototype. NOT Phase 8 code.
- **DC `AccActivity` CSV refresh** (the quota-bound path) — remains OPTIONAL, only needed if legacy DC-sourced panels must also be made current. Decided at plan time of the consuming phase, not assumed here.
- **Data-authority decision** — whether new activity views (Phases 12/14) source `AccActivityAccds` (fresh, folder/object-level, session-window) vs `AccActivity` (DC CSV, comprehensive) — explicitly deferred to the Phase 11/12 plan per the roadmap, not resolved in Phase 8.

</deferred>

---

## Dashboard self-check

- **Context:** Loaded `.planning/STATE.md`, `.planning/ROADMAP.md` (Phase 8 detail), and verified the live crawler stack: `scripts/accds-activity-ingest.cjs`, `scripts/accds-login.cjs`, `scripts/diag-accds-recency.cjs`, `scripts/verify-accds-merge.cjs`, `scripts/diag-accds-vs-dc.cjs`, `scripts/folder-crawl-cron.cjs`, `lib/acc/accdsActivity.ts`, `lib/acc/accdsToken.ts`, `lib/acc/folderCrawl.ts`, and the `AccActivityAccds` model + `AccFolder.totalSizeBytes` in `prisma/schema.prisma`.
- **Evidence:** Env knobs (`ACCDS_MONTHS_BACK` default 12, `ACCDS_PROJECT`, `ACCDS_NAME_LIKE`, `ACCDS_RESUME`, `ACCDS_CONCURRENCY`, `ACCDS_PAGE_CONCURRENCY`) and the `accds/v0` endpoint read directly from source. The 428 project source = `distinct AccActivity.projectId` confirmed in the ingest script. Folder size path = APS 2-legged (`folder-crawl-cron.cjs`), confirmed distinct from the session crawler.
- **Constraints applied:** Coverage-honesty (label real history span + latest date; no hidden gaps), `AccFolderPermission` GROUP BY + LIMIT (OOM), no DC quota / no APS refresh-rotation per the v3.0 correction, hard-to-reverse production permission changes gated behind owner + Account-Admin sign-off.
- **Gates (for the planner):** `npx tsc --noEmit` = 0; stop Task Scheduler build before any `npm run build`; `SELECT COUNT(DISTINCT "projectId"), MAX("createdAt") FROM "AccActivityAccds"` reports the crawled set; reconcile with `verify-accds-merge.cjs`.
- **VERIFY:** (1) `accds/v0` history floor on `created_at`; (2) whether `accds/v0` returns data for member-only (non-admin) projects — the core spike; (3) full-membership enumeration source; (4) APS app account-admin write scope — only if the admin route is ever pursued.

---

*Phase: 08-activity-re-extraction*
*Context gathered: 2026-06-22*
