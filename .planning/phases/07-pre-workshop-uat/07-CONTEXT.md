# Phase 7: Pre-Workshop UAT - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

A verification gate, not a feature build. Prove all four redesigned pages — `/users`, `/access-analysis`, `/template-mty`, `/forma-proposal` — survive a live-room projector at 1280px in both light and dark (zinc) themes, and that the hard engineering gates pass: `npx tsc --noEmit` exits 0 (incl. test files), each tRPC endpoint fetched once per page load, GPU < 400MB, `prefers-reduced-motion: reduce` leaves layout unchanged, `git diff --name-only` confirms zero `/users` work touched files under `users/access-analysis/` (spatial-graph boundary), and a grep confirms no conditional `GraphCanvas` mount pattern was introduced.

Findings become fixes or logged defects. No new requirements, no new capabilities — those belong in another phase. The live projector pass is the only valid acceptance test.

</domain>

<decisions>
## Implementation Decisions

### Automated vs. manual split
- **Two species of gate.** Deterministic/scriptable gates are automated; perceptual gates are human-only. Draw the line cleanly so the plan is buildable.
- **Full automated harness.** An agent drives all four pages, runs every scriptable gate (tsc, fetch-once per endpoint, GPU < 400MB, reduced-motion layout-unchanged, contrast checks, the boundary greps + `repo-map:check` ratchet), captures screenshots, and produces ONE pass/fail report. The owner reads results — does not run commands.
- **Perceptual checks are owner-run, live.** Brightness legibility, premium feel, clipped modals, horizontal overflow, "does it pop" — the owner runs these himself on the real secondary display at projector-reduced brightness. Nothing simulates a real room; this is the true acceptance condition. (No screenshot-only substitute.)
- **Equal depth across all four pages.** All four are demo-ready and get the full gate — the room test may click anywhere. No hero page; no reduced scrutiny on any page.

### Build / serve logistics
- **Separate port, live stays up.** Build the UAT copy once and serve it on an alternate port (e.g. :3100-style), so the live :3000 dashboard never goes down during testing. `npm run build` while :3000 is running freezes it ~8 min — avoid that during UAT.
- **Promote to :3000 only after sign-off** — the real deploy swaps in after the owner approves.

### Failure handling & blocker bar
- **Default response = fix inline, re-run to green.** Each finding is fixed and that gate re-run until green, all inside Phase 7. Close issues while context is hot — this is the last gate before the workshop.
- **Blocker bar (perceptual side) = only "broken in the room."** Blocks = invisible/illegible label, clipped modal, horizontal overflow, page error/crash, a drill that doesn't open. Cosmetic/polish nits ship as-is and get noted for later (do not hold the phase).
- **Engineering gates = absolute.** tsc-0, fetch-once, GPU < 400MB, reduced-motion, and the boundary greps must ALL pass — non-negotiable for sign-off. They are objective, cheap to keep green, and protect the live demo (a runaway fetch or GPU leak can stutter the room).
- **Combined sign-off rule:** every engineering gate green AND no room-breaking perceptual issue remaining. Cosmetic nits may remain (noted).

### Definition of done
- **Owner's explicit projector sign-off.** Phase 7 is DONE when the automated report is all-green AND the owner says "approved on the projector" after the live pass, with every blocker cleared. The owner is the final acceptance authority; the green report alone is not sufficient.

### Claude's Discretion
- Harness tooling choice (extend the existing `npm run test:e2e` suite on :3100 vs. a fresh production-mode UAT run vs. driving a real browser via Chrome DevTools for GPU/brightness captures) — pick the most reliable; report what was used.
- Screenshot capture mechanism, report file format/location, and how the per-page gate checklist is structured.
- The exact drill-down smoke sequence per page (role/activity donut → people, folder terrain expand, coordination panel, table row → panel), as long as every drill listed in Success Criteria #2 is exercised.
- How "noted for later" cosmetic nits are recorded (defect list, deferred-ideas section, follow-up phase stub).

</decisions>

<specifics>
## Specific Ideas

- Test matrix is already locked by the roadmap: **1280px**, **secondary display**, **projector-reduced brightness**, **both light and dark (zinc) themes**.
- Timing is imminent — Phases 5 and 6 both completed 2026-06-19; this is the "pre-workshop" gate, so the workshop is near. Favor a fast, decisive UAT loop over exhaustive ceremony.
- Deploy reality: the dashboard runs on the owner's PC via Task Scheduler at logon, served from the current checkout's `.next` build on :3000. "Deploy" = `npm run build` + restart (NOT a git deploy-branch merge). The whole working tree ships on rebuild — so the UAT must validate the real built output, not just dev mode.
- Known hazard to respect in the plan: do not `npm run build` while :3000 is live (it 500s the running app for ~8 min) — hence the separate-port decision.

</specifics>

<deferred>
## Deferred Ideas

- None raised during discussion — both selected areas (automated/manual split, failure handling) stayed within the UAT verification scope.
- Note: cosmetic/polish nits surfaced *during* UAT are not deferred ideas in the roadmap sense — they are logged within Phase 7 per the blocker-bar decision and either fixed inline or noted as ship-with-followup.

</deferred>

---

*Phase: 07-pre-workshop-uat*
*Context gathered: 2026-06-19*
