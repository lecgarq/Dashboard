# Template MTY — Role → Folder Permission Tree — Design

**Date:** 2026-06-10
**Branch:** feat/access-analysis-redesign
**Status:** Approved (design via Q&A), building

## Goal

Add a **by-role hierarchy tree** to the `/template-mty` tab: each role expands to show
every folder it can access, grouped by permission tier. Scope = **all folders that have
permissions** (~178), not just the changed ones. Complements the terrain (which is
folder-centric and changed-only) by answering *"what can each role get into?"*.

## Shape

Three levels: **Role → Tier → Folders**.

```
▾ Core            178 folders
    ● Full control (3)   00_Client Documents · 02_Design Documents · …
    ● View only (175)    RFIs · Submittals · 03_IFC · …
▸ Designer        40 folders
▸ Architect       178 folders
```

- Roles sorted by folder count desc, then name. Collapsed by default (29 roles).
- Tiers in rank order (Full control → View only), each with a colour chip (reusing
  `TIER_COLORS`) and a count.
- Folders within a tier shown as small pills (name; full path on hover), sorted by path.
  Long tiers (> ~30 folders) get a bounded max-height scroll so a 175-folder tier doesn't
  blow up the page.

## Architecture

- `lib/server/templateRoleTree.ts`
  - `buildRolePermissionTree(perms, folders)` → `RoleTreeNode[]` — pure, unit-tested.
    Each `RoleTreeNode = { roleId, roleName, folderCount, tiers: { rank, label, folders:
    {id,name,path}[] }[] }`. A (folder, role) pair has exactly one tier (DB unique), so no
    dupes within a role.
  - `loadTemplateRoleTree()` — reads `AccFolder` (id/name/fullPath) + `AccFolderPermission`
    joined to `AccRole` for the template, then builds. All folders with perms (no
    changed-only filter).
- `app/(dashboard)/template-mty/components/RolePermissionTree.tsx` — client; collapsible
  role rows; tier chips + folder pills; bounded scroll for long tiers.
- Wire into `page.tsx` (Promise.all) + `TemplateAnalysisCharts.tsx` (new section under the
  terrain).

## Reuse

- `rankForTier`, `TIER_LEGEND`, `TIER_COLORS` from `folderTerrain.ts` (tier rank/label/colour).

## Testing

- Unit: `buildRolePermissionTree` — grouping by role + tier, folder counts, tier ordering
  (rank desc), role ordering (count desc), missing-folder guard, empty input.
- Component: a role row renders its count and expands to show tiers/folders.

## Out of scope

- Folder-first / role+folder toggle (owner picked by-role).
- Changed-only filter (owner picked full set).
- Search/filter within the tree (can add later if the 29-role list feels long).
