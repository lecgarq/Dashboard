export const ACC_MODULE_LABELS: Record<string, string> = {
  documentManagement: "Data Management",
  designCollaboration: "Design Collaboration",
  modelCoordination: "Model Coordination",
  preconstruction: "Preconstruction",
  autoSpecs: "AutoSpecs",
  build: "Build",
  insight: "Insight",
  design: "Design",
};

export function moduleLabel(key: string): string {
  return ACC_MODULE_LABELS[key] ?? key;
}
