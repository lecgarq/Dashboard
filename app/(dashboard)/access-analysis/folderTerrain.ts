/**
 * folderTerrain.ts — thin re-export barrel (REF-01 SPLIT-01 complete)
 *
 * Preserves every import path that existed before the split — callers importing
 * from "../folderTerrain" or "@/app/(dashboard)/access-analysis/folderTerrain"
 * continue to resolve all symbols unchanged.
 *
 * Module boundaries:
 *   folderTerrainModel   — data contract types + tier/rank/colour + ordering
 *                          + iso-geometry primitives + Pt + TERRAIN
 *   folderTerrainLayout  — fixed iso layout (buildTerrainLayout) + compare
 *                          mode (buildSharedAxes / projectOntoAxes / buildStackedTerrain)
 *   folderTerrainScene   — rotatable axonometric scene (buildScene) + shared
 *                          scene primitives (culling / lighting / SceneFace /
 *                          SceneBar / TerrainScene)
 *   folderTerrainCamera  — orthographic camera (buildCameraScene) + floating-
 *                          plane compare (buildStackedScenes) + Camera helpers
 */

export * from "./folderTerrainModel";
export * from "./folderTerrainLayout";
export * from "./folderTerrainScene";
export * from "./folderTerrainCamera";
