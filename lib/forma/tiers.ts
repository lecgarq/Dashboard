// lib/forma/tiers.ts
// Forma permission tiers = the six canonical ACC tiers plus a UI-only "No access"
// sentinel for an unassigned cell. Action sets are DERIVED from the canonical
// permissionMapping so they can never drift out of sync.
import { TIER_DEFINITIONS, type PermTier } from "@/lib/acc/permissionMapping";

export const NO_ACCESS = "No access" as const;
export type FormaTier = PermTier | typeof NO_ACCESS;

/** UI order: lowest access first. */
export const FORMA_TIERS: readonly FormaTier[] = [
  NO_ACCESS,
  "View Only",
  "View+Download",
  "Upload Only",
  "View+Download+Upload",
  "View+Download+Upload+Edit",
  "Full Controller",
];

export const TIER_SHORT: Record<FormaTier, string> = {
  "No access": "—",
  "View Only": "View",
  "View+Download": "View+DL",
  "Upload Only": "Upload",
  "View+Download+Upload": "+Upload",
  "View+Download+Upload+Edit": "Edit",
  "Full Controller": "Full",
};

export const TIER_COLOR: Record<FormaTier, string> = {
  "No access": "#52525b", // zinc-600
  "View Only": "#0e7490", // cyan-700
  "View+Download": "#0d9488", // teal-600
  "Upload Only": "#7c3aed", // violet-600
  "View+Download+Upload": "#2563eb", // blue-600
  "View+Download+Upload+Edit": "#d97706", // amber-600
  "Full Controller": "#dc2626", // red-600
};

/** tier → real ACC actions[]. Derived from canonical defs; "No access" = []. */
export const TIER_ACTIONS: Record<FormaTier, readonly string[]> = {
  [NO_ACCESS]: [],
  ...(Object.fromEntries(
    TIER_DEFINITIONS.map((d) => [d.tier, [...d.actions]]),
  ) as Record<PermTier, string[]>),
};
