/**
 * dimensionCatalog.ts — THE dimension source of truth for the redesigned access-analysis
 * sidebar. Generates every dimension (structural/access + all taxonomy actions + greyed
 * folder attributes) and the grouped section tree the sidebar renders. Pure; replaces the
 * legacy dimensionRegistry/dimensionGroups (deleted in Phases D–E once unwired).
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { GroupId } from "./accTaxonomy.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { getModules, getGroups } from "./accTaxonomy";
import { buildStructuralDimensions } from "./dimensionCatalog.structural";
import { buildActionDimensions, buildActionAvailability } from "./dimensionCatalog.actions";
import { buildFolderAttributeDimensions } from "./dimensionCatalog.folder";

export * from "./dimensionCatalog.types";

/** The full flat catalog. `features` (when given) drives per-action availability (greyed = no data). */
export function buildDimensionCatalog(features: readonly NodeFeatureSnapshot[] = []): CatalogDimension[] {
  const availability = features.length ? buildActionAvailability(features) : undefined;
  return [
    ...buildStructuralDimensions(),
    ...buildActionDimensions(availability),
    ...buildFolderAttributeDimensions(),
  ];
}

// ---- Section tree for the sidebar ----------------------------------------

export interface CatalogActivityGroup { groupId: GroupId; groupLabel: string; actions: CatalogDimension[] }
export interface CatalogActivityModule { moduleId: string; moduleLabel: string; groups: CatalogActivityGroup[] }
export interface CatalogSection {
  kind: "structural" | "activity" | "folder";
  label: string;
  /** structural / folder: flat list. */
  dims?: CatalogDimension[];
  /** activity: module -> group -> action tree. */
  modules?: CatalogActivityModule[];
}

/** Group a flat catalog into the sidebar's three sections (structural pinned, activity tree, folder). */
export function getCatalogSections(dims: readonly CatalogDimension[]): CatalogSection[] {
  const structural = dims.filter((d) => d.family !== "activity" && d.family !== "folder");
  const folder = dims.filter((d) => d.family === "folder");
  const actions = dims.filter((d) => d.family === "activity");

  const moduleOrder = getModules();
  const groupOrder = getGroups();
  const modules: CatalogActivityModule[] = [];
  for (const m of moduleOrder) {
    const inModule = actions.filter((a) => a.moduleId === m.id);
    if (inModule.length === 0) continue;
    const groups: CatalogActivityGroup[] = [];
    for (const g of groupOrder) {
      const inGroup = inModule.filter((a) => a.groupId === g.id);
      if (inGroup.length === 0) continue;
      groups.push({ groupId: g.id, groupLabel: g.label, actions: inGroup });
    }
    modules.push({ moduleId: m.id, moduleLabel: m.label, groups });
  }

  return [
    { kind: "structural", label: "Structure & Access", dims: structural },
    { kind: "activity", label: "Activity", modules },
    { kind: "folder", label: "Folder attributes", dims: folder },
  ];
}
