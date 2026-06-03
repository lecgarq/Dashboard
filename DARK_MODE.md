# Dark Mode — Audit, Token System & Conventions

**Status:** Foundation document, written 2026-05-19. Audit phase complete; refactor not yet started.
**Owner:** Luis (UI lead)
**Palette decision:** Neutral slate (cool). `bg #0B1220` / `card #111827` / `text #E5E7EB`. Accent blue stays.
**Toggle location:** Header top-right (sun/moon/system dropdown).
**Persistence:** `next-themes` v0.4.6 (already installed), `attribute="class"`, `defaultTheme="system"`, `enableSystem`.

---

## 0. TL;DR

The dashboard is **light-only today** but was scaffolded for theming: `next-themes` is installed, `<html suppressHydrationWarning>` is set, and `components/theme/` exists as an empty folder. We are *completing* an unfinished implementation, not retrofitting from scratch.

The work splits into four buckets, in order of severity:

1. **CSS foundation (`globals.css`)** — `:root` defines light-only vars, plus ~15 `.surface-*` / `.glass-card` / scrollbar / shimmer / caret rules with hardcoded white rgba. **All must be tokenized first** — every component downstream depends on them.
2. **Color-coded config maps** — six map-shaped dictionaries hardcoded to light colors that no Tailwind variant can reach (see §3). These ship runtime classnames as strings; they need parallel dark maps or a `useThemeColors()` adapter.
3. **Tailwind class sweep** — `bg-white`, `text-slate-950`, `border-slate-200/80`, `bg-gray-50`, `text-gray-500` are scattered across ~80 files. Mostly mechanical replace with semantic tokens or paired `dark:` variants.
4. **Special components** — canvas/WebGL/SVG/iframe widgets that can't read CSS vars: Cosmos graph, LOD graph, vgplot histograms, ChatPanel iframes, MailPanel iframes, Tiptap editor, Autodesk Forge viewer. Each needs theme passed as a prop or injected stylesheet.

---

## 1. The token system

### 1.1 Light values (current — keep)

Already defined in `app/globals.css :root`. Don't change these.

| Token | Light value |
|---|---|
| `--background` | `#F4F7FB` |
| `--foreground` | `#111827` |
| `--card` | `#FFFFFF` |
| `--card-foreground` | `#111827` |
| `--popover` | `#FFFFFF` |
| `--popover-foreground` | `#111827` |
| `--primary` | `#14213D` |
| `--primary-foreground` | `#FFFFFF` |
| `--secondary` | `#F3F4F6` |
| `--secondary-foreground` | `#1F2937` |
| `--muted` | `#F3F4F6` |
| `--muted-foreground` | `#6B7280` |
| `--accent` | `#EEF3F9` |
| `--accent-foreground` | `#1F2937` |
| `--destructive` | `#EF4444` |
| `--border` | `#E5E7EB` |
| `--input` | `#E5E7EB` |
| `--ring` | `#1D3557` |
| `--chart-1..5` | `#2563EB / #0F766E / #D97706 / #7C3AED / #EA580C` |
| `--sidebar` | `#FFFFFF` |
| `--sidebar-foreground` | `#374151` |
| `--sidebar-primary` | `#14213D` |
| `--sidebar-accent` | `#EEF3F9` |
| `--sidebar-border` | `#E5E7EB` |

### 1.2 Dark values (new — add as `.dark { … }`)

Cool neutral slate, matching Luis's choice. Use `attribute="class"` so `next-themes` adds `class="dark"` to `<html>`.

| Token | Dark value | Rationale |
|---|---|---|
| `--background` | `#0B1220` | slate-950 floor, not pure black — keeps shadows readable |
| `--foreground` | `#E5E7EB` | slate-200, soft on eyes vs pure white |
| `--card` | `#111827` | slate-900, one step up from bg for elevation |
| `--card-foreground` | `#E5E7EB` | matches foreground |
| `--popover` | `#0F172A` | slightly cooler/darker than card to separate from background |
| `--popover-foreground` | `#E5E7EB` | |
| `--primary` | `#3B82F6` | brighter blue-500 (light's `#14213D` would disappear) |
| `--primary-foreground` | `#0B1220` | dark text on bright primary |
| `--secondary` | `#1F2937` | slate-800 |
| `--secondary-foreground` | `#E5E7EB` | |
| `--muted` | `#1F2937` | matches secondary; muted surfaces |
| `--muted-foreground` | `#94A3B8` | slate-400 |
| `--accent` | `#1E293B` | slate-800 cool, slightly bluer than muted |
| `--accent-foreground` | `#E5E7EB` | |
| `--destructive` | `#F87171` | red-400 — brighter for contrast on dark |
| `--border` | `#1F2937` | slate-800; visible but not loud |
| `--input` | `#1F2937` | same |
| `--ring` | `#3B82F6` | bright primary for focus visibility |
| `--chart-1` | `#60A5FA` | blue-400 |
| `--chart-2` | `#34D399` | emerald-400 |
| `--chart-3` | `#FBBF24` | amber-400 |
| `--chart-4` | `#A78BFA` | violet-400 |
| `--chart-5` | `#FB923C` | orange-400 |
| `--sidebar` | `#0F172A` | matches popover for visual cohesion |
| `--sidebar-foreground` | `#CBD5E1` | slate-300 |
| `--sidebar-primary` | `#3B82F6` | |
| `--sidebar-primary-foreground` | `#0B1220` | |
| `--sidebar-accent` | `#1E293B` | |
| `--sidebar-accent-foreground` | `#E5E7EB` | |
| `--sidebar-border` | `#1F2937` | |
| `--sidebar-ring` | `#3B82F6` | |

### 1.3 New tokens to add (light + dark)

These don't exist yet but the audit revealed we need them. They cover patterns currently hardcoded.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--surface-1` | `rgba(255,255,255,0.96)` | `rgba(17,24,39,0.92)` | `.ui-paper`, `.surface-card` body |
| `--surface-2` | `rgba(255,255,255,0.78)` | `rgba(17,24,39,0.72)` | `.surface-panel`, secondary glass |
| `--surface-3` | `rgba(255,255,255,0.72)` | `rgba(15,23,42,0.62)` | `.surface-chip` |
| `--surface-border` | `rgba(226,232,240,0.86)` | `rgba(51,65,85,0.6)` | borders on glass surfaces |
| `--shadow-elevated` | `0 24px 70px -34px rgba(15,23,42,0.34)` | `0 24px 70px -28px rgba(0,0,0,0.7)` | card shadow |
| `--grid-line` | `rgba(148,163,184,0.08)` | `rgba(148,163,184,0.06)` | `body::before` grid |
| `--scrollbar-thumb` | `rgba(0,0,0,0.1)` | `rgba(255,255,255,0.15)` | scrollbar |
| `--scrollbar-thumb-hover` | `rgba(0,0,0,0.18)` | `rgba(255,255,255,0.25)` | |
| `--success` | `#059669` | `#34D399` | semantic status (currently scattered as emerald-*) |
| `--success-bg` | `#D1FAE5` | `rgba(52,211,153,0.12)` | success badge surface |
| `--warning` | `#D97706` | `#FBBF24` | amber-* warnings |
| `--warning-bg` | `#FEF3C7` | `rgba(251,191,36,0.12)` | |
| `--info` | `#2563EB` | `#60A5FA` | sky/blue info |
| `--info-bg` | `#DBEAFE` | `rgba(96,165,250,0.12)` | |
| `--danger-bg` | `#FEE2E2` | `rgba(248,113,113,0.12)` | destructive badge surface |

### 1.4 Page background (special — replaces `body { background-image: … }`)

Currently the body has hardcoded radial gradients (`rgba(37,99,235,0.10)`, `rgba(251,146,60,0.12)`, `#fbfdff → #f3f7fb`). Replace with two CSS variables that swap in dark:

```css
:root {
  --page-bg:
    radial-gradient(circle at top left, rgba(37,99,235,0.10), transparent 32%),
    radial-gradient(circle at 85% 15%, rgba(251,146,60,0.12), transparent 28%),
    radial-gradient(circle at 80% 100%, rgba(15,118,110,0.08), transparent 24%),
    linear-gradient(180deg, #fbfdff 0%, #f3f7fb 100%);
}
.dark {
  --page-bg:
    radial-gradient(circle at top left, rgba(59,130,246,0.10), transparent 32%),
    radial-gradient(circle at 85% 15%, rgba(251,146,60,0.06), transparent 28%),
    radial-gradient(circle at 80% 100%, rgba(15,118,110,0.06), transparent 24%),
    linear-gradient(180deg, #0B1220 0%, #0A0F1C 100%);
}
body { background-image: var(--page-bg); }
```

---

## 2. Conventions — for every component from now on

**The rule:** if a color leaves the design system, you must justify it. Default to tokens.

### 2.1 Allowed in any new component

| Class | Use for |
|---|---|
| `bg-background` / `text-foreground` | Page-level surface + text |
| `bg-card` / `text-card-foreground` | Elevated tile |
| `bg-popover` / `text-popover-foreground` | Floating menu, tooltip |
| `bg-muted` / `text-muted-foreground` | Subtle/disabled surface, secondary text |
| `bg-secondary` / `text-secondary-foreground` | Soft chip / tag |
| `bg-accent` / `text-accent-foreground` | Hover state on neutral controls |
| `bg-primary` / `text-primary-foreground` | Brand surface |
| `bg-destructive` / `text-destructive-foreground` | Errors, dangerous actions |
| `border-border`, `border-input`, `ring-ring` | All borders and focus rings |
| `bg-chart-1..5` / `text-chart-1..5` | Data viz |
| `bg-sidebar*` family | Sidebar only |

### 2.2 Forbidden in new components (will be removed in cleanup)

- `bg-white`, `bg-black`, `bg-gray-*`, `bg-slate-*`, `bg-zinc-*` as surface colors
- `text-gray-*`, `text-slate-*`, `text-black`, `text-white` (except white text on a brand gradient where contrast is guaranteed both modes)
- `border-gray-*`, `border-slate-*`, `border-white/*`
- Hex literals in `style={{ color, backgroundColor, borderColor }}` — pass the token via `var(--name)` if you must inline
- SVG `fill="#..."` / `stroke="#..."` — use `fill="currentColor"` and color the parent via Tailwind text utility
- `rgba(255,255,255,*)` or `rgba(0,0,0,*)` in CSS — use a token instead

### 2.3 When you genuinely need a color the system doesn't have

Two acceptable patterns:

**A. Add a token (preferred)**
- Add to `:root { --my-new-color: … }` AND `.dark { --my-new-color: … }` in `globals.css`.
- Map it in `@theme inline` so Tailwind exposes a class.
- Use the class everywhere.

**B. Tailwind `dark:` variant (only for one-off, one-component cases)**
```tsx
<div className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
```
Always provide BOTH light AND dark in the same line. Never write `bg-emerald-50` alone.

### 2.4 Pre-commit checklist for any new component

- [ ] No raw `bg-white`, `bg-black`, `bg-gray-*`, `bg-slate-*`, `text-gray-*`, `text-slate-*` (use tokens or `dark:` pair)
- [ ] No hex literals in inline styles (use CSS var)
- [ ] No `fill="#..."` / `stroke="#..."` in inline SVG (use `currentColor`)
- [ ] If a config map ships colors as strings (`{ status: "bg-red-500/10 text-red-500" }`), it pairs every entry: `"bg-red-500/10 dark:bg-red-950/30 text-red-500 dark:text-red-400"`
- [ ] Tested visually in both light + dark before PR (just toggle the header switch)
- [ ] If using a canvas, WebGL, SVG renderer, or `<iframe srcDoc>`: confirmed the component accepts theme as a prop (don't read CSS vars from canvas — they don't propagate)

### 2.5 Component-specific rules

- **Iframes (`srcDoc`)** must inject their own dark stylesheet. Read theme from `useTheme()` and rebuild srcDoc on theme change.
- **Cosmos / Cosmograph** — pass `nodeColor`, `linkColor`, `backgroundColor` from a theme-aware palette object. Don't hardcode `#9CA3AF`.
- **Observable Plot / vgplot** — wrap with `style={{ color: 'var(--foreground)' }}` so SVG `currentColor` flips; pass explicit `stroke` for axes.
- **Tiptap / ProseMirror editor** — use the `.dark .ProseMirror` selector pattern. The class `prose-invert` should be applied conditionally with `useTheme()`.
- **Autodesk Forge viewer** — set viewer background via `viewer.setLightPreset()` or `viewer.setBackgroundColor(r,g,b, r,g,b)` on theme change.
- **Avatar color generators** (hash → hsl) — clamp lightness band by theme (e.g., light = 45–60%, dark = 55–70%).

---

## 3. Audit inventory — what breaks today

Six parallel agents swept the codebase. Below is the consolidated picture, organized by severity.

### 3.1 CRITICAL — must fix before toggle ships

| # | Location | Issue |
|---|---|---|
| C1 | `app/globals.css` lines 63–109 | `:root` defines light-only vars; no `.dark` block exists. **All downstream tokens trace back here.** |
| C2 | `app/globals.css` lines 280–367 | `.ui-paper`, `.glass-card`, `.surface-card`, `.surface-panel`, `.surface-chip` use hardcoded `rgba(255,255,255,…)` and `rgba(226,232,240,…)`. |
| C3 | `app/globals.css` lines 121–127 | Body `background-image` hardcoded `#fbfdff → #f3f7fb` + three light radial gradients. |
| C4 | `app/globals.css` lines 413–418 | Scrollbar thumb `rgba(0,0,0,0.1)` — invisible in dark. |
| C5 | `app/globals.css` lines 441–465 | Tiptap collaboration carets hardcoded `#0D0D0D` border + `#fff` label. |
| C6 | `components/lod/LodGraphCanvas.tsx` lines 29–35, 277, 398, 592, 616, 627, 649 | Canvas background `#F8F7F4`, stroke `#222`, tooltip/menu `bg-white`. 25 hardcoded category hex colors. **Canvas cannot read CSS vars** — must accept theme prop. |
| C7 | `components/lod/LodTrainingPanel.tsx` lines 88–196 | Entire component hardcoded to slate-900/text-white. **Already broken in light mode** — dark mode will reveal the bug. Needs full token rewrite. |
| C8 | `components/dashboard/ChatPanel.tsx` lines 209–219 | `<iframe srcDoc>` inline CSS hardcoded `#fff` bg + `#1f2937` text. Iframe doesn't inherit parent theme. Must inject `@media (prefers-color-scheme: dark)` into srcDoc. |
| C9 | `components/dashboard/MailPanel.tsx` lines 198–222 | Same iframe srcDoc issue — email bodies unreadable in dark. |
| C10 | `components/dashboard/GlobalSearch.tsx` line 66 | `bg-[#0a0a0a]/80` — Ctrl+K modal is already dark; will disappear into dark background. **Inverted logic** — needs flip. |
| C11 | `components/ui/ParticleBackground.tsx` lines 114, 124 | Canvas particles hardcoded `rgba(15,23,42,…)`. Needs theme-aware fill via prop. |
| C12 | `app/(dashboard)/layout.tsx` lines 51–53 | Decorative blob overlays `bg-sky-200/30 bg-amber-200/35 bg-teal-200/25` — invisible/wrong on dark. |
| C13 | `services/.../graphRenderers.ts` line 12, 199 | Cosmos `DIMMED_USER_COLOR = "#9CA3AF"`, edge stroke `"#9CA3AF"` hardcoded. |
| C14 | `services/.../cosmosUtils.ts` line 30 | Fallback gray RGB `[0.612, 0.639, 0.686]` hardcoded. |

### 3.2 HIGH — config maps (shipped as strings, can't use `dark:` variants)

These are the most insidious problems because they bypass Tailwind's variant system entirely. Each needs either a dark-mode parallel map OR refactor to a function that takes theme as input.

| # | Location | Map name |
|---|---|---|
| H1 | `lib/shared/family-config.ts` lines 6–31 | `FAMILY_PHASE_METADATA` — 4 phases (TODO/IN_PROGRESS/REVIEW/DONE), each with `color`, `badgeBg`, `cardBg`, `cardText` |
| H2 | `components/sync-center/SyncCenterStatusPanel.tsx` lines 60–66 | `STATUS_CLASS` — 6 statuses (idle/running/paused/failed/complete/quota-paused) |
| H3 | `components/modules/ModuleDocumentationPage.tsx` lines 65–68 | `STATUS_CONFIG` — 3 doc statuses (DRAFT/REVIEW/APPROVED) |
| H4 | `app/(dashboard)/tasks/page.tsx` lines 43–69 | `STATUS_CONFIG` + `PRIORITY_CONFIG` (uses chart tokens — verify dark contrast) |
| H5 | `app/(dashboard)/settings/users/page.tsx` lines 47–49 | `ROLE_CONFIG` — 3 roles, hardcoded `text-red-500`, `text-blue-500`, etc. |
| H6 | `components/trello/KanbanBoard.tsx` lines 67–80 + **4 duplicates** in `CardDialog.tsx`, `TrelloBoardView.tsx`, `TableView.tsx`, `TimelineView.tsx`, `CalendarView.tsx` | `LABEL_COLORS` — 10 Trello brand hex colors. **DUPLICATED 5 TIMES** — first extract to `lib/colors/trello.ts`, then add dark-adaptation helper. |

### 3.3 MEDIUM — Tailwind class sweeps (mechanical)

The big surface-area work but mostly grep + replace once tokens are in. Files with the heaviest concentration:

| File | Approx. violations | Notes |
|---|---|---|
| `components/families/FamilyDetailPanel.tsx` | ~40 | Worst single file. 11 `text-gray-500` labels alone. Tiptap prose styles need `.dark .prose` selector. |
| `components/dashboard/ChatPanel.tsx` | ~15 light blue/white | Google Chat brand colors mixed with structural light surfaces. |
| `components/dashboard/MonthView.tsx` | ~12 | Calendar event pills, day cell tints. |
| `app/(auth)/login/page.tsx` | ~12 | Headings, labels, dividers, Google button card. |
| `components/auth/RegistrationForm.tsx` | ~10 | Same pattern as login. |
| `app/(dashboard)/settings/users/page.tsx` | ~14 | Badge colors, toggle thumb, sheet borders. |
| `components/clash/WikiEditor.tsx` + `wiki-editor/**` | ~8 + SCSS fallbacks | SCSS fallback values are light: `var(--border, #e2e8f0)`. |
| `components/families/KanbanBoard.tsx` | ~6 | Column bg, headers, count badges. |
| `components/families/BimViewer.tsx` | 3 | `bg-black/20`, `bg-black/40`, `bg-black/60` overlays — written assuming light canvas. |
| `components/layout/Header.tsx` | ~5 | `border-white/60 bg-white/72` + shadow. |
| `components/layout/Sidebar.tsx` | ~8 | `border-white/60`, `bg-black/40` hover. |
| `components/layout/SyncFreshnessPill.tsx` | 4 | `bg-white/40 border-white/60`, hardcoded `bg-zinc-300`. |
| Auth pages (`forgot-password`, `reset-password`, `unauthorized`) | ~6 each | Same notice + heading pattern as login. |
| `components/auth/CredentialsBanner.tsx` | 1 partial | Has `dark:text-blue-400` but no dark bg — incomplete. |
| `components/auth/DualAuthGuard.tsx` | 2 | `bg-amber-500 text-amber-950` won't read in dark. |

### 3.4 SPECIAL components — need custom dark theme designs

| Component | Type | Strategy |
|---|---|---|
| Cosmos graph (sim-automation) | WebGL canvas | Pass theme palette as prop to renderer; rebuild on theme change |
| LOD graph canvas | 2D canvas | Same — read `--background` from computed style at draw time, OR pass prop |
| Observable Plot / vgplot (Distribution/Heatmap/Histogram panels) | SVG | Wrap container with `style={{ color: 'var(--foreground)' }}` so axes via `currentColor` flip; explicit `stroke` for grid lines |
| Tiptap WikiEditor | ContentEditable | `.dark .ProseMirror`, swap `prose-invert` conditionally, dark color swatches in `COLOR_PRESETS` |
| Email iframe (MailPanel) | iframe srcDoc | Inject CSS into srcDoc; rebuild on theme change |
| Chat message iframe (ChatPanel) | iframe srcDoc | Same |
| Autodesk Forge viewer (BimViewer) | Embedded viewer | `viewer.setBackgroundColor()` + `viewer.setLightPreset()` on theme change |
| `ParticleBackground` | 2D canvas | Read theme from `useTheme()`, pass alpha + color to particle config |
| Avatar color generator (if exists) | Hash → HSL | Clamp lightness band per theme |
| `AuthShell` mesh + gradient blobs | CSS background | `.auth-mesh` rule needs `.dark` variant; blob colors need dark twins |

### 3.5 Trello LABEL_COLORS — top-priority refactor

`LABEL_COLORS` (10 hex values for Trello's green/yellow/orange/red/purple/blue/sky/lime/pink/black labels) is **copy-pasted into 5 files**. Even before dark mode, this is a maintenance hazard. The dark-mode fix unlocks a long-overdue extraction:

1. New file: `lib/colors/trello.ts` exports `LABEL_COLORS_LIGHT` and `LABEL_COLORS_DARK`.
2. New hook: `useTrelloLabelColor(label: TrelloLabelKey)` reads `useTheme()` and returns the right value.
3. Refactor all 5 callsites (`KanbanBoard.tsx`, `CardDialog.tsx`, `TrelloBoardView.tsx`, `TableView.tsx`, `TimelineView.tsx`, `CalendarView.tsx`) to use the hook.
4. Brand-fidelity choice: dark variants are NOT desaturated Trello brand — they're the same hue with 30% reduced saturation + 15% raised lightness so they're readable on `#0B1220`.

---

## 4. Execution plan

Refactor order is dictated by dependency (lower layers first):

| Wave | Scope | Risk |
|---|---|---|
| **W1** | `globals.css` — add `.dark { … }` block with all tokens from §1.2 & §1.3; replace hardcoded `body` bg / `surface-*` / scrollbar / shimmer / caret rules with `var(--…)` references | Low — touches only CSS, no React; if it breaks, easy to revert |
| **W2** | `next-themes` provider in `app/layout.tsx`, build `components/theme/ThemeToggle.tsx`, mount in `Header.tsx` | Low — additive |
| **W3** | `components/ui/*` primitives — verify card, button, dialog, dropdown, input, select, table, tabs, etc. all use tokens (most already do) | Low — small files, well-tested |
| **W4** | Layout shell — `Header.tsx`, `Sidebar.tsx`, `SyncFreshnessPill.tsx`, `(dashboard)/layout.tsx`, `(auth)` shell + mesh background | Medium — visible on every page |
| **W5** | Auth pages (login, register, forgot, reset, unauthorized) + `RegistrationForm`, `CredentialsBanner`, `DualAuthGuard` | Low — isolated flow |
| **W6** | Extract `LABEL_COLORS` to `lib/colors/trello.ts`; refactor 5 Trello files to use hook | Medium — touches 5 files but mechanical |
| **W7** | Config-map dark twins: `FAMILY_PHASE_METADATA`, `STATUS_CLASS` (sync), `STATUS_CONFIG` (modules + tasks), `ROLE_CONFIG` (settings/users) | Medium — careful test each map |
| **W8** | Module-by-module sweep: clash → lod → exam → families → sync-center → tasks → trello → users → home → account → settings. Visual check each after refactor | High volume, low individual risk |
| **W9** | Special components: ParticleBackground, LodGraphCanvas (canvas theme prop), graphRenderers/cosmosUtils, vgplot panels (SVG currentColor), ChatPanel + MailPanel iframe srcDoc injection, Tiptap editor styles, Forge viewer (BimViewer) | High — each is a custom solution |
| **W10** | Visual QA: walk every page in light + dark + system. Fix stragglers. | The truth check |

**Stop and visually verify in browser at every wave.** Dark mode bugs hide in pixel-level contrast issues no test can catch.

---

## 5. Open questions to revisit before W9

These don't block W1–W8 but need a decision before the special components are themed:

1. **Cosmos graph dimmed-node color in dark mode** — currently `#9CA3AF` (gray-400) on light bg works; in dark, should it be a brighter gray (`#94A3B8` slate-400) or a darker one (`#475569` slate-600)? Test with real data.
2. ~~**Trello brand fidelity**~~ — **RESOLVED 2026-05-19:** desaturated variants for dark mode (Luis's call). Same 10 hues, reduced saturation + raised lightness so labels stay readable on slate-950. Slight brand drift accepted in exchange for legibility.
3. **Email body iframe** — if the inbound email already includes its own `prefers-color-scheme: dark` styles, do we honor them or always override? Recommend honoring user's OS preference if email provides it.
4. **Forge viewer** — does the Autodesk viewer SDK we use support `setLightPreset` for dark, or do we need to set background only? Check current `@autodesk/forge-viewer` version.
5. **Theme on mobile / standalone Electron app** — confirm `next-themes` storage key persists across the Electron wrapper.

---

## Appendix A — File-level inventory

Full per-file line-by-line breakdown lives in the six audit transcripts under `C:\Users\LUIS~1.COR\AppData\Local\Temp\claude\…` (consolidated here in §3). If you ever need the raw line numbers per file, the six audit reports were generated by parallel Explore agents on 2026-05-19.

## Appendix B — Why neutral slate, not true black

Pure `#000` on OLED looks great in marketing screenshots, but:
- Subtle shadows (the entire `.surface-*` glass system) disappear on `#000`.
- The dashboard is data-dense (KPIs, calendar, kanban, graph, tables) — text contrast vs. `#000` is *too* high, causing eyestrain at long sessions.
- Slate-950 (`#0B1220`) preserves the same "shape" of depth the light theme has; users transitioning between modes feel the same hierarchy.

If Luis later wants a true-black option, it's a one-line `.theme-oled { … }` override of `--background` and `--card` — no refactor needed.

## Appendix C — Things that already work

Don't touch these — they're already token-driven and will flip correctly the moment `.dark { }` is added:

- `components/account/setup/page.tsx` — uses `bg-card`, `border-border`, `bg-primary` throughout
- Most of `components/ui/*` — shadcn primitives already point to tokens
- `components/families/ApsProjectBrowser.tsx` — uses `border-border/30`
- `DashboardCalendar.tsx` header — `bg-background/80`, `border-primary/20`
- The `tasks/TaskEditDialog.tsx` — relies entirely on `bg-muted`, `border-muted-foreground`, `border-primary`

The `dark:` partial coverage in `components/ui/button.tsx` and `components/ui/input.tsx` is leftover shadcn defaults — they'll work as soon as tokens are in place.
