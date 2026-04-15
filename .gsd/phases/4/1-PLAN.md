---
phase: 4
plan: 1
wave: 1
---

# Plan 4.1: Component & Hooks Dead Logic Purge

## Objective
Remove natively flagged unused wrapper hooks and named component exports mapped deep within the alive TSX layer.

## Context
- .gsd/SPEC.md
- server/auth.ts
- components/providers/project-provider.tsx
- components/providers/navigation-provider.tsx
- hooks/use-role.ts
- components/families/KanbanBoard.tsx

## Tasks

<task type="auto">
  <name>Purge Dead Wrappers in server/auth and hooks</name>
  <files>server/auth.ts, components/providers/project-provider.tsx, components/providers/navigation-provider.tsx, hooks/use-role.ts, components/families/KanbanBoard.tsx</files>
  <action>
    - Open `server/auth.ts` and remove `export const signIn = ...` and `export const signOut = ...`.
    - Open `components/providers/project-provider.tsx` and delete `export function useProject() {...}` or `export const useProject...`.
    - Open `components/providers/navigation-provider.tsx` and strip `export function useNavigationLoader() {...}`.
    - Open `hooks/use-role.ts` and eliminate `export const useModuleAccess = ...`.
    - Open `components/families/KanbanBoard.tsx` and eliminate the unused `export const KanbanBoard` reference.
    *(Use standard context gathering views, then `replace_file_content` to execute exactly)*.
  </action>
  <verify>grep -q "useModuleAccess" hooks/use-role.ts || echo "Safe"</verify>
  <done>Dead functions seamlessly evaporated across the web/hook architecture.</done>
</task>

## Success Criteria
- [ ] No compilation errors triggered upon extraction.
- [ ] Orphaned hook logic eliminated.
