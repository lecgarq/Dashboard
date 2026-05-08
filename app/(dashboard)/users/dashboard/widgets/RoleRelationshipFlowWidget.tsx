"use client";

import { useMemo } from "react";
import { Download } from "lucide-react";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/acc/csvExport";
import { useFindings } from "../findingsContext";

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
export function RoleRelationshipFlowWidget(_props: {
  users?: unknown;
  workspaceEmails?: unknown;
}) {
  const findings = useFindings();

  const { nodes, edges, csvRows } = useMemo(() => {
    const dupes = findings.duplicateRoles;
    if (dupes.length === 0) {
      return { nodes: [] as Node[], edges: [] as Edge[], csvRows: [] };
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
      const sevLabel = sev ? ` (${sev})` : "";
      return {
        id: role,
        position: {
          x: Math.cos(theta) * radius,
          y: Math.sin(theta) * radius,
        },
        data: { label: `${role}${sevLabel}` },
        // Default node style; our caller's CSS controls font.
      };
    });
    const edges: Edge[] = dupes.map((d, i) => {
      const intensity = Math.round(d.nameOverlap * 100);
      // Stronger overlap → redder edge; lighter → grey.
      const stroke =
        d.nameOverlap >= 0.95
          ? "#ef4444"
          : d.nameOverlap >= 0.9
            ? "#f59e0b"
            : "#6b7280";
      return {
        id: `e${i}`,
        source: d.roleA,
        target: d.roleB,
        label: `${intensity}%`,
        style: { stroke, strokeWidth: 2 },
        labelStyle: { fontSize: 11, fill: "#374151" },
      };
    });
    const csvRows = dupes.map((d) => ({
      RoleA: d.roleA,
      RoleB: d.roleB,
      NameOverlap: d.nameOverlap.toFixed(2),
      Members: d.affectedMembers.length,
      Modules: d.affectedProjects.length, // placeholder — true module count surfaced via context if needed
    }));
    return { nodes, edges, csvRows };
  }, [findings]);

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
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          panOnDrag
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
