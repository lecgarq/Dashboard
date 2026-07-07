/**
 * Stable role → color assignment shared by the role visuals. The palette + the
 * Unknown/Multiple warning hues match ActivityByRolePieChart, so a role reads
 * the same color in the donut legend and in the Folder Activity bars.
 */
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "./roleCounts";

export const ROLE_PALETTE = [
  "#5e96ce", "#e8763f", "#21a3b0", "#d2a012", "#bc74a4", "#8fa65a",
  "#4fabc9", "#e06a62", "#86b3dc", "#f09a6f", "#55bcc7", "#e5bc4c",
  "#cd94bb", "#abbd7c", "#7cc2da", "#ea928c", "#abcbe8", "#f6bc9d",
  "#8ad2da", "#f0d384", "#dfb5d2", "#c6d3a0", "#a8d8e8", "#f2b7b3",
];
export const UNKNOWN_ROLE_COLOR = "#efb628"; // goldenrod
export const MULTIPLE_ROLES_COLOR = "#e0577b"; // wine-rose

/** Map each role name to a stable color, cycling ROLE_PALETTE in input order. */
export function buildRoleColorMap(roleNames: ReadonlyArray<string>): Map<string, string> {
  const m = new Map<string, string>();
  let hue = 0;
  for (const name of roleNames) {
    if (m.has(name)) continue;
    m.set(
      name,
      name === UNKNOWN_ROLE ? UNKNOWN_ROLE_COLOR
        : name === MULTIPLE_ROLES ? MULTIPLE_ROLES_COLOR
          : ROLE_PALETTE[hue++ % ROLE_PALETTE.length],
    );
  }
  return m;
}
