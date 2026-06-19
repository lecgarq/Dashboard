/**
 * Stable role → color assignment shared by the role visuals. The palette + the
 * Unknown/Multiple warning hues match ActivityByRolePieChart, so a role reads
 * the same color in the donut legend and in the Folder Activity bars.
 */
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "./roleCounts";

export const ROLE_PALETTE = [
  "#6366f1", "#22d3ee", "#34d399", "#10b981", "#3b82f6", "#a78bfa",
  "#2dd4bf", "#facc15", "#38bdf8", "#c084fc", "#4ade80", "#818cf8",
  "#5eead4", "#fdba74", "#93c5fd", "#d8b4fe", "#86efac", "#67e8f9",
  "#fde047", "#f0abfc", "#a5b4fc", "#bef264", "#7dd3fc", "#fca5a5",
];
export const UNKNOWN_ROLE_COLOR = "#f59e0b"; // amber
export const MULTIPLE_ROLES_COLOR = "#fb7185"; // rose

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
