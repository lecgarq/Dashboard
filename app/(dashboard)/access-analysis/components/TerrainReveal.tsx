"use client";
import { useState } from "react";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { FolderPermissionTerrain } from "./FolderPermissionTerrain";
import type { FolderTerrainData, TerrainProjectOption } from "../folderTerrain";

/**
 * TerrainReveal — collapsed panel that defers building the folder-permission
 * terrain until the user clicks to expand.
 *
 * Default state: a PremiumSurface header row with a "Show" button. No
 * <FolderPermissionTerrain> is mounted until the user expands (so the heavy
 * isometric 3D build does NOT happen on page load).
 *
 * On expand: mounts <FolderPermissionTerrain initial={null} ...>. The terrain's
 * own mode="overview" effect calls loadOverview() on first open → account-wide
 * overview loads (locked decision: ACC-03 expand → loadOverview, not a per-project
 * loadFolderPermissionTerrain on the default project).
 */
export function TerrainReveal({
  projects,
  loadTerrain,
  loadOverview,
}: {
  projects: TerrainProjectOption[];
  loadTerrain: (id: string) => Promise<FolderTerrainData | null>;
  loadOverview: () => Promise<FolderTerrainData | null>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <PremiumSurface variant="base" className="flex flex-col gap-0 overflow-hidden rounded-2xl">
      {/* Collapsed header — always visible */}
      <div className="flex items-center justify-between gap-4 p-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
            Folder permission terrain
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Per project: each Level-2 folder × role, coloured by permission tier
            and raised by the number of users in that role.
          </p>
        </div>
        <button
          type="button"
          data-testid="terrain-expand"
          onClick={() => setOpen((prev) => !prev)}
          className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/20"
          aria-expanded={open}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {/* Terrain — only mounted after first expand */}
      {open && (
        <div className="px-5 pb-5">
          <FolderPermissionTerrain
            projects={projects}
            initial={null}
            loadTerrain={loadTerrain}
            loadOverview={loadOverview}
          />
        </div>
      )}
    </PremiumSurface>
  );
}
