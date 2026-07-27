/**
 * Stable role → color assignment shared by the role visuals. The palette + the
 * Unknown/Multiple warning hues match ActivityByRolePieChart, so a role reads
 * the same color in the donut legend and in the Folder Activity bars.
 */
import { chartPalette } from "@/lib/colors/chartPalette";
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "./roleCounts";

export const UNKNOWN_ROLE_COLOR = "#efb628"; // goldenrod
export const MULTIPLE_ROLES_COLOR = "#e0577b"; // wine-rose

/**
 * Map each role name to a stable color, cycling the shared chart palette in
 * input order. Slot N is the same brand family in both themes, so a role keeps
 * its identity across a theme switch.
 */
export function buildRoleColorMap(
  roleNames: ReadonlyArray<string>,
  dark: boolean,
): Map<string, string> {
  const palette = chartPalette(dark);
  const m = new Map<string, string>();
  let hue = 0;
  for (const name of roleNames) {
    if (m.has(name)) continue;
    m.set(
      name,
      name === UNKNOWN_ROLE ? UNKNOWN_ROLE_COLOR
        : name === MULTIPLE_ROLES ? MULTIPLE_ROLES_COLOR
          : palette[hue++ % palette.length],
    );
  }
  return m;
}
