# Dashboard Known Patterns

Verified patterns from the v2.0 codebase. Use these before inventing new
abstractions.

## tRPC Router Composition

**Root router:** `server/routers/root.ts`

Registered namespaces (23 routers):

| Namespace | Router | File |
|-----------|--------|------|
| `project` | `projectRouter` | `server/routers/project.ts` |
| `families` | `familiesRouter` | `server/routers/families.ts` |
| `clash` | `clashRouter` | `server/routers/clash.ts` |
| `exam` | `examRouter` | `server/routers/exam.ts` |
| `kpi` | `kpiRouter` | `server/routers/kpi.ts` |
| `tasks` | `tasksRouter` | `server/routers/tasks.ts` |
| `search` | `searchRouter` | `server/routers/search.ts` |
| `users` | `usersRouter` | `server/routers/users.ts` |
| `trello` | `trelloRouter` | `server/routers/trello.ts` |
| `sim` | `simRouter` | `server/routers/sim.ts` |
| `calendar` | `calendarRouter` | `server/routers/calendar.ts` |
| `chat` | `chatRouter` | `server/routers/chat.ts` |
| `lod` | `lodRouter` | `server/routers/lod.ts` |
| `apsSearch` | `apsSearchRouter` | `server/routers/aps-search.ts` |
| `gmail` | `gmailRouter` | `server/routers/gmail.ts` |
| `workspace` | `workspaceRouter` | `server/routers/workspace.ts` |
| `accSync` | `accSyncRouter` | `server/routers/acc-sync.ts` |
| `accActivity` | `accActivityRouter` | `server/routers/acc-activity.ts` |
| `accFolders` | `accFoldersRouter` | `server/routers/acc-folders.ts` |
| `accMembers` | `accMembersRouter` | `server/routers/acc-members.ts` |
| `accGraph` | `accGraphRouter` | `server/routers/acc-graph.ts` |
| `accDcGraph` | `accDcGraphRouter` | `server/routers/acc-dc-graph.ts` |
| `accPersonGraph` | `accPersonGraphRouter` | `server/routers/acc-person-graph.ts` |

**Adding a new router:**
1. Create `server/routers/<name>.ts` exporting a named router
2. Import and register in `server/routers/root.ts`
3. Verify `AppRouter` type export picks it up

**Procedure guards:** `server/trpc.ts` exports `publicProcedure`,
`protectedProcedure`, `adminProcedure`, `editorProcedure`. Always verify the
correct guard level for new procedures.

## UI Primitives

| Primitive | File | When to use |
|-----------|------|-------------|
| `PremiumSurface` | `components/ui/PremiumSurface.tsx` | Card/panel wrapper with depth (glass, soft shadow, gradient) |
| `DrillSheet` | `components/ui/DrillSheet.tsx` | Click-to-detail slide-in panel (replaces inline expansion) |
| `DataTable` | `components/ui/DataTable.tsx` | Virtualized, sortable, density-toggle table (built for v2.0) |
| `EChart` | `components/ui/EChart.tsx` | Theme-aware ECharts wrapper (reads `resolvedTheme`) |
| `ThemeToggle` | `components/theme/ThemeToggle.tsx` | Light/dark theme switch |

## ECharts Theme Integration

```typescript
// components/ui/EChart.tsx handles theme resolution
// Always use the EChart wrapper — never raw echarts-for-react
import { EChart } from "@/components/ui/EChart";

// Colors must be resolved from the active theme, not hardcoded
// The EChart component reads resolvedTheme internally
```

**Chart checklist:**
- Use `EChart` wrapper, not raw `echarts-for-react`
- Colors from resolved theme (zinc palette), not hardcoded hex
- Labels, legends, empty states all handled
- Under-covered data sources labeled honestly
- Responsive and both-theme tested

## Motion Pattern

**Budget:** ≤200ms for drill interactions. Fire only on mount/drill.

**Reduced motion:** Respect `prefers-reduced-motion`. The UAT engineering gates
check this.

**Staggered reveal:** Used for page-level card entry. Keep stagger delays
short (30-50ms between items).

## Skeleton / Loading Pattern

Page shells in `app/` use `loading.tsx` and/or inline skeleton states for
progressive loading. Each tRPC endpoint should be fetched exactly once — the
UAT fetch-once gate verifies this.

## Page Scroll Ownership

Page roots must own scroll: `h-full overflow-y-auto`. Do not nest scrolling
containers. This is recorded in PROJECT.md and DARK_MODE.md conventions.

---

*Verified against v2.0 codebase (2026-06-19). Update when new shared primitives
are added or existing ones change.*
