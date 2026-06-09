# Spatial graph: three color & grouping presets

**Date:** 2026-06-09
**Route affected:** `/users/spatial-graph` (the projector map) only.
**Status:** Approved (design phase).

## Goal

Reduce the projector map's color and grouping controls to exactly three presets
each — **User name, Project, Role** — to cut clutter. No data or pipeline changes;
all three presets already exist in the node feature snapshot.

## User-facing behavior

- **Group by** dropdown offers exactly: `User name`, `Project`, `Role`.
- **Color by** dropdown offers exactly: `User name`, `Project`, `Role`.
- The two pickers are **independent** — any combination is valid (e.g. group by
  Project, color by Role).
- **Default on load:** both default to **Role**. (Today's default grouping is
  `Company`, which is being removed, so a new default is required; Role is the
  most informative of the three.)
- All other entries currently in these menus are removed from the menus only:
  Cluster, Company, Account status, Permission, Tenure, Risk, the per-action
  dimensions, etc. They remain in the codebase — just not offered as presets.

## Why coloring needs one new line and grouping needs none

The two controls are fed by different dimension systems:

- **Grouping** reads `dimensionCatalog` (via `groupByDimensions.ts`), which already
  contains `user`, `project`, and `role` (see `dimensionCatalog.structural.ts`).
- **Coloring** reads the legacy `DIMENSION_REGISTRY` (via `nodeColors.ts`), which
  contains `project` and `role` but **no `user`** dimension.

So grouping by user already works; coloring by user requires teaching the color
path to read `f.userName` (the same field grouping uses).

## Code changes

1. **`groupByDimensions.ts`** — restrict the offered list to an allowlist
   `{ user, project, role }`, ordered Role → Project → User name, and make the
   default `role`.

2. **`nodeColors.ts`** —
   - Rebuild `COLOR_MODES` to exactly `["role", "project", "user"]`.
   - Add `user` to `COLOR_MODE_LABELS` ("User name"); keep `project`/`role` labels.
   - Add a branch in `categoryForColor` so `mode === "user"` buckets by `f.userName`
     (falling back to `"(unknown)"`), since the registry has no `user` dimension.
   - `migrateColorMode` continues to map any unknown/stored value → `role`.

3. **`AccessAnalysisShell.tsx`** (light wiring) — initialize the color selection to
   `role` so the picker always drives color (the "independent" model), and ensure a
   stale stored group/color value falls back to `role`.

## Testing

- Update `groupByDimensions` / `nodeColors` unit tests to assert each picker offers
  exactly the three IDs and defaults to `role`.
- Add a test that color-by-`user` buckets nodes by `userName`.
- Gates: full unit suite green, `tsc` clean.

## Out of scope (YAGNI)

- No "Auto / match grouping" color option.
- No slider, strength, or layout-engine changes.
- No new data fields or ingestion changes.
- No changes to the `/access-analysis` dashboard or the folder terrain.
