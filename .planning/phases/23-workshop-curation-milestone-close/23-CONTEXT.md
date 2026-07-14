# Phase 23: Workshop Curation & Milestone Close - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

The v2.3 milestone-closing gate. Two jobs, in order:

1. **Curate** the `/access-analysis` panel surface for workshop coherence — ordering and
   placement only.
2. **Close** the milestone — deploy to `:3000`, run a graph-by-graph owner sign-off across
   the whole workshop surface, pass the full gate sequence, and write the milestone artifacts.

**Zero new requirements. Zero new panels, loaders, or charts.** ISSUE-01–05, PERM-01, ENG-01,
and PIPE-01 are all already delivered. If curation "needs" a new chart, it is out of scope
and becomes a v2.4 seed.

</domain>

<evidence>
## Grounding Sources

- **ROADMAP.md Phase 23 entry** — established the four success criteria. **Criterion #1 is
  partially obsolete** (see Inferred Defaults below).
- **`.planning/STATE.md`** — established that Phases 20/20.1/21/21.1/22 are all complete, 8/8
  requirements delivered, and flagged the two carried concerns this phase must resolve
  (panel-inventory drift; `IssueTypeChart` has no owner UAT).
- **Live panel recount (2026-07-14)** — enumerated from the six `*TabPanel.tsx` files under
  `app/(dashboard)/access-analysis/components/`. This is the authoritative inventory, not the
  roadmap's stale "15 baseline + 7 new" arithmetic:

  | Tab | N | Panels |
  |---|---|---|
  | Overview | 5 | Activity over time · Activity by module · Activity share by project · Provisioned modules · Ingest freshness |
  | Roles | 5 | Role distribution · Activity by role · Permission volume by level · Activity recency by role · Folder action heatmap |
  | Users | 2 | Users by permission level · Activity recency detail |
  | Companies | 3 | Users by company · Activity by company · Folder activity by company |
  | Projects | 6 | Issue coverage · Issues over time · Issues by status · Issues by type · Workflow tools (4 donuts) · Model Coordination |
  | Compare | 1 | Folder permission terrain |
  | **Total** | **22** | |

- **Git history** — the 2026-07-13 off-roadmap commits (`93722dae`, `72b2150a`, `ac91b1d8`,
  `874565b6`) and the workflow-tools donuts (`b0ce345f`). Verified: `874565b6`'s
  "roles-per-level strip" and "no-activity-in-a-year callout" are enhancements **inside**
  existing `PermissionLevelChart`/`ActivityRecencyChart` components, **not new panels**.
- `VERIFY:` whether `:3000`'s currently-served build matches branch HEAD. The branch has had
  commits since the last deploy (incl. the workflow-tools commit), so a rebuild is assumed
  necessary — plan 23-01 must confirm, not assume, before claiming the reviewed surface is current.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- **Criterion #1's premise is already satisfied — do not re-solve it.** ROADMAP criterion #1
  asks whether panels should be "grouped or made expandable/collapsible" rather than "shipped
  flat by default," because a flat wall of 22 charts would dilute the workshop story.
  **Phase 20.1 already built the 6-tab IA that solves this.** The criterion was written
  2026-07-02, before 20.1 existed (it was an inserted phase born from Phase 20 UAT). Treat
  criterion #1 as **answered by the tab IA**; the planner must not manufacture a grouping/
  collapse scheme to satisfy stale wording.
- Preserve the 6-tab IA, the zinc theme, existing chart/theme utilities, and all existing
  loaders. No new WebGL on data surfaces. `/users/spatial-graph` untouched.
- `npx tsc --noEmit` before any rebuild. Deploy = Task Scheduler stop → build → restart on
  `:3000`, never a branch merge.
- Explicit-path commits with `git diff --cached --name-only` proof (branch carries heavy
  unrelated WIP).

</defaults>

<decisions>
## Implementation Decisions

### Curation scope — ordering only, and it is nearly a no-op

- **Rebalancing panel counts across tabs is an explicitly REJECTED goal.** The apparent
  "imbalance" (Projects 6, Users 2, Compare 1) is a false problem: a tab with two strong
  panels is not broken, and padding thin tabs to even out arithmetic is manufactured work.
- **Tab order is CORRECT as-is and does not change:** Overview → Roles → Users → Companies →
  Projects → Compare. It encodes a widening-to-narrowing funnel (account-wide activity → roles
  → people → companies → project work → deep compare). **Overview leads the workshop.**
- **Nothing gets cut or demoted.** Every one of the 22 panels answers a distinct question and
  earns its place. Curation is ordering, not deletion.
- **Net remaining curation work:** verify each tab leads with its strongest panel, and reorder
  *within* a tab only where it does not. Expect this to be a small or empty diff. **A zero-diff
  curation result is a legitimate, successful outcome** — do not invent reordering to justify
  the phase.

### Sign-off — graph-by-graph, full surface

- Owner reviews **all 22 panels across all 6 tabs**, one at a time, on a rebuilt `:3000`.
  This is the last gate before milestone close and the only pass that would catch a wrong
  number in a pre-v2.3 panel.
- **`/users` is IN SCOPE for sign-off** (verification only, no curation edits). Its
  2026-07-13 off-roadmap changes — directory summary tiles, external collaborators,
  affiliation filter, company column — shipped on this branch and have never been reviewed.
- **`IssueTypeChart` gets explicit attention.** It is the only panel in v2.3 with zero
  recorded owner UAT (Phase 22 closed on live-`:3000` evidence; its `:3100` preflight
  checkpoint was never run). See `22-03-SUMMARY.md`.

### Findings triage — the anti-scope-creep rule

The review WILL surface items (every UAT round in v2.3 has: Phase 20 → 20.1, Phase 21 → 21.1).
Triage them at the moment they are raised:

- **Fix in Phase 23:** copy/label fixes, wrong wording, ordering nits, obvious visual defects —
  anything that touches no loader and adds no data.
- **Defer to v2.4:** anything needing a new loader, new chart, new data source, or a schema/
  taxonomy change. Record as a milestone seed, do not build.
- **Explicit goal:** keep the milestone CLOSEABLE. The 20.1/21.1 inserted-phase pattern is what
  stretched v2.3 from 4 phases to 6. **Do not insert a Phase 23.1.**

### Deploy sequencing

- **Rebuild `:3000` is the FIRST plan of the phase**, before any review. You cannot sign off on
  a surface that is not deployed, and the branch has drifted from the live build.
- Standard sequence: Task Scheduler stop → `npx tsc --noEmit` → `npm run build` → restart →
  `/api/health` 200 probe. Brief live downtime is accepted and expected.
- No isolated `:3100` preflight this time — the review target IS `:3000`.

### Claude's Discretion

- Whether any within-tab reorder is actually warranted (and the exact ordering if so).
- The structure/format of the graph-by-graph review checklist handed to the owner.
- Milestone-close artifact mechanics: MILESTONES.md entry, STATE snapshot, PROJECT.md
  Active → Validated promotion, ROADMAP v2.4 seeds, config reset.
- Whether to run `scripts/gsd-self-gate.cjs --phase 23 --rebuild` as the gate driver vs. the
  manual deploy sequence.

</decisions>

<specifics>
## Specific Ideas

- The owner has said since the 21-04 checkpoint that he wanted to review the dashboard
  "graph-by-graph" across the remaining tabs. **This phase is where that happens.** Structure
  the review so it is easy to work through one panel at a time rather than as a wall of
  questions.
- Optimize for a credible live demo: the presenter must be able to explain what each panel
  shows, what data backs it, and where coverage is incomplete — without opening devtools.

</specifics>

<workshop>
## Workshop Impact

- **Primary surface:** `/access-analysis` (all 6 tabs, 22 panels).
- **Also in sign-off scope:** `/users` (verification only — never reviewed since its
  2026-07-13 changes).
- **Not in scope:** `/template-mty` and `/forma-proposal` — no v2.3 panel landed on either.
  `VERIFY:` confirm this with a diff check before the review, rather than assuming.
- **Outcome:** the four-page workshop surface is coherent, deployed, owner-approved, and safe
  to present live. v2.3 becomes the first milestone in this branch's history to get a single
  deliberate full-milestone deploy + sign-off pass, rather than per-phase spot checks.

</workshop>

<data_truth>
## Data Truthfulness

- **No data changes in this phase.** No new loaders, no new Prisma queries, no schema edits,
  no backfills.
- The sign-off must confirm existing honesty labels still read correctly on the live build,
  specifically:
  - The workflow-tools caption stating RFI/Submittal events come only from the batch Data
    Connector feed (the live accds feed does not emit those verbs, so recent weeks lag).
  - The issue-coverage captions (fetched/total/unavailable, live-computed, never hardcoded).
  - `IssueTypeChart`'s "Unknown type" / "No type set" buckets and its never-backfilled guard.
  - The module-attribution ⓘ caveat computing the live service/verb split.
  - Activity-recency "Never active" bands, which honestly dominate on accds-covered population.
- If the owner disputes a NUMBER (not a label) during review, that is a data-truth finding —
  triage it as v2.4 work unless the cause is a display bug.

</data_truth>

<deferred>
## Deferred Ideas

- **Any new panel, loader, or data source surfaced during the review** → v2.4 seeds. Do not
  build in this phase.
- **Playwright/dev-server infra fix** (carried from 20.1-07): `playwright.config.ts`'s
  `webServer.command` hardcodes `next dev --webpack`, which 500s on this machine; `--turbopack`
  deterministically corrupts CSS. E2e specs needing a dev server remain blocked. Belongs in a
  future infra phase — explicitly NOT this one.
- **Phase 17 SPLIT-04 owner visual sign-off** (carried from v2.2): accepted on a
  test-basis/DOM-golden basis only; no production code mounts the surface
  (`/users/access-analysis` redirects to `/users/spatial-graph`). Out of v2.3 scope; revisit
  if the surface ever gets a live mount.

</deferred>

<verification>
## Verification Expectations

Maps to ROADMAP Phase 23's success criteria, with #1 reinterpreted per Inferred Defaults:

1. **Panel review (criterion #1, reinterpreted):** the live 22-panel inventory is explicitly
   recounted and reviewed for tab placement and within-tab priority order. The tab IA from
   Phase 20.1 is confirmed as the answer to the wall-of-charts risk. A zero-diff result is a
   pass, not a failure.
2. **Owner sign-off (criterion #2):** graph-by-graph approval across all 6 `/access-analysis`
   tabs plus `/users`, captured after a fresh `:3000` rebuild (Task Scheduler stop → `npx tsc
   --noEmit` → `npm run build` → restart → `/api/health` 200).
3. **Gates green (criterion #3):** `npm test` passes (characterization tests TEST-01/02/03 stay
   byte-identical; all v2.3 aggregate-bound tests green); `npx tsc --noEmit` exits 0.
   `VERIFY:` a pre-existing `/users` `physicsLayer.test.ts` isolation flake is logged in
   `22-issue-type-resolution/deferred-items.md` — confirm it is still the ONLY failure and
   still passes in isolation; do not let it silently mask a real regression.
4. **Guardrails (criterion #4):** `git diff` + `node scripts/repo-map/check.cjs` confirm no new
   WebGL on `/access-analysis` and that `/users/spatial-graph` was untouched across the entire
   v2.3 milestone (Phases 20 → 23, not just this phase).

Plus: explicit-path commits only, with `git diff --cached --name-only` proof before each.

</verification>

---

*Phase: 23-workshop-curation-milestone-close*
*Context gathered: 2026-07-14*
