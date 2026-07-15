/**
 * dimensionCoverage.ts — Honest, node-derived coverage per aperture dimension
 * (Phase 25, DIM-05). `covered/total` over the LOADED snapshot: total = node
 * count, covered = nodes carrying a real value for the dimension. This is the
 * shipped number — never a hardcoded figure.
 *
 * VERIFY: whether the ~550/1,153 project figure (AccDcProject vs AccProject)
 * is the correct coverage denominator for DC-sourced dims; node-derived
 * coverage is the shipped number.
 *
 * Pure: no React/DOM/IO.
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { CatalogDimension } from "./dimensionCatalog.types";
import { buildStructuralDimensions } from "./dimensionCatalog.structural";

export interface DimensionCoverage {
  covered: number;
  total: number;
  note?: string;
}

/**
 * Provenance notes for dims whose upstream source does not see every node.
 * DC-sourced dims come from the Data Connector crawl (project-scoped, partial);
 * dims absent from this map are computed from all loaded nodes.
 */
export const APERTURE_SOURCE_NOTES: Readonly<Record<string, string>> = {
  company: "DC-sourced",
  membershipTenure: "DC-sourced",
  activityVolume: "DC-sourced",
  activityRecency: "DC-sourced",
  dominantActivity: "DC-sourced",
  permissionTier: "folder-crawl",
  folderBreadth: "folder-crawl",
  accessibleDataTB: "folder-crawl",
};

/** Placeholder strings the extractors use for absent values. */
const MISSING_STRINGS = new Set(["", "(none)", "(unknown)", "(no role)", "none", "unknown"]);

function presentValue(v: string | number | string[] | null): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return !MISSING_STRINGS.has(v.toLowerCase());
}

/**
 * Per-dim presence overrides where the generic extract-based rule would lie:
 * a 0/null from an UNCRAWLED source is "unknown", not "no access"; activity
 * and byte totals default to 0 upstream, so only observed data counts.
 */
const PRESENT_OVERRIDES: Record<string, (f: NodeFeatureSnapshot) => boolean> = {
  permissionTier: (f) => f.permTier != null && f.permissionCoverage !== "unknown",
  folderAccessPermissions: (f) => f.permissionStrength != null && f.permissionCoverage !== "unknown",
  folderBreadth: (f) => f.permissionTypeSummary != null && f.permissionTypeSummary.coverage !== "unknown",
  accessibleDataTB: (f) => (f.accessibleDataBytes ?? 0) > 0,
  activityVolume: (f) => (f.activityTotal ?? 0) > 0,
  adminMember: (f) => f.isAdmin != null,
};

const STRUCTURAL_BY_ID = new Map(buildStructuralDimensions().map((d) => [d.id, d]));

/**
 * A dim is "under-covered" when a material share of loaded nodes lack a real
 * value — the pickers then carry a persistent ⚠ (DIM-05: label, don't hide).
 * ponytail: fixed 90% threshold; make per-dim if a dim ever needs its own bar.
 */
export const UNDER_COVERAGE_RATIO = 0.9;

export function isUnderCovered(c: DimensionCoverage): boolean {
  return c.total > 0 && c.covered / c.total < UNDER_COVERAGE_RATIO;
}

/** "14,201/16,942" — the honest node-derived figure both pickers display. */
export function coverageText(c: DimensionCoverage): string {
  return `${c.covered.toLocaleString("en-US")}/${c.total.toLocaleString("en-US")}`;
}

/**
 * Honest coverage for one aperture dimension over the loaded snapshot.
 * Unknown dim ids report zero covered; an empty snapshot reports {0, 0}.
 */
export function dimensionCoverage(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dimId: string,
  catalog: readonly CatalogDimension[] = [],
): DimensionCoverage {
  const total = features.length;
  const override = PRESENT_OVERRIDES[dimId];
  const structural = STRUCTURAL_BY_ID.get(dimId);
  const dim = structural ?? catalog.find((dimension) => dimension.id === dimId);
  const generatedActivity = !structural && dim?.family === "activity";
  let covered = 0;
  if (override || dim) {
    for (const f of features) {
      const present = override
        ? override(f)
        : generatedActivity
          ? Number(dim!.extract(f) ?? 0) > 0
          : presentValue(dim!.extract(f));
      if (present) covered += 1;
    }
  }
  const note = APERTURE_SOURCE_NOTES[dimId];
  return note ? { covered, total, note } : { covered, total };
}
