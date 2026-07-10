/**
 * folderTerrain.ts — barrel for the folder-permission terrain modules
 * (moved from app/(dashboard)/access-analysis/ so lib/server consumers no
 * longer reach into app/; the route keeps a compatibility barrel).
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
