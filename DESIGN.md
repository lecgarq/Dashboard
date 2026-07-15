# LECG Dashboard Design System

> Category: Operational Dashboard
> Zinc-dark BIM/VDC operations dashboard with the LECG brand categorical palette.

Source of truth: `app/globals.css` (CSS variables), `lib/colors/echartsTheme.ts`
(chart categorical), `app/layout.tsx` (fonts). If this file and the app source
disagree, the app source wins.

## 1. Visual Theme & Atmosphere

A polished operational tool, not a marketing site. Dense, scannable surfaces
with restrained depth: thin borders, subtle glass layers, purposeful hierarchy.
Dark mode is the default presentation (live workshops on projectors); light
mode is fully supported. The dark theme is **zinc** — near-black neutral
`#09090B` with no blue cast. Data is the hero; chrome recedes.

## 2. Color

All values are real, shipped tokens. Brand categorical colors are
CVD-validated with a 3:1 contrast floor against their surface
(`#FFFFFF` light, `#18181B` dark).

```css
:root {
  /* Surfaces */
  --background: #F4F7FB;
  --card: #FFFFFF;
  --border: #E5E7EB;

  /* Brand primary — LECG azul */
  --primary: #254467;
  --ring: #254467;

  /* Charts — LECG brand categorical (light-on-white) */
  --chart-1: #2E5F95; /* azul oscuro */
  --chart-2: #E65A28; /* naranja (brand exact) */
  --chart-3: #0089A3; /* seaweed */
  --chart-4: #B0810A; /* goldenrod (darkened for contrast) */
  --chart-5: #7E3567; /* wine */
  /* Extended categorical (charts with >5 series) */
  --chart-6: #68803A; /* palm */
  --chart-7: #1B80B3; /* sky */
  --chart-8: #C42021; /* warm red (brand exact) */

  /* Semantic status */
  --success: #0E8A6D;
  --warning: #B0810A;
  --info: #2E5F95;
  --destructive: #C42021;
}

[data-theme="dark"] {
  /* Surfaces — zinc, never slate */
  --background: #09090B;
  --card: #18181B;
  --popover: #0F0F11;
  --border: #27272A;
  --muted-foreground: #A1A1AA;
  --foreground: #FAFAFA;

  /* Brand primary — azul lightened one step for dark contrast */
  --primary: #4E8CCB;
  --ring: #4E8CCB;

  /* Charts — same families, lightness-shifted for dark-on-zinc */
  --chart-1: #4E8CCB; /* azul */
  --chart-2: #E2683A; /* naranja */
  --chart-3: #0E98A8; /* seaweed */
  --chart-4: #BA8A0E; /* goldenrod */
  --chart-5: #B4679C; /* wine */
  --chart-6: #849C4C; /* palm */
  --chart-7: #3A9DBF; /* sky */
  --chart-8: #E05B55; /* warm red */

  --destructive: #E05B55;
}
```

Rules: never invent new hues — pick from the eight brand families. Dark and
light variants of a family are the *same series* in a chart; do not mix a
light-variant hex onto a dark surface. Status colors are reserved for status,
never decoration.

## 3. Typography

Font labels for catalog extraction: Display, Body, Mono with full font stacks.

- **Display**: `"Space Grotesk", Manrope, sans-serif` — page titles, stat
  values, section headings.
- **Body**: `Manrope, "Geist Sans", system-ui, sans-serif` — everything else.
- **Mono**: `"Geist Mono", ui-monospace, monospace` — IDs, counts, code.

Dense dashboard scale: body 13–14px, table cells 12–13px, axis/legend labels
11–12px (floor 11px), stat values 24–32px. Weight does hierarchy work before
size does: 600 for headings, 500 for labels, 400 for body.

## 4. Spacing

Tailwind 4px base unit. Dashboard density defaults:

- Panel padding: 16px (`p-4`); page gutters 24px (`p-6`).
- Grid gap between panels: 16px.
- Vertical rhythm inside a panel: 8–12px between related rows.
- Tables: 8px cell padding vertical, 12px horizontal.

Compact beats airy: if a screen scrolls to show what a denser layout could
show at once, densify.

## 5. Layout & Composition

- Sidebar navigation + full-height content. Page roots own scroll
  (`h-full overflow-y-auto`); the body never scrolls.
- Panels compose in a responsive CSS grid; charts and tables live inside
  panels, one concern per panel.
- Drill-downs open in sheets/panels above the triggering context, not new
  pages, so workshop narration keeps its place.
- Desktop-first (presented on large screens) but must not break at tablet
  widths.

## 6. Components

Reuse the shipped primitives before inventing: `PremiumSurface` (glass panel),
`DrillSheet`, `DataTable`, `EChart` wrapper, shadcn/Radix inputs.

```css
.panel {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.button-primary {
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: 8px;
  height: 36px;
  padding: 0 14px;
}
:is(button, a, input, select, [tabindex]):focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
```

Charts (ECharts) must resolve colors from the active theme tokens — never
hardcoded hex in options. Every chart ships its empty state, and under-covered
data sources get a visible label, not omission.

## 7. Motion & Interaction

- Motion budget: **≤200ms** for drill interactions, hover reveals, and sheet
  transitions. Easing `ease-out`; no bounces.
- Honor `prefers-reduced-motion`: reduce to opacity-only or none.
- Hover states change surface or border tone, not size (no layout shift).
- Skeletons for loading over spinners; no fake loading states.

## 8. Voice & Brand

LECG is a BIM/VDC operations team. Voice is concise, technical, truthful.
Use the domain's own words — ACC, Forma, LOD, Model Coordination, clash,
folder tiers — not generic SaaS vocabulary. Analytics must show their source
and limitations honestly: an under-covered metric is labeled as such, never
visually hidden. Numbers are the message; adjectives are not.

## 9. Anti-patterns

- No slate or blue-cast dark theme. Dark neutrals are zinc (`#09090B`,
  `#18181B`, `#27272A`) only.
- No marketing heroes, decorative gradients, or feature-card grids.
- No card-inside-card nesting; one panel level per region.
- No border radius above 12px on panels, 8px on controls.
- No motion longer than 200ms; no autoplaying or looping animation.
- No hardcoded chart hex; colors resolve from theme tokens.
- No WebGL/3D on data surfaces (R3F accents are confined to approved spots).
- No hidden data caveats: never present partial-coverage data as complete.
