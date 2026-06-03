// Canonical display names for the 8 ACC modules LECG uses. ACC's HQ Admin API
// returns product keys in snake_case / lowercase (e.g. `docs`, `design_collaboration`);
// some other places in the codebase historically used camelCase (`documentManagement`).
// We accept both, normalize on lookup, and fall through to the raw key for anything we
// don't recognize (e.g. `cost`, `takeoff`) so it's still visible rather than silently dropped.

export const ACC_MODULE_LABELS: Record<string, string> = {
  // ACC HQ Admin API product keys (snake_case / lowercase) - what the API actually returns
  docs: "Forma Data Management",
  design_collaboration: "Design Collaboration",
  model_coordination: "Model Coordination",
  preconstruction: "Preconstruction",
  autospecs: "AutoSpecs",
  autoSpecs: "AutoSpecs",
  build: "Build",
  insight: "Insight",
  design: "Design",
  cost: "Cost Management",
  forma: "Forma",
  takeoff: "Takeoff",

  // camelCase variants - legacy data or alternate API shapes
  documentManagement: "Forma Data Management",
  designCollaboration: "Design Collaboration",
  modelCoordination: "Model Coordination",
};

// Pre-normalized map for case-insensitive / separator-insensitive lookup
const NORMALIZED_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(ACC_MODULE_LABELS).map(([k, v]) => [k.toLowerCase().replace(/_/g, ""), v])
);

export function moduleLabel(key: string): string {
  if (!key) return key;
  const direct = ACC_MODULE_LABELS[key];
  if (direct) return direct;
  return NORMALIZED_LABELS[key.toLowerCase().replace(/_/g, "")] ?? key;
}
