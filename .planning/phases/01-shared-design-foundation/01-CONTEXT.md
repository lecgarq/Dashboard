# Phase 1: Shared Design Foundation - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

A single shared design language exists — depth/glow/glass design tokens, a `PremiumSurface` card primitive, a theme-aware `EChart` wrapper, a `motion` facade, and one slide-in `Sheet` shell — authored once so every per-page phase imports it instead of reinventing styling.

This discussion clarifies the **personality** of that foundation (the taste calls the research left open). The engineering is already specified in `.planning/research/STACK.md` + `.planning/research/ARCHITECTURE.md` and is not re-litigated here. The `Sheet` is built as an empty shell only — drill *sources* are wired in the per-page phases. The R3F/3D facade contract lands here; actual 3D accents are placed on `/users` (Phase 4) and `/forma-proposal` (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Premium intensity (the master dial)
- **Balanced premium** — the sweet spot between subtle-refined and dramatic-showcase.
- Layered shadow + a top-edge catch-light so cards read as physical, floating objects.
- Frosted-glass panels (backdrop blur) as the default premium surface.
- Glow is applied **only** to selected / accent elements — never as a global wash.
- Goal: clearly premium and tactile on a projector, but calm enough for dense data surfaces (e.g. `/access-analysis`) without fatigue. Not flat (rejected subtle), not loud (rejected dramatic).

### Accent & glow color
- **Indigo → violet** (`#6366f1 → #8b5cf6`) — the research default and the established direction in the existing glow tokens and chart palette.
- This is the color for the premium glow + the selected/active highlight only. Charts keep their full multi-color palettes; this does not recolor data series.
- Authored once in the token layer; inherited by all four pages.

### Motion personality
- **Smooth & flowing** — eased fade-up + gentle stagger, ~0.3–0.4s, soft ease-out curve (the "expensive product" feel).
- Stays under the hard <400ms total entrance budget; fires once per load (mount/drill only, never on filter change).
- Rejected snappy/spring (less luxurious) and minimal (under-delivers the workshop "wow").
- Must zero out under `prefers-reduced-motion` (content still appears, just instantly).

### Theme priority
- **Both equal** — light and dark are tuned in lockstep; there is no single primary target.
- Tokens, glass, glow, and the catch-light must each be dialed against both `:root` (light) and `.dark` (zinc) themes. Neither theme is allowed to lag.
- Planning implication: budget foundation work for full dual-theme tuning (no single-theme shortcut), and verify every token resolves correctly in both.

### Slide-in panel (the shared `Sheet` shell)
- Slides from the **right** edge (standard for detail/profile).
- Width **~480px (medium-wide)** — roomy enough for a profile with a couple of mini-charts + a list, while leaving the page visible behind it for context.
- This single shell is THE drill-target for every click source across all four pages (person profile, people-behind-a-chart-segment, role members). Built empty here; sources wired per-page later.

### Ambient background
- **Subtle global glow** — a very faint indigo/violet glow pooling in the page background (pure CSS, zero runtime cost), so the frosted glass has a real backdrop to blur against (this is what makes glassmorphism actually read).
- Must be **theme-aware** — faint enough that it never muddies light mode.

### Catch-light strength
- **Subtle sheen** — a soft, low-opacity top-edge highlight. Reads "premium and physical" without looking glossy or skeuomorphic. Consistent with the balanced-premium dial (rejected the crisp glossy edge as too close to "dramatic").

### Claude's Discretion
- Corner roundness of surfaces / panels / Sheet (use the existing app convention, e.g. `rounded-xl`, unless a reason to change emerges).
- The default `PremiumSurface` variant when a caller doesn't specify one.
- Skeleton / loading-state shimmer styling.
- Exact token alpha values, blur radii, shadow offsets, and easing bezier coefficients (within the "balanced premium" + "smooth & flowing" character above).
- Sheet open/close animation specifics (shadcn `Sheet` default animation is acceptable).

</decisions>

<specifics>
## Specific Ideas

- The whole point of the foundation is "author once, inherit everywhere" — every taste decision above is a single-source-of-truth choice that all four pages (`/users`, `/access-analysis`, `/template-mty`, `/forma-proposal`) pull from. Avoid per-page divergence.
- Frame of reference for "balanced premium": clearly more dimensional than Linear/Vercel restraint, but stopping well short of heavy-glass / vivid-glow drama. Glass + soft glow + catch-light, calm surfaces.
- The accent glow and selected-segment highlight should feel like the same indigo→violet "family" everywhere it appears (chart selection, active filter pill, focused card) — visual cohesion is a feature.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 1's foundation scope. (Corner roundness, default-variant choice, and skeleton shimmer were raised but left to Claude's discretion within this phase, not pushed to a later phase.)

</deferred>

---

*Phase: 01-shared-design-foundation*
*Context gathered: 2026-06-17*
