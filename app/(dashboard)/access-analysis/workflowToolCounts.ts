/**
 * Pure transform for the Reviews / Transmittals / RFIs / Submittals
 * workflow-tool donuts (Projects tab).
 * Buckets `ModuleActivityRow[]` (from loadWorkflowToolsAction)
 * into one summary per tool: slices are ACTION TYPES sized by volume, each
 * carrying its per-project breakdown for the click-to-drill.
 *
 * Group membership is decided by `classifyActivity` (the same taxonomy the
 * module donut uses) — the loader's SQL prefilter is a superset, so anything
 * classified outside the three target groups is dropped here. No React/DOM/IO.
 */
import { classifyActivity } from "./moduleOverrides";
import type { ModuleActivityRow } from "@/lib/acc/moduleCountsTypes";

/** The ACC workflow tools this view covers, in display order. */
export const WORKFLOW_TOOLS = ["Reviews", "Transmittals", "RFIs", "Submittals"] as const;
export type WorkflowTool = (typeof WORKFLOW_TOOLS)[number];

/** One action type within a tool, with its per-project drill payload. */
export interface WorkflowActionSlice {
  label: string; // human label from the taxonomy
  value: number;
  /** Per-project counts behind this action, volume desc. Account-level rows
   *  (projectId "") appear under their own "Account-level" entry. */
  projects: Array<{ projectId: string; name: string; value: number }>;
}

export interface WorkflowToolSummary {
  tool: WorkflowTool;
  /** Action types with volume > 0, sorted desc (tiebreak label). */
  slices: WorkflowActionSlice[];
  total: number;
  /** Distinct real projects with any activity for this tool. */
  projectCount: number;
}

const TOOL_SET = new Set<string>(WORKFLOW_TOOLS);

export function summarizeWorkflowTools(
  rows: ReadonlyArray<ModuleActivityRow>,
): Record<WorkflowTool, WorkflowToolSummary> {
  // tool -> label -> { value, byProject }
  const agg = new Map<WorkflowTool, Map<string, { value: number; byProject: Map<string, { name: string; value: number }> }>>();
  const projects = new Map<WorkflowTool, Set<string>>();
  for (const tool of WORKFLOW_TOOLS) {
    agg.set(tool, new Map());
    projects.set(tool, new Set());
  }

  for (const row of rows) {
    const { label, group } = classifyActivity(row.rawAction, row.service);
    if (!TOOL_SET.has(group)) continue;
    const tool = group as WorkflowTool;
    const byLabel = agg.get(tool)!;
    const entry = byLabel.get(label) ?? { value: 0, byProject: new Map() };
    entry.value += row.count;
    const proj = entry.byProject.get(row.projectId) ?? { name: row.projectName, value: 0 };
    proj.value += row.count;
    entry.byProject.set(row.projectId, proj);
    byLabel.set(label, entry);
    if (row.projectId !== "") projects.get(tool)!.add(row.projectId);
  }

  const out = {} as Record<WorkflowTool, WorkflowToolSummary>;
  for (const tool of WORKFLOW_TOOLS) {
    const slices: WorkflowActionSlice[] = [...agg.get(tool)!.entries()]
      .map(([label, e]) => ({
        label,
        value: e.value,
        projects: [...e.byProject.entries()]
          .map(([projectId, p]) => ({ projectId, name: p.name, value: p.value }))
          .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    out[tool] = {
      tool,
      slices,
      total: slices.reduce((sum, s) => sum + s.value, 0),
      projectCount: projects.get(tool)!.size,
    };
  }
  return out;
}
