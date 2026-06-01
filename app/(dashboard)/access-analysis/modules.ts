import type { ModuleId } from "./types";

export const MODULES: ReadonlyArray<{ id: ModuleId; label: string; keys: string[] }> = [
  { id: "dataManagement",      label: "Data Management",     keys: ["docs", "documentManagement"] },
  { id: "insight",             label: "Insight",             keys: ["insight"] },
  { id: "build",               label: "Build",               keys: ["build"] },
  { id: "modelCoordination",   label: "Model Coordination",  keys: ["modelCoordination", "model_coordination"] },
  { id: "designCollaboration", label: "Design Collaboration", keys: ["designCollaboration", "design_collaboration"] },
  { id: "preconstruction",     label: "Preconstruction",     keys: ["takeoff", "cost"] },
  { id: "design",              label: "Design",              keys: ["forma"] },
  { id: "autospecs",           label: "AutoSpecs",           keys: ["autoSpecs", "autospecs"] },
  { id: "datum",               label: "Datum",               keys: ["datum"] },
];

const KEY_TO_ID = new Map<string, ModuleId>();
for (const m of MODULES) for (const k of m.keys) KEY_TO_ID.set(k.toLowerCase(), m.id);

export function moduleLabelById(id: ModuleId): string {
  return MODULES.find((m) => m.id === id)?.label ?? id;
}

/** A product row counts as "has access" when accessLevel is anything other than a none/empty value. */
function hasAccess(level: string): boolean {
  const l = level.toLowerCase();
  return l !== "" && l !== "none";
}
function isAdminLevel(level: string): boolean {
  const l = level.toLowerCase();
  return l === "project_admin" || l === "administrator";
}

export function reduceModules(
  products: Array<{ productKey: string; accessLevel: string }>,
): { modules: ModuleId[]; adminModules: ModuleId[] } {
  const modules = new Set<ModuleId>();
  const adminModules = new Set<ModuleId>();
  for (const p of products) {
    const id = KEY_TO_ID.get((p.productKey ?? "").toLowerCase());
    if (!id || !hasAccess(p.accessLevel)) continue;
    modules.add(id);
    if (isAdminLevel(p.accessLevel)) adminModules.add(id);
  }
  return { modules: [...modules], adminModules: [...adminModules] };
}
