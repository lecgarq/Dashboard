/**
 * Permission level → color, shared by every permission visual.
 *
 * Before this module, PermissionLevelChart and PermissionUsersDonut each kept
 * their own ramp and disagreed: "Full Controller" rendered warm-red in one and
 * salmon in the other, on the same page. A level must read as one color
 * everywhere or the panels cannot be compared.
 *
 * Slots are chosen for MEANING, not rotation order — warm for power tiers,
 * cool for read-mostly tiers — so the ramp still scans strongest → weakest.
 */
import { chartPalette } from "@/lib/colors/chartPalette";
import { PERMISSION_LEVEL_ORDER } from "./permissionLevelCounts";

/** Zinc — the rollup/unrecognized role. Never assigned to a real level. */
export const UNKNOWN_LEVEL_COLOR = "#71717a";

/** Brand slot per level, index-aligned to PERMISSION_LEVEL_ORDER. */
const LEVEL_SLOTS = [
  7, // Full Controller          — warm red
  1, // View+Download+Upload+Edit — naranja
  3, // View+Download+Upload      — goldenrod
  0, // View+Download             — azul
  6, // Upload Only               — sky
  2, // View Only                 — seaweed
] as const;

export function permissionLevelColor(level: string, dark: boolean): string {
  const i = (PERMISSION_LEVEL_ORDER as readonly string[]).indexOf(level);
  return i >= 0 ? chartPalette(dark)[LEVEL_SLOTS[i]] : UNKNOWN_LEVEL_COLOR;
}

export function buildLevelColorMap(
  levels: ReadonlyArray<string>,
  dark: boolean,
): Map<string, string> {
  return new Map(levels.map((l) => [l, permissionLevelColor(l, dark)]));
}
