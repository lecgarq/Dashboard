/**
 * riskFlags.ts — Pure computation of boolean risk PRIMITIVES (not a weighted score).
 * Phase A computes the combos that only need already-available fields; Phase D feeds
 * in real permissionStrength / folderBreadth / activityTotal. Inputs absent in Phase A
 * default to 0, so their flags evaluate to false. No registry descriptor (plan constraint).
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";

/** A folder reach at/above this many distinct folders is "broad". Tunable in P6. */
export const BROAD_FOLDER_THRESHOLD = 25;
/** Activity volume at/above this total is "high". Aligns with bucketActivity High (>100). */
const HIGH_ACTIVITY_THRESHOLD = 100;
/** permissionStrength at/above this is "high permission" (edit=4, control=5). */
const HIGH_PERMISSION_STRENGTH = 4;

export interface RiskInput {
  isExternal: boolean;
  isAdmin: boolean;
  signinBucket: NodeFeatureSnapshot["signinBucket"];
  accountStatus: string;
  /** True when the instance retains access (member of an active project). */
  hasAccess: boolean;
  permissionStrength: number;
  folderBreadth: number;
  activityTotal: number;
}

export type RiskFlags = NonNullable<NodeFeatureSnapshot["riskFlags"]>;

export function computeRiskFlags(i: RiskInput): RiskFlags {
  const cold = i.signinBucket === ">90d";
  const highPerm = i.permissionStrength >= HIGH_PERMISSION_STRENGTH;
  return {
    externalHighPerm: i.isExternal && highPerm,
    staleButActive: cold && i.accountStatus === "active" && i.hasAccess,
    externalProjectAdmin: i.isExternal && i.isAdmin,
    broadFolderAccess: i.folderBreadth >= BROAD_FOLDER_THRESHOLD,
    highActivityHighPerm: i.activityTotal >= HIGH_ACTIVITY_THRESHOLD && highPerm,
  };
}

/** Count of true primitives, 0..5. */
export function riskScoreFromFlags(flags: RiskFlags): number {
  return Object.values(flags).filter(Boolean).length;
}
