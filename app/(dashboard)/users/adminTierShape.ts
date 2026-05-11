/**
 * Pure mapper from BulkAccUser admin flags to visual tier properties.
 * Phase 5.1 — GRAPH-03 admin overlay.
 *
 * Cosmos.gl PointShape enum (verified from node_modules/@cosmos.gl/graph/dist/index.d.ts:163-164):
 *   0 = Circle, 1 = Square, 2 = Triangle, 3 = Diamond, 4 = Pentagon,
 *   5 = Hexagon, 6 = Star, 7 = Cross, 8 = None
 *
 * Tier precedence: hub > project > executive > none
 */

export type AdminTier = "hub" | "project" | "executive" | "none";

export interface AdminTierVisual {
  tier: AdminTier;
  /** Logical shape name — maps to cosmos.gl PointShape via adminTierShapeEnum() */
  shape: "star" | "diamond" | "ring" | "circle";
  /** Multiplier applied on top of the node's baseline size */
  sizeMultiplier: number;
  /** CSS hex colour for the halo ring overlay, null when no halo */
  haloColor: string | null;
}

/**
 * Returns the visual properties for a user based on their admin flags.
 * Precedence: hub (isAccountAdmin) > project > executive > none.
 */
export function adminTierFor(user: {
  isAccountAdmin?: boolean;
  projectAdmin?: boolean;
  executive?: boolean;
}): AdminTierVisual {
  if (user.isAccountAdmin) {
    return { tier: "hub", shape: "star", sizeMultiplier: 1.5, haloColor: "#FFD700" };
  }
  if (user.projectAdmin) {
    return { tier: "project", shape: "diamond", sizeMultiplier: 1.0, haloColor: null };
  }
  if (user.executive) {
    return { tier: "executive", shape: "ring", sizeMultiplier: 1.0, haloColor: null };
  }
  return { tier: "none", shape: "circle", sizeMultiplier: 1.0, haloColor: null };
}

/**
 * Returns the cosmos.gl PointShape integer for use in a Float32Array passed to
 * setPointShapes(). Matches the verified enum above.
 *
 *   hub      → 6 (Star)
 *   project  → 3 (Diamond)
 *   executive → 0 (Circle — ring effect applied via color-buffer modulation)
 *   none     → 0 (Circle)
 */
export function adminTierShapeEnum(tier: AdminTier): number {
  switch (tier) {
    case "hub":
      return 6; // Star
    case "project":
      return 3; // Diamond
    case "executive":
      return 0; // Circle (ring overlay via halo pass)
    case "none":
      return 0; // Circle
  }
}
