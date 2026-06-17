# Feature Research

**Domain:** Workshop-grade analytics/presentation dashboard (BIM management — 4 pages)
**Researched:** 2026-06-17
**Confidence:** HIGH

---

## Context: What Makes This Different From a SaaS Product

This is NOT a self-service product. Luis is the only user who drives the UI. All other users watch on a projected screen during workshops. Every interaction pattern must therefore serve **live, exploratory storytelling** — not engagement, retention, or discoverability. The bar is: does this make the data land harder in the room? If not, cut it.

Pages in scope:
- `/users` — heavy virtualized list → needs premium clickable data-table rebuild
- `/access-analysis` — donuts + timeline + terrain + drill-downs → needs depth + motion polish
- `/template-mty` — members table + role pies + role-similarity graph → needs interactivity uplift
- `/forma-proposal` — role-permission DRAFT EDITOR — NOT a chart page; needs editor-grade UX

Aesthetic north stars (feel only, not content): landonorris.com · igloo.inc · orano.group innovation slider — dark, cinematic, WebGL depth, smooth scroll-driven reveals.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that a premium dashboard MUST have. Missing any of these means the page feels broken or amateur during a workshop.

| Feature | Why Expected | Complexity | Page(s) | Notes |
|---------|--------------|------------|---------|-------|
| Clickable chart segments → drill-down panel | The whole story arc: "who is this?" after seeing a donut slice | LOW | /access-analysis, /template-mty | ECharts `onEvents` pattern is already in place; wire to a consistent slide-in detail panel |
| Clickable table rows → profile/detail | Owner explicitly requires "clickable rows and fields everywhere"; audience expects it | LOW | /users, /template-mty | Already partially done in /users via person detail modal; make consistent |
| Sticky column headers during scroll | Without stickiness, column context is lost the moment you scroll | LOW | /users (table), /template-mty (members table) | CSS `position: sticky` + `z-index` layer; TanStack Virtual handles this natively |
| Sortable columns | Every data table — expected by any business user | LOW | /users, /template-mty | TanStack Table `getSortedRowModel` — one column sort at a time is sufficient |
| Active-filter / drill-state indicator | Users need to know the dashboard is in a filtered state, not its default view | LOW | /access-analysis | Breadcrumb or pill bar showing "Filtered by: Role = BIM Manager"; already partially exists (active-filters bar) |
| Skeleton loading states | Page appears instantly and fills in — latency is felt as broken otherwise | LOW | All 4 pages | `/access-analysis` already has RSC loaders; add loading skeletons for deferred panels |
| Responsive / zoom-stable layout | Workshop screen may be a projector at 1080p; layout cannot break at 125% zoom | LOW | All 4 pages | Use `h-full overflow-y-auto` root + CSS-var semantic tokens — already documented in DARK_MODE.md conventions |
| Light + dark both polished | Workshops run on either; dark for drama, light for legibility in bright rooms | MEDIUM | All 4 pages | Zinc dark palette already decided (`#09090B`); ECharts must read `resolvedTheme` for canvas colors |
| Clear "reset / back to overview" escape | In a drill-down, audience loses context if there is no obvious way out | LOW | /access-analysis, /template-mty | A single "Back" breadcrumb or pill dismiss; NOT a browser-back (that exits the page) |
| Hover tooltips on chart segments | Standard affordance — audience expects to see numbers on hover | LOW | All chart pages | ECharts `tooltip` — already present on donuts; ensure consistent across module chart, terrain, etc. |

### Differentiators (What Makes the Workshop Demo Memorable)

These elevate the experience from "a dashboard" to "a presentation tool." Not expected by default — but when done well, they're what people talk about after the session.

| Feature | Value Proposition | Complexity | Page(s) | Notes |
|---------|-------------------|------------|---------|-------|
| Slide-in detail panel (not modal overlay) | A panel that pushes or overlays the content — not a blocking modal — keeps the overview visible while revealing detail. Audience sees BOTH context and detail simultaneously. | MEDIUM | /access-analysis, /users, /template-mty | Use a right-side drawer (shadcn Sheet) at ~40% width; `AnimatePresence` for entry; no backdrop that blacks out the chart behind it |
| Cross-filtering: click one chart, dim others | Click a role donut segment → activity timeline and module donut filter to that role's activity. Shows cause→effect live. Massive storytelling impact. | MEDIUM | /access-analysis | ECharts `dispatchAction` highlight/downplay + Zustand filter context (`FilterContext` already exists as seed). No new DB queries — filter client-side on already-loaded data. |
| Staggered reveal on page load (cascade, not pop) | Charts and KPIs appear in sequence rather than all at once. Makes the data feel alive. Igloo.inc effect translated to analytics. | LOW | All pages | Motion `staggerChildren` on the panel grid — 60ms delay per card. Keep total reveal < 400ms. Use `AnimatePresence` + `initial={false}` on subsequent tab visits so it only plays once per load. |
| Smooth count-up / number animation on KPI cards | Numbers counting up on entry feel alive vs. numbers that snap in. Audiences read them as "calculating in real time" — workshop theatre. | LOW | /access-analysis (KPI strip), /template-mty (role counts) | Framer Motion `useMotionValue` + `useSpring` or a tiny `useCountUp` hook. Values already exist server-side; no new data needed. |
| Expandable row with inline person detail | Click a person row in /users → row expands inline, showing role, last activity, module access — without navigating away. Presenter can click person after person without losing table position. | MEDIUM | /users | TanStack Table `getExpandedRowModel` + animated `AnimatePresence` for the reveal. Existing person detail modal becomes the COLLAPSED variant; inline expansion is the DEFAULT for table context. No new data: `/api/trpc/users.getProfile` already returns the profile payload. |
| Column density toggle (comfortable / compact) | Workshop audience may need to see 15 rows vs 30 rows. Compact = more rows visible per screen without scrolling. Presenter switches live. | LOW | /users | Three-state icon toggle (Compact / Comfortable / Spacious). TanStack Table row height is a CSS variable. Zero new data. |
| Pinned "Name" column + virtualized scroll | /users has 3,367 users. Name column pins; rest can scroll horizontally without losing identity. | MEDIUM | /users | `columnPinning` in TanStack Table + TanStack Virtual for row virtualization. Already partially built (window-virtualized); swap to TanStack Virtual for better sticky support. |
| Animated transition on drill-path change | When clicking a role → its people, the panel SLIDES in from the right. When clicking "back" → it slides OUT to the right and the chart re-expands. Cause→effect motion. | LOW | /access-analysis, /template-mty | Framer Motion `x: "100%"` → `x: 0` on mount; reverse on unmount via `exit`. 200ms ease-out. Not decorative — it visually explains the navigation direction. |
| Donut "selected segment" glow + label pop | Clicking a donut slice: slice separates, glows, its label grows bold and large. Rest dims. Audience's eye is guided to what the presenter is talking about. | LOW | /access-analysis (roles, modules), /template-mty (role pies) | ECharts `selectedMode: 'single'` + `itemStyle.shadowBlur`. Already partially using `selected` state. Extend to all donut charts consistently. |
| "Spotlight" / focus mode: hide sidebar + nav | A one-key toggle that collapses the sidebar and nav, giving the chart 100% of the screen width. Workshop projectors are wide. | MEDIUM | All pages | CSS variable `--sidebar-width: 0` + transition. Keyboard shortcut (`F` for focus). No data changes. Existing sidebar already has a `collapsed` variant. |
| Terrain heatmap gradient depth effect | The folder-permission terrain is already a 3D-ish surface. Add a subtle depth gradient (dark-to-light from front-to-back row) to reinforce the "2.5D depth" premium feel. | LOW | /access-analysis (terrain) | ECharts 3D bar chart color interpolation or a CSS gradient overlay on the SVG. No new data. |
| Role-similarity graph force-layout with hover labels | /template-mty's role-similarity graph already exists. Ensure node hover shows role name + similarity score as a floating label (not a clipped tooltip). Clicking a node drills into role members. | MEDIUM | /template-mty | ECharts force graph `tooltip` + `onClick` handler. Existing role data from Prisma AccRole — no new data. |
| Forma-proposal: live diff view | When editing a role-permission draft, show a two-column before/after diff view (original template vs. proposed). Makes the delta obvious in a workshop. | HIGH | /forma-proposal | New server query needed: `template.getBaseline(roleId)` vs. current draft state. All data is in Prisma (AccRole + permissions). Highest-complexity differentiator. |
| Project-grouped accordion in /access-analysis | The project picker currently uses a dropdown. Replace with a persistent grouped accordion (office → projects) that stays open, so presenters can click between projects without a modal | MEDIUM | /access-analysis | Existing office-grouped data structure (`loadInstanceView`) already groups by project. Accordion with `AccordionItem` from shadcn + scroll-lock so the active project is always visible. |

### Anti-Features (Deliberately Excluded)

These seem appealing but are wrong for a single-presenter workshop tool.

| Feature | Why Requested | Why It's Wrong for This Context | What to Do Instead |
|---------|---------------|--------------------------------|-------------------|
| Real-time data refresh / live polling | "Dashboard should always be up to date" | Adds network latency and causes visible chart redraws mid-presentation. The data is from a nightly DC cron — there is nothing "real-time" to refresh. | Static RSC load on page entry. Add a "Last synced X hours ago" chip (already on some panels). |
| Export to CSV / Excel buttons on every panel | "Let me take this home" | Breaks the live-workshop flow. Adds visual clutter. Users are watching, not downloading. Only relevant on /forma-proposal (JSON/CSV export already exists). | Keep export only where it exists today (forma-proposal). Remove from chart panels. |
| Dense configuration panels / settings drawers | "Power users want control" | There is ONE power user (Luis), and he configures at build time. A settings panel in the UI adds cognitive load and visual noise during a workshop. | All configuration stays in code or .env. No in-app settings panels for charts. |
| Pagination on large tables | "Standard table pattern" | Pagination breaks storytelling flow — scrolling is better on a projector. Pagination also requires extra clicks during live exploration. | Virtual scroll (TanStack Virtual). Infinite-scroll feel with zero additional queries since the full user list is already in memory from the RSC loader. |
| Onboarding tours / tooltips on features | "Users need to know how to use it" | There is only one user (Luis); he built it. Tours add DOM clutter, are skipped immediately, and can trigger during a workshop. | Rely on obvious affordances (hover cursors, consistent click targets). |
| Real-time collaboration / presence indicators | "What if multiple users interact?" | No multi-user interaction exists; the audience watches. Presence UI is pure noise. | N/A. |
| Auto-play animated data story / narration | "Make it self-presenting" | Luis drives the narrative based on room energy. A scripted auto-play removes his ability to pivot. | Support Luis's manual navigation. Make transitions fast so he can move at conversation speed. |
| Complex filter builder / query interface | "Let users build their own views" | Self-service analytics → wrong product category. Adds UI weight. | Keep filters to the existing active-filter bar + cross-filter-on-click. No query builders. |
| Notification badges / activity feeds | Borrowed from engagement-product playbook | Workshop context has no background activity stream to surface. Adds visual noise. | Remove any notification UI that isn't a sync-status chip. |
| Infinite scroll on chart drill-down lists | "Show all 3,367 users in the drill panel" | In a workshop, nobody needs to scroll 3,367 names. Seeing 10–20 top members is the story. | Cap drill-down `PeopleDrillList` at 20 rows + "N more" label. Already bounded in the implementation. |
| Drag-to-reorder columns | "Power user customization" | The presenter never does this during a workshop. Adds complexity to the table component. | Fixed, well-chosen column order designed once. |
| Chart type switcher (bar → line → pie toggle) | "Flexibility" | Wrong chart type for the data = wrong story. Choose one optimal chart per metric and commit. | Pick the right chart at design time. No type switcher. |

---

## Feature Dependencies

```
Slide-in detail panel
    └──required by──> Clickable chart segments → drill-down
    └──required by──> Expandable row inline detail
    └──required by──> Role-similarity graph node click

Cross-filtering (Zustand FilterContext)
    └──required by──> "Active filter indicator" pill bar
    └──enhances──> Animated transition on drill-path change

Sticky column + virtualization (TanStack Virtual)
    └──required by──> Column density toggle
    └──required by──> Pinned "Name" column

Forma-proposal diff view
    └──requires──> New tRPC query: template.getBaseline(roleId)
    └──independent of──> all other features (self-contained editor)

Staggered reveal / Motion (Framer Motion / motion package)
    └──shared by──> Count-up KPI animations
    └──shared by──> Panel slide-in transitions
    └──shared by──> Donut segment reveal on load
```

### Dependency Notes

- **Slide-in panel requires consistent data contract:** Every drill-down must use the same `Sheet` component with the same layout — role detail, people list, folder access. Design the shell once; fill content per context.
- **Cross-filtering requires FilterContext before drill-down wiring:** Implement Zustand filter context first; then chart click handlers dispatch to it; then active-filter bar reads from it.
- **Motion library is already in the stack (Framer Motion is bundled with Next.js shadcn starters):** Check `package.json` — if not present, add `motion` (the maintained fork). Zero breaking changes.
- **Forma-proposal diff view is independent and highest-complexity:** Do it last or in a separate phase. All other features can ship without it.

---

## MVP Definition (This Milestone)

### Must Ship (Phase 1 — makes the data land)

- [ ] **Slide-in detail panel (Sheet)** — shared component used by every click target; the container for all drill-downs
- [ ] **Clickable chart segments → drill-down** — roles donut, modules donut, activity donut all trigger the panel
- [ ] **Clickable table rows → inline expand** — /users table row expand shows person summary; does NOT navigate away
- [ ] **Sticky headers + TanStack Virtual** — /users virtualized table with pinned Name column and sticky headers
- [ ] **Staggered reveal on page load** — `motion` stagger on panel grid, 60ms between cards, only on first mount
- [ ] **Active-filter indicator** — pill bar showing active cross-filter state with one-click dismiss
- [ ] **Skeleton loading states** — all deferred panels show skeleton before data arrives

### Add After Core Patterns Work (Phase 2 — polish)

- [ ] **Cross-filtering** — click role donut → module donut + timeline filter; wired through FilterContext
- [ ] **Count-up KPI numbers** — `useSpring` on numeric values in the KPI strip
- [ ] **Column density toggle** — compact / comfortable / spacious on /users table
- [ ] **Donut selected-segment glow** — ECharts `selectedMode: 'single'` + shadow effect on all donut charts
- [ ] **Terrain depth gradient** — visual polish on folder-permission terrain
- [ ] **Spotlight / focus mode** — sidebar collapse shortcut for full-screen projection

### Defer to Later / Own Phase

- [ ] **Forma-proposal diff view** — HIGH complexity, independent, needs new tRPC query
- [ ] **Project-grouped accordion** — MEDIUM complexity; current dropdown is functional for now
- [ ] **Role-similarity graph node drill** — /template-mty graph click → people list via existing data

---

## Feature Prioritization Matrix

| Feature | Presentation Value | Implementation Cost | Priority |
|---------|--------------------|---------------------|----------|
| Slide-in detail panel (Sheet shell) | HIGH | LOW | P1 |
| Clickable chart segments → drill-down | HIGH | LOW | P1 |
| Clickable table rows → inline expand | HIGH | MEDIUM | P1 |
| Sticky headers + TanStack Virtual | HIGH | MEDIUM | P1 |
| Staggered reveal on load | HIGH | LOW | P1 |
| Skeleton loading states | HIGH | LOW | P1 |
| Active-filter indicator / pills | MEDIUM | LOW | P1 |
| Cross-filtering (FilterContext wiring) | HIGH | MEDIUM | P2 |
| Count-up KPI numbers | MEDIUM | LOW | P2 |
| Column density toggle | MEDIUM | LOW | P2 |
| Donut segment glow / selectedMode | MEDIUM | LOW | P2 |
| Spotlight / focus mode | MEDIUM | MEDIUM | P2 |
| Animated slide-in / slide-out transitions | MEDIUM | LOW | P2 |
| Terrain depth gradient | LOW | LOW | P2 |
| Project-grouped accordion | MEDIUM | MEDIUM | P3 |
| Role-similarity node drill | MEDIUM | MEDIUM | P3 |
| Forma-proposal diff view | HIGH | HIGH | P3 |

---

## Interaction Pattern Catalogue (Implementation Reference)

### Pattern A: Chart Segment → Detail Panel

**Trigger:** `onEvents={{ click: handleSegmentClick }}` on any ECharts instance  
**Handler:** sets `Zustand.selectedSegment = { dimension, value }` → opens `Sheet`  
**Panel content:** filtered people list (PeopleDrillList, already exists) OR a summary card  
**Dismiss:** Sheet's built-in `onOpenChange(false)` OR the "Back" breadcrumb pill  
**Cross-filter effect (Phase 2):** dispatch also updates `FilterContext` → other charts call `dispatchAction` highlight/downplay  

### Pattern B: Table Row → Inline Expand

**Trigger:** Click anywhere on a row in /users table  
**Effect:** `getExpandedRowModel()` expands the row; `AnimatePresence` reveals the sub-row with `height: 0 → auto` transition (200ms)  
**Content:** Person summary card — avatar, role, last activity date, module access badges  
**Data:** `trpc.users.getProfile(userId)` — already exists; loads on expand (not preloaded)  
**Collapse:** click the same row again OR click a different row (single-expand mode)  

### Pattern C: Cross-Filter Cascade

**Trigger:** Segment click on donut A  
**Effect:** Zustand `filterContext.setRole(roleName)` → donuts B, C read from context → re-render with filtered data client-side (no new network call — data is already loaded from RSC)  
**Visual:** non-matching segments dim to 20% opacity; active segments brighten; active-filter pill appears at top of the chart grid  
**Dismiss:** "×" on the filter pill → `filterContext.clear()` → all charts return to full data  

### Pattern D: Staggered Page Reveal

```tsx
// Wrap chart panels in a stagger container
<motion.div variants={containerVariants} initial="hidden" animate="visible">
  {panels.map((panel, i) => (
    <motion.div key={panel.id} variants={itemVariants} custom={i}>
      <Panel {...panel} />
    </motion.div>
  ))}
</motion.div>

// containerVariants: staggerChildren: 0.06
// itemVariants: hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
```

**Rule:** Only animate on initial mount. Set `initial={false}` on subsequent renders to avoid re-animating on filter changes.

### Pattern E: Number Count-Up on KPI Cards

```tsx
const count = useMotionValue(0);
const rounded = useTransform(count, Math.round);
useEffect(() => { animate(count, targetValue, { duration: 0.8, ease: "easeOut" }); }, [targetValue]);
return <motion.span>{rounded}</motion.span>;
```

**Use only on the KPI strip.** Do NOT count-up values inside charts — it conflicts with ECharts own animation.

---

## Data Availability Map (Existing Prisma DB)

All features above are achievable from the existing schema. No new DB migrations needed.

| Feature | Data Source | Notes |
|---------|-------------|-------|
| Drill-down people list | `AccDcProjectUser` + `AccRole` via `acc-members.ts` | Already implemented as `PeopleDrillList` |
| Person inline expand | `users.getProfile(userId)` tRPC endpoint | Already exists |
| Cross-filter by role | Client-side from RSC-loaded `loadInstanceView()` data | Already in memory; filter in client |
| KPI counts | `loadInstanceView()` aggregates | Already computed server-side |
| Module activity | `loadModuleActivity()` | Already exists |
| Role distribution | `loadActivityByActor()` | Already exists |
| Forma diff view | `AccRole` permissions + local draft state | New query needed: `template.getBaseline(roleId)` |
| Folder terrain depth | `folderPermissionTerrainView` | Already loaded; visual only change |

---

## Motion Budget (Hard Limits)

These constraints prevent the "overwhelming" anti-pattern explicitly flagged in PROJECT.md:

| Motion Type | Max Duration | When | Never |
|-------------|-------------|------|-------|
| Page stagger reveal | 400ms total | First mount only | On filter/cross-filter state changes |
| Panel slide-in (Sheet) | 200ms ease-out | On open/close | Bouncy spring |
| Row expand | 200ms height transition | On click | Simultaneous multi-row expand |
| Count-up numbers | 800ms ease-out | On first load | On every re-render |
| Chart segment selection | 150ms ECharts native | On click | Custom JS override of ECharts animation |
| Spotlight mode | 300ms sidebar collapse | On key press | Any layout jank |

**Rule:** If a motion makes the presenter WAIT before continuing, cut it or halve its duration.

---

## Sources

- [ECharts Event Handling](https://apache.github.io/echarts-handbook/en/concepts/event/) — click events, selectedMode
- [TanStack Table v8 — Virtualized Rows](https://tanstack.com/table/v8/docs/framework/react/examples/virtualized-rows)
- [TanStack Virtualizer — Sticky Headers](https://tanstack.com/virtual/v3/docs/framework/react/examples/sticky)
- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/radix/data-table)
- [Motion React (Framer Motion)](https://motion.dev/docs/react)
- [Metabase — Cross-Filtering](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/dashboards/cross-filtering)
- [Pencil & Paper — Enterprise Data Table UX Patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables)
- [Pencil & Paper — Dashboard UX Patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
- [DataBrain — Drill-Downs in Analytics](https://www.usedatabrain.com/blog/drill-downs-in-embedded-dashboards-guide)
- [Eleken — Data Table UX Guide](https://www.eleken.co/blog-posts/table-design-ux)
- [Material React Table — Density Toggle](https://www.material-react-table.com/docs/guides/density-toggle)
- [Igloo Inc — Design Reference (Awwwards)](https://www.awwwards.com/igloo-inc-case-study.html)
- [Motion Matters 2025 — Animation in UX](https://medium.com/design-bootcamp/motion-matters-how-animation-elevates-ux-in-2025-b181adca68a9)
- [5 Rules for Motion in UI Transitions](https://www.equal.design/blog/5-rules-for-motion-in-ui-transitions)

---

*Feature research for: LECG Dashboard — Workshop-Grade UI/UX Overhaul (4 pages)*
*Researched: 2026-06-17*
