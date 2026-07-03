"use client";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { SectionHeader } from "./SectionHeaders";
import { FolderPermissionTerrain } from "./FolderPermissionTerrain";
import type { FolderTerrainData, TerrainProjectOption } from "../folderTerrain";

/**
 * Compare tab (locked tab map, UAT-4): the folder-permission terrain, driven
 * by the global project picker via `externalSelectedIds` (20.1-04 props) —
 * the terrain's own ProjectSelect/ProjectMultiSelect pickers are hidden
 * (`hidePickers`) so there is exactly one search bar on the page.
 *
 * No TerrainReveal expand gate here — Radix `TabsContent` unmounts inactive
 * tabs by default, so tab activation IS the lazy-mount gate.
 *
 * NAMING NOTE (see FolderPermissionTerrain.tsx `deriveTerrainSelection` doc
 * comment): this page-level "Compare" TAB is distinct from the terrain's own
 * internal `mode === "compare"` view (floating stacked planes) — the subtitle
 * below calls this out explicitly so the two "compare" words aren't conflated
 * mid-demo.
 */
export function CompareTabPanel({
  terrainProjects,
  loadTerrain,
  loadOverview,
  selected,
}: {
  terrainProjects?: TerrainProjectOption[];
  loadTerrain?: (projectId: string) => Promise<FolderTerrainData | null>;
  loadOverview?: () => Promise<FolderTerrainData | null>;
  selected: Set<string>;
}) {
  if (!terrainProjects || terrainProjects.length === 0 || !loadTerrain || !loadOverview) {
    return null;
  }

  return (
    <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
      <SectionHeader
        title="Folder permission terrain"
        subtitle="Follows the project search bar above — 0 selected shows the account-wide overview, 1 shows that project, 2+ stacks the top-staffed selection for comparison. (This tab's name is unrelated to the terrain's own internal Compare view mode, used when 2+ projects are active.)"
      />
      <FolderPermissionTerrain
        projects={terrainProjects}
        initial={null}
        loadTerrain={loadTerrain}
        loadOverview={loadOverview}
        externalSelectedIds={[...selected]}
        hidePickers
      />
    </PremiumSurface>
  );
}
