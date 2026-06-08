/**
 * mapGrouping.ts — Pure resolver for which dim the map groups by, which color mode to
 * use, and whether to show cluster labels. Flag-ON = today's dominant-slider behavior.
 * Flag-OFF (projector map) = the cluster galaxy at rest, color+labels follow the
 * Group-by picker once strength > 0. No React/DOM/IO.
 */
import type { ColorMode } from "./nodeColors";

export interface MapGroupingInput {
  flagOn: boolean;
  /** Picker selection (flag-OFF). */
  groupBy: string;
  /** Dominant slider dim (flag-ON). */
  groupingDim: string;
  /** Selected group-by strength 0..100 (flag-OFF). */
  strength: number;
  /** Is `id` a colorable registry dimension? (i.e. getDimension(id) != null). */
  hasDim: (id: string) => boolean;
}

export interface MapGroupingResult {
  groupDimId: string;
  colorMode: ColorMode;
  showLabels: boolean;
}

export function resolveMapGrouping(i: MapGroupingInput): MapGroupingResult {
  if (i.flagOn) {
    return {
      groupDimId: i.groupingDim,
      colorMode: (i.hasDim(i.groupingDim) ? i.groupingDim : "role") as ColorMode,
      showLabels: true,
    };
  }
  const grouping = i.strength > 0;
  const colorMode: ColorMode = !grouping
    ? "cluster"
    : ((i.hasDim(i.groupBy) ? i.groupBy : "cluster") as ColorMode);
  return { groupDimId: i.groupBy, colorMode, showLabels: grouping };
}
