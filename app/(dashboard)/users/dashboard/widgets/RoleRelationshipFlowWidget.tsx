"use client";

import { useMemo } from "react";
import { Download } from "lucide-react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/acc/csvExport";
import type { Severity } from "@/lib/acc/dashboardAnalytics";
import { useFindings } from "../findingsContext";
import { useSelection } from "../selectionContext";
import {
  HOVER_OPACITY_DIM,
  HOVER_OPACITY_FOCUS,
  useDashboardAccent,
  useSeverityColor,
  type SeverityColorMap,
} from "./_shared/dashboardTokens";
import { createContext, useContext } from "react";

/**
 * Role-relationship flow widget (DASH-04 visualization).
 *
 * Renders one node per role appearing in any DuplicateRoleFinding, plus one edge per
 * duplicate pair labeled with the name-overlap percentage. Roles not involved in any
 * duplicate finding are intentionally omitted to keep the diagram readable.
 *
 * Layout: simple circle (cos/sin) — avoids pulling in dagre. Position is deterministic
 * per role-set so reorders stay stable.
 *
 * Library: `@xyflow/react@12.10.2` (NOT the deprecated `reactflow` package — see RESEARCH.md
 * State of the Art).
 */
/**
 * Custom node renderer — inline severity badge (DASH-09 "wherever else they appear").
 * Reads severity from node `data` (populated from findings.roleSeverityIndex).
 */
type RoleNodeData = { role: string; severity: Severity | undefined };

/**
 * Severity palette is themed via `useSeverityColor()` at the widget root and
 * pushed to custom node renderers through a tiny context — xyflow's NodeProps
 * doesn't accept hooks at the renderer site (renderers re-mount on every
 * data-shape change), and threading the resolved colors through node `data`
 * would require rebuilding nodes on theme toggle. Context is the cheap path.
 */
type FlowPalette = {
  severity: SeverityColorMap;
  neutral: string; // used for LOW (matches dashboard "low / neutral" treatment)
  edgeLabel: string;
};
const FlowPaletteContext = createContext<FlowPalette | null>(null);

function RoleFlowNode({ data }: NodeProps) {
  const d = data as RoleNodeData;
  const sev = d.severity;
  const palette = useContext(FlowPaletteContext);
  const sevColor = (level: Severity): string => {
    if (!palette) return "transparent"; // SSR / pre-mount safety
    if (level === "HIGH") return palette.severity.HIGH;
    if (level === "MEDIUM") return palette.severity.MEDIUM;
    return palette.neutral; // LOW resolves to neutral, matching heatmap rich-text
  };
  const dotColor = sev ? sevColor(sev) : "transparent";
  return (
    <div
      className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm"
      style={{ minWidth: 120 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="flex items-center gap-2">
        {sev && (
          <span
            aria-label={`severity ${sev}`}
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
        )}
        <span className="font-medium">{d.role}</span>
        {sev && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
            style={{ backgroundColor: `${dotColor}22`, color: dotColor }}
          >
            {sev}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { role: RoleFlowNode };

export function RoleRelationshipFlowWidget(_props: {
  users?: unknown;
  workspaceEmails?: unknown;
}) {
  const findings = useFindings();
  const { selected, setSelected } = useSelection();
  const sevPalette = useSeverityColor();
  const accent = useDashboardAccent();

  const palette: FlowPalette = useMemo(
    () => ({
      severity: sevPalette,
      neutral: accent.neutral,
      // Edge label fill — neutral foreground, theme-aware. Falls back to the
      // neutral accent (intentional: neutral grid/label color, not themed
      // severity).
      edgeLabel: accent.neutral,
    }),
    [sevPalette, accent],
  );

  // Selection spotlight target — when a role is selected upstream (via heatmap,
  // bubble cluster, etc.), dim non-matching flow nodes to HOVER_OPACITY_DIM.
  const selectedRole = selected?.kind === "role" ? selected.role : null;

  const { nodes, edges, csvRows, dupeByEdge } = useMemo(() => {
    const dupes = findings.duplicateRoles;
    if (dupes.length === 0) {
      return {
        nodes: [] as Node[],
        edges: [] as Edge[],
        csvRows: [],
        dupeByEdge: new Map<string, (typeof dupes)[number]>(),
      };
    }
    const roleSet = new Set<string>();
    for (const d of dupes) {
      roleSet.add(d.roleA);
      roleSet.add(d.roleB);
    }
    const roles = [...roleSet].sort();
    const radius = Math.max(160, roles.length * 28);
    const nodes: Node[] = roles.map((role, i) => {
      const theta = (i / roles.length) * Math.PI * 2;
      const sev = findings.roleSeverityIndex.get(role);
      const dimmed = selectedRole !== null && selectedRole !== role;
      return {
        id: role,
        type: "role",
        position: {
          x: Math.cos(theta) * radius,
          y: Math.sin(theta) * radius,
        },
        data: { role, severity: sev } satisfies RoleNodeData,
        style: {
          opacity: dimmed ? HOVER_OPACITY_DIM : HOVER_OPACITY_FOCUS,
          transition: "opacity 200ms ease-out",
        },
      };
    });
    const dupeByEdge = new Map<string, (typeof dupes)[number]>();
    const edges: Edge[] = dupes.map((d, i) => {
      const intensity = Math.round(d.nameOverlap * 100);
      // Edge stroke severity sourced from `_shared/dashboardTokens` so a
      // duplicate at 95%+ name-overlap renders the SAME red as the HIGH bubble
      // and the HIGH heatmap dot.
      const stroke =
        d.nameOverlap >= 0.95
          ? palette.severity.HIGH
          : d.nameOverlap >= 0.9
            ? palette.severity.MEDIUM
            : palette.neutral;
      const id = `e${i}`;
      const edgeDimmed =
        selectedRole !== null && selectedRole !== d.roleA && selectedRole !== d.roleB;
      dupeByEdge.set(id, d);
      return {
        id,
        source: d.roleA,
        target: d.roleB,
        label: `${intensity}%`,
        style: {
          stroke,
          strokeWidth: 2,
          opacity: edgeDimmed ? HOVER_OPACITY_DIM : HOVER_OPACITY_FOCUS,
        },
        labelStyle: { fontSize: 11, fill: palette.edgeLabel },
      };
    });
    const csvRows = dupes.map((d) => ({
      RoleA: d.roleA,
      RoleB: d.roleB,
      NameOverlap: d.nameOverlap.toFixed(2),
      Members: d.affectedMembers.length,
      Modules: d.affectedProjects.length, // placeholder — true module count surfaced via context if needed
    }));
    return { nodes, edges, csvRows, dupeByEdge };
  }, [findings, palette, selectedRole]);

  const handleNodeClick: NodeMouseHandler = (_e, node) => {
    const role = node.id;
    const sev = findings.roleSeverityIndex.get(role);
    setSelected({ kind: "role", role, severity: sev });
  };

  const handleEdgeClick: EdgeMouseHandler = (_e, edge) => {
    const finding = dupeByEdge.get(edge.id);
    if (finding) setSelected({ kind: "duplicate", finding });
  };

  function handleDownload() {
    downloadCsv("role-relationships.csv", csvRows);
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-end">
          <Button variant="outline" size="sm" disabled>
            <Download className="mr-2 size-4" />
            Download CSV
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          No duplicate-role pairs detected.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{nodes.length} roles</Badge>
          <Badge variant="secondary">{edges.length} pairs</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="mr-2 size-4" />
          Download CSV
        </Button>
      </div>
      <div style={{ height: 400 }} className="rounded-md border">
        <FlowPaletteContext.Provider value={palette}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            panOnDrag
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </FlowPaletteContext.Provider>
      </div>
    </div>
  );
}
