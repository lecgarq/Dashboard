/**
 * activityDimensions.ts — v2.7 Phase 40 (DIM-07, owner decisions 3+4).
 *
 * The activity universe's dimension model: 8 descriptors over the payload's
 * resident int columns. All labels resolve from meta dicts — never hardcoded.
 * Author is color-by/filter/hover only, NEVER group-by (owner decision 4).
 * Pure — no React/DOM/IO.
 *
 * Coverage is honest and node-derived: dicts reserve slot 0 as the sentinel
 * ("Unknown", "(none)", "Unknown author"), so covered = rows with a nonzero
 * id. Month has no sentinel (derived from the event timestamp) → full corpus.
 */

import { activityProjectLabel, monthLabel } from "./activityEventLabels";

export type ActivityDimensionId =
  | "verb"
  | "module"
  | "objectType"
  | "month"
  | "role"
  | "company"
  | "project"
  | "author";

export interface ActivityDimension {
  id: ActivityDimensionId;
  label: string;
  /** Key into payload columns (Uint16Array id column). */
  column: string;
  /** Key into meta.dicts (month generates labels instead — see dimensionLabels). */
  dictKey: string;
  /** Eligible as a group-by target. Author is excluded (owner decision 4). */
  groupBy: boolean;
  /** Dict slot 0 is a sentinel ("Unknown"/"(none)") → coverage counts nonzero ids. */
  hasSentinel: boolean;
  /** Project dict holds GUIDs — display labels need the projectNames map. */
  labelViaProjectNames?: boolean;
}

export const ACTIVITY_DIMENSIONS: readonly ActivityDimension[] = [
  { id: "verb", label: "Verb", column: "verbId", dictKey: "verb", groupBy: true, hasSentinel: true },
  { id: "module", label: "Module", column: "moduleId", dictKey: "module", groupBy: true, hasSentinel: false },
  { id: "objectType", label: "Object type", column: "objectTypeId", dictKey: "objectType", groupBy: true, hasSentinel: true },
  { id: "month", label: "Month", column: "monthId", dictKey: "month", groupBy: true, hasSentinel: false },
  { id: "role", label: "Author role", column: "roleId", dictKey: "role", groupBy: true, hasSentinel: true },
  { id: "company", label: "Author company", column: "companyId", dictKey: "company", groupBy: true, hasSentinel: true },
  { id: "project", label: "Project", column: "projectId", dictKey: "project", groupBy: true, hasSentinel: true, labelViaProjectNames: true },
  { id: "author", label: "Author", column: "authorId", dictKey: "author", groupBy: false, hasSentinel: true },
];

export const groupByDimensionList = (): readonly ActivityDimension[] =>
  ACTIVITY_DIMENSIONS.filter((d) => d.groupBy);

export const activityDimensionById = (
  id: string,
): ActivityDimension | undefined => ACTIVITY_DIMENSIONS.find((d) => d.id === id);

/**
 * Display labels for a dimension's categories, index-aligned to the id column.
 * Month generates "MMM YYYY" from monthFloor + monthCount; project maps GUIDs
 * through projectNames when supplied (falls back to the GUID so the label is
 * never blank, honestly odd rather than silently missing).
 */
export function dimensionLabels(
  dim: ActivityDimension,
  dicts: Record<string, unknown>,
  projectNames?: Record<string, string>,
): string[] {
  if (dim.id === "month") {
    const monthCount = typeof dicts.monthCount === "number" ? dicts.monthCount : 1;
    const monthFloor = typeof dicts.monthFloor === "string" ? dicts.monthFloor : "";
    return Array.from({ length: monthCount }, (_, i) => monthLabel(monthFloor, i));
  }
  const raw = dicts[dim.dictKey];
  const labels = Array.isArray(raw) ? raw.map(String) : [];
  if (dim.labelViaProjectNames) {
    return labels.map((guid) => activityProjectLabel(guid, projectNames));
  }
  return labels;
}

/** Category count for a dimension (dict length; month = monthCount). */
export function dimensionCardinality(
  dim: ActivityDimension,
  dicts: Record<string, unknown>,
): number {
  if (dim.id === "month") {
    return typeof dicts.monthCount === "number" ? dicts.monthCount : 1;
  }
  const raw = dicts[dim.dictKey];
  return Array.isArray(raw) ? raw.length : 0;
}

export interface ActivityDimensionCoverage {
  covered: number;
  total: number;
}

/**
 * Honest per-dimension coverage over the resident column: sentinel dims count
 * nonzero ids; sentinel-free dims (module's "(none)" is a real category the
 * legend shows; month is derived) report the full corpus.
 */
export function activityDimensionCoverage(
  ids: ArrayLike<number>,
  dim: ActivityDimension,
): ActivityDimensionCoverage {
  const total = ids.length;
  if (!dim.hasSentinel) return { covered: total, total };
  let covered = 0;
  for (let i = 0; i < total; i++) if (ids[i] !== 0) covered += 1;
  return { covered, total };
}

/** "4,630,553/4,904,886" — matches the established coverageText format. */
export function activityCoverageText(c: ActivityDimensionCoverage): string {
  return `${c.covered.toLocaleString("en-US")}/${c.total.toLocaleString("en-US")}`;
}
