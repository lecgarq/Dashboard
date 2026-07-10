/**
 * folderTerrain.ts — thin re-export barrel (REF-01 SPLIT-01 complete)
 *
 * Preserves every import path that existed before the split — callers importing
 * from "../folderTerrain" or "@/app/(dashboard)/access-analysis/folderTerrain"
 * continue to resolve all symbols unchanged.
 *
 * The four terrain modules moved to lib/acc/ (BND-03 group-3 cleanup) so
 * lib/server consumers import them without a lib→app reverse dependency.
 */

export * from "@/lib/acc/folderTerrain";
