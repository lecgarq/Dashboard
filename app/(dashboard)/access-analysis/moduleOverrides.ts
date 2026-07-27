// Implementation moved to lib/acc/activityClassification.ts (BND-02).
// This barrel preserves the UI import path so ModulesPieChart, moduleCounts,
// and any other existing importers continue to resolve without change.
export { classifyActivity, donutModules, GROUP_ORDER, UNMAPPED_MODULE } from "@/lib/acc/activityClassification";
