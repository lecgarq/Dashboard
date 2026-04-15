---
phase: 3
plan: 2
wave: 2
---

# Plan 3.2: Orphaned Frontend Component Purge

## Objective
Remove drafted but disconnected React Component fragments from the dashboard UI structure mapping.

## Context
- .gsd/SPEC.md
- dead-files.json

## Tasks

<task type="auto">
  <name>Delete Unused UI Fragments</name>
  <files>components/clash/ReleaseTable.tsx, components/clash/TaskKanban.tsx, components/dashboard/ActivityFeed.tsx, components/dashboard/KpiCard.tsx, components/dashboard/MiniCalendar.tsx, components/dashboard/QuickActions.tsx, components/dashboard/TrelloCalendar.tsx, components/exam/ExamTaskList.tsx, components/exam/ResultsTable.tsx, components/families/GanttView.tsx, components/theme/ThemeProvider.tsx, components/theme/ThemeToggle.tsx</files>
  <action>
    - Delete the 12 mapped UI .tsx components. Let the native `rm` logic handle path elimination directly.
  </action>
  <verify>ls components/dashboard/ActivityFeed.tsx 2>/dev/null || echo "Deleted"</verify>
  <done>None of the isolated UI chunks remain in the components hierarchy.</done>
</task>

<task type="auto">
  <name>Assess Final Knip Status</name>
  <files>package.json</files>
  <action>
    - Run the `knip` baseline analyzer completely using `npx knip --no-exit-code`.
    - This must successfully output `No Unused files` (or cleanly skip printing anything about files).
  </action>
  <verify>npx knip --no-exit-code</verify>
  <done>Knip detects zero unused files naturally.</done>
</task>

## Success Criteria
- [ ] Component structure aligned efficiently with exact used routes.
- [ ] Knip completely validates a clean `Unused files (0)` result.
