import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { GroupId } from "./accTaxonomy.types";

type DimKind = "categorical" | "ordinal" | "binary" | "multiHot";
type DimFamily = "structure" | "access" | "affiliation" | "tenure" | "activity" | "folder";
export type DimConfidence = "high" | "medium" | "low";
type DimSurface = "slider" | "color";

/** A node's value: number (ordinal), string (categorical/binary), string[] (multiHot), or null (absent). */
type DimValue = string | number | string[] | null;

export interface CatalogDimension {
  id: string;
  label: string;
  family: DimFamily;
  /** Action dims only: excel module + group placement. */
  moduleId?: string;
  groupId?: GroupId;
  kind: DimKind;
  /** Human-readable provenance. */
  source: string;
  confidence: DimConfidence;
  /** Optional human explanation for a greyed/disabled row (shown as tooltip). */
  note?: string;
  /** false => greyed/disabled in the UI (no data for this dimension). */
  available: boolean;
  surfaces: DimSurface[];
  /** Color ramp style when surfaced as color. */
  colorScale?: "categorical" | "ordered";
  /** Pure per-node read. */
  extract(f: NodeFeatureSnapshot): DimValue;
}
