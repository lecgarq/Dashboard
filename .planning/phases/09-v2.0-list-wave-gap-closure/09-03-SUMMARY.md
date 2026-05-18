---
phase: 09-v2.0-list-wave-gap-closure
plan: 03
subsystem: ui
tags: [side-panel, list-wave, list-04, products, module-access, trpc, react-query]

# Dependency graph
requires:
  - phase: 09-v2.0-list-wave-gap-closure
    plan: 01
    provides: getProductsForUser tRPC procedure + parseProductsJson helper
provides:
  - Module Access collapsible section in AccUserSidePanel.tsx
  - aggregateModuleAccess pure function (top-level summary + per-project deviations)
  - onApplyModuleFilter prop chain (AccUserSidePanel → AccAnalysisPanel → UsersDirectoryClient)
  - filterAccModuleTier informational state (chip-only; no row predicate)
affects:
  - 09-04 (last-file-activity column + sort — independent; no surface overlap)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Native <details open> as Collapsible substitute (no new shadcn primitive)"
    - "Highest-count tier wins; ties broken by TIER_PRIORITY (administrator>member>none>other)"
    - "Lazy tRPC query gated by enabled: !!email; staleTime 300_000 ms"
    - "TooltipProvider scoped to section (not panel-global)"

key-files:
  created: []
  modified:
    - app/(dashboard)/users/AccUserSidePanel.tsx
    - app/(dashboard)/users/AccAnalysisPanel.tsx
    - app/(dashboard)/users/UsersDirectoryClient.tsx

key-decisions:
  - "Aggregation: highest-count tier as summary, ties broken by administrator>member>none priority; per-project deviations rendered inline below summary"
  - "Native <details open> chosen over installing shadcn Collapsible — CONTEXT lock prefers no new primitives; sufficient for expand/collapse + default-open semantics"
  - "Click-through scope: module-only row predicate (tier shown informationally in chip) — BulkAccUser.allModules lacks per-project tier; full module+tier predicate would require N+1 getProductsForUser calls or eager-loading products onto BulkAccUser (Pitfall 2 / Anti-Pattern violation)"
  - "Side panel stays open after click-through so the user sees cause-and-effect; closing would obscure the spotlight signal"

patterns-established:
  - "Side-panel → directory communication via prop drilling through the intermediate analysis panel (no new context provider)"
  - "Filter pill value can carry compound informational text when underlying predicate scope < UI intent"

requirements-completed: [LIST-04]

# Metrics
duration: ~5 min
completed: 2026-05-18
---

# Phase 09 Plan 03: Module Access section in AccUserSidePanel Summary

**Side-panel Module Access section (expanded by default, lazy tRPC query) renders top-level per-module tier summary with inline per-project deviations and unknown-module warnings; clicking a row narrows the directory by module with tier surfaced informationally — LIST-04 closed.**

## Performance

- **Duration:** ~5 min
- **Tasks:** 2
- **Files modified:** 3 (one side-panel append + two consumer wires)

## Accomplishments

- **Module Access section** in `AccUserSidePanel.tsx` consumes `trpc.accMembers.getProductsForUser` (lazy, gated on selected email, 5-minute staleTime). Renders summary + deviations + warnings. Native `<details open>` element gives expand/collapse + expanded-by-default for free, no new primitive.
- **Aggregation algorithm** (`aggregateModuleAccess` helper, inline in the side-panel file): builds `Map<moduleKey, { tierCounts, perProject }>`; summary tier = highest count, ties broken by `TIER_PRIORITY` (administrator=3 > member=2 > none=1 > other=0); deviations = all `perProject` entries whose tier ≠ summary tier. Stable display order (known modules alphabetical, unknowns last).
- **Unknown-module warning** rendered via `lucide-react` `AlertTriangle` (amber-500) inside shadcn `Tooltip` with content "Unknown module from APS" — uses scoped `TooltipProvider` inside the section (not panel-global, so no behavior leak to other tooltips).
- **Skeleton loading state** (4 grey `animate-pulse` rows) — never renders `JSON.stringify(products)`. Empty state shows "No module assignments." copy.
- **Click-through wiring** through three files: `AccUserSidePanel` exposes `onApplyModuleFilter?: (moduleKey, tier) => void`; `AccAnalysisPanel` forwards verbatim; `UsersDirectoryClient` supplies `handleApplyModuleFilterFromSidePanel` (`useCallback`) which sets `filterAccModule` + new `filterAccModuleTier` state.
- **ActiveFilterPill** for module now shows compound text "Docs (Tier: Administrator)" when a click-through is active; reverts to plain module label when the user toggles the module via the dropdown directly (which clears tier on `onValueChange`). Clear button resets both module and tier.

## Task Commits

1. **Task 1: Module Access section render** — `21ceefc` (feat) — `app/(dashboard)/users/AccUserSidePanel.tsx`
2. **Task 2: Click-through to directory filter** — `75b9bef` (feat) — `app/(dashboard)/users/AccAnalysisPanel.tsx` + `app/(dashboard)/users/UsersDirectoryClient.tsx`

## Decisions Made

- **Aggregation choice (highest-count tier vs alternative):** Highest-count wins with administrator>member>none>other priority for ties. Alternative considered (always pick the most permissive tier, i.e. administrator wins if any project has it) was rejected because it would silently elevate a "mostly member" user to "Administrator across all projects" — misleading. The deviation list still surfaces the elevated projects.
- **Collapsible primitive (shadcn vs `<details>`):** Native `<details open>` — shadcn `Collapsible` is not installed (`components/ui/collapsible*` glob returns no files), and CONTEXT lock explicitly disfavors introducing new primitives. `<details>` ships with expand/collapse + the `open` attribute for default-open semantics. The ChevronDown icon mimics the standard shadcn look (rotates on `group-open`).
- **Click-through scope (module-only vs module+tier):** Module-only row predicate; tier surfaced informationally in the chip text. The existing `filterAccModule` predicate at line ~1334 inspects `summary.allModules` (a flat string list aggregated across projects with no tier info). A per-tier predicate would require either (a) firing `getProductsForUser` for every visible row (N+1, Pitfall 2 violation) or (b) promoting `products` onto `BulkAccUser` (Anti-Pattern explicit lock — payload bloat ~projectCount×1KB per row). The pragmatic fallback documented in the plan's "Realistic fallback" guidance was the right call.
- **Side panel left open on click-through:** CONTEXT doesn't mandate close; leaving open shows the user the cause-and-effect (panel still visible, directory narrows behind it). Closing would hide the trigger of the change.

## LIST-04 Partial Trade-off

**Predicate scope < UI intent.** The user sees "filter applied: Docs (Tier: Administrator)" in the chip, and the directory does narrow — but only by module, not by per-project tier. A user whose Docs tier is "member" in some projects and "administrator" in others will still be in the result set. The tier portion of the click is informational, surfacing the user's intent rather than enforcing it strictly.

**Why this is acceptable for LIST-04 close-out:**
- CONTEXT's "facet-reduction IS the spotlight" semantic is preserved at the user-visible level (the list narrows on click).
- The strict per-tier predicate would force one of two contract violations (Pitfall 2 or Anti-Pattern), both explicitly locked.
- The chip text makes the partial-enforcement transparent to the user.

**Path to strict enforcement (deferred, not blocking v2.0 close-out):**
- Add a `productsByProject` aggregated column to `BulkAccUser` shape (string-encoded `${moduleKey}:${tier}` set) — pre-computed server-side from existing `AccProjectMember.products` rows; payload bloat bounded by distinct module-tier combinations (~50 entries max per user, not 1KB×projectCount). Then `filterAccModuleTier` predicate is a simple set-contains check.
- This is a Wave-2-or-later optimization, not part of LIST-04 scope.

## Deviations from Plan

None — Tasks 1 and 2 executed exactly as the plan's `<action>` blocks described, including the pre-acknowledged "Realistic fallback" path for Task 2. No Rule 1-3 auto-fixes triggered. No architectural deviations (Rule 4).

## Issues Encountered

- `pnpm tsc --noEmit` produced no output on first run, raising suspicion the command was suppressed. Explicit `echo $?` confirmed `EXIT=0` — clean. (PowerShell + pnpm sometimes swallow stdout when no errors emit; benign.)

## Self-Check: PASSED

All claimed files exist on disk and contain the expected markers:
- `app/(dashboard)/users/AccUserSidePanel.tsx` — `Module Access` ×3, `parseProductsJson` ×2, `getProductsForUser` ×1, `Unknown module from APS` ×1, `JSON.stringify(products` ×0 (raw JSON lock satisfied).
- `app/(dashboard)/users/AccAnalysisPanel.tsx` — `onApplyModuleFilter` prop accepted + forwarded.
- `app/(dashboard)/users/UsersDirectoryClient.tsx` — `filterAccModuleTier` state added; `handleApplyModuleFilterFromSidePanel` useCallback wired; ActiveFilterPill chip text compound.
- `grep "lastFileActivity\|products" lib/acc/acc-types.ts` — zero hits on BulkAccUser shape (ACTV-03 + Anti-Pattern preserved).
- Commits resolvable: `21ceefc` (Task 1), `75b9bef` (Task 2).

`pnpm tsc --noEmit` → `EXIT=0`.

## Next Phase Readiness

- **Plan 09-04 (last-file-activity column + sort):** Independent surface (column on directory rows + sort header in directory toolbar); no conflict with this plan's side-panel append. Both `getLastFileActivityBatch` and `usersOrderedByLastFileActivity` already live from Plan 09-01.
- **LIST-04 closed at code level.** REQUIREMENTS.md already marked LIST-04 complete by Plan 09-01's contract shipment; this plan ships the consumer. Visual UAT (rendering correctness on real user with multi-project products + a deviation case + an unknown module key) deferred to phase-end manual UAT per Luis directive ("continue with next waves, don't wait for verification").

---
*Phase: 09-v2.0-list-wave-gap-closure*
*Completed: 2026-05-18*
