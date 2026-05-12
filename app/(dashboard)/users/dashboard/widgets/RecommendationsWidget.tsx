"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, pack, type HierarchyCircularNode } from "d3-hierarchy";
import { motion, AnimatePresence } from "framer-motion";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/acc/csvExport";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type {
  DuplicateRoleFinding,
  JunkRoleFinding,
  Severity,
} from "@/lib/acc/dashboardAnalytics";
import { useFindings } from "../findingsContext";
import { useSelection } from "../selectionContext";
import {
  BUBBLE_SPRING,
  useSeverityColor,
  useDashboardAccent,
} from "./_shared/dashboardTokens";
import { useTransition } from "./_shared/useTransition";
import { useHoverSpotlight } from "./_shared/HoverSpotlight";
import { FocusRing } from "./_shared/FocusRing";
import { BubbleSkeleton } from "./_shared/WidgetSkeleton";

/**
 * Phase 04.1 Plan 02 — Recommendations as a severity bubble cluster (DASH-09).
 *
 * Junk findings cluster in the left half; duplicate findings cluster in the right half.
 * Bubble area encodes affected-member count; bubble color encodes severity. No member
 * names rendered anywhere — click opens the existing DashboardSidePanel via
 * `selectionContext` (Phase 04.1 CONTEXT decision).
 */

const W = 600;
const H = 360;
const CENTER_GUTTER = 16;

interface OrphanRoleFinding {
  projectId: string;
  projectName: string;
  roleId: string;
  roleName: string;
  /** Representative folder for click → side panel drilldown */
  representativeFolderId: string;
  representativeFolderPath: string;
  permType: string;
  actions: string[];
  orphanReasons: string[];
}

type Leaf =
  | {
      _kind: "junk";
      _id: string;
      _severity: Severity;
      _value: number;
      _title: string;
      _data: JunkRoleFinding;
    }
  | {
      _kind: "duplicate";
      _id: string;
      _severity: Severity;
      _value: number;
      _title: string;
      _data: DuplicateRoleFinding;
    }
  | {
      // Phase 4 Plan 6 — orphan role finding (carry-forward; Phase 5 DASH MUST NOT re-build)
      _kind: "orphan-role";
      _id: string;
      _severity: Severity;
      _value: number;
      _title: string;
      _data: OrphanRoleFinding;
    };

type PositionedLeaf = Leaf & {
  cx: number;
  cy: number;
  r: number;
};

function junkSuggestedAction(j: JunkRoleFinding): string {
  if (j.severity === "HIGH") {
    return "Delete role — zero members, zero modules, all-inactive >90d";
  }
  const fired: string[] = [];
  if (j.signals.zeroMembers) fired.push("zero members");
  if (j.signals.zeroModules) fired.push("zero modules");
  if (j.signals.allInactive90d) fired.push("all members inactive >90d");
  if (j.severity === "MEDIUM") {
    return `Review for deletion — ${fired.length} signals fired (${fired.join(", ")})`;
  }
  return `Investigate — ${fired.length} signal fired (${fired.join(", ")})`;
}

function duplicateSuggestedAction(d: DuplicateRoleFinding): string {
  const pct = Math.round(d.nameOverlap * 100);
  return `Consider merging '${d.roleA}' and '${d.roleB}' (modules identical, name overlap ${pct}%)`;
}

type PackNode = { _value?: number; children?: PackNode[] } & Partial<Leaf>;

function packHalf(
  leaves: Leaf[],
  width: number,
  height: number,
  offsetX: number,
): PositionedLeaf[] {
  if (leaves.length === 0) return [];
  const rootData: PackNode = { children: leaves as PackNode[] };
  const root = hierarchy<PackNode>(rootData, (n) => n.children).sum(
    (d) => d._value ?? 0,
  );

  const layout = pack<PackNode>().size([width, height]).padding(6);

  const packed = layout(root);
  const result: PositionedLeaf[] = [];
  for (const node of packed.leaves() as HierarchyCircularNode<PackNode>[]) {
    const leaf = node.data as unknown as Leaf;
    result.push({
      ...leaf,
      cx: node.x + offsetX,
      cy: node.y,
      r: node.r,
    });
  }
  return result;
}

export function RecommendationsWidget({
  users,
}: {
  users: BulkAccUser[];
  workspaceEmails?: string[];
}) {
  const findings = useFindings();
  const { selected, setSelected } = useSelection();

  // Phase 4 Plan 6 — orphan role findings (carry-forward; Phase 5 DASH skips this).
  const orphanRolesQuery = trpc.accFolders.getOrphanRoles.useQuery(undefined, {
    staleTime: 5 * 60_000,
    enabled: false,
  });
  const severityColor = useSeverityColor();
  const accent = useDashboardAccent();
  const transition = useTransition(BUBBLE_SPRING);
  const { getOpacity, bind, hoveredId } = useHoverSpotlight();
  const [focusIndex, setFocusIndex] = useState<number>(-1);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Build orphan-role findings: one per (projectId, roleId) with role_zero_members.
  const orphanLeaves = useMemo<Leaf[]>(() => {
    const rows = orphanRolesQuery.data?.rows ?? [];
    // Group rows that have 'role_zero_members' into a unique (projectId, roleId) finding.
    const byKey = new Map<string, OrphanRoleFinding>();
    for (const r of rows) {
      if (!r.orphanReasons.includes("role_zero_members")) continue;
      const key = `${r.projectId}::${r.roleId}`;
      if (byKey.has(key)) continue;
      byKey.set(key, {
        projectId: r.projectId,
        projectName: r.projectName,
        roleId: r.roleId,
        roleName: r.roleName,
        representativeFolderId: r.folderId,
        representativeFolderPath: r.folderPath,
        permType: r.permType,
        actions: r.actions,
        orphanReasons: r.orphanReasons,
      });
    }
    return Array.from(byKey.values()).map<Leaf>((f) => ({
      _kind: "orphan-role" as const,
      _id: `${f.projectId}::${f.roleId}`,
      _severity: "MEDIUM" as Severity,
      _value: 1,
      _title: `${f.roleName} has zero members on ${f.projectName} folders`,
      _data: f,
    }));
  }, [orphanRolesQuery.data]);

  // Build leaves once per findings change.
  const leaves = useMemo<{ junk: Leaf[]; duplicate: Leaf[] }>(() => {
    const junk: Leaf[] = findings.junkRoles.map((j) => ({
      _kind: "junk" as const,
      _id: j.role,
      _severity: j.severity,
      _value: Math.max(1, j.affectedMembers.length),
      _title: j.role,
      _data: j,
    }));
    const duplicate: Leaf[] = [
      ...findings.duplicateRoles.map<Leaf>((d) => ({
        _kind: "duplicate" as const,
        _id: `${d.roleA}|${d.roleB}`,
        _severity: "MEDIUM" as Severity,
        _value: Math.max(1, d.affectedMembers.length),
        _title: `${d.roleA} ↔ ${d.roleB}`,
        _data: d,
      })),
      // Orphan roles share the right-half cluster alongside duplicates (both are "review" findings).
      ...orphanLeaves,
    ];
    return { junk, duplicate };
  }, [findings, orphanLeaves]);

  // Pack two halves (deterministic per Pitfall (b) in plan).
  const positioned = useMemo<PositionedLeaf[]>(() => {
    const halfW = (W - CENTER_GUTTER) / 2;
    const left = packHalf(leaves.junk, halfW, H, 0);
    const right = packHalf(
      leaves.duplicate,
      halfW,
      H,
      halfW + CENTER_GUTTER,
    );
    return [...left, ...right];
  }, [leaves]);

  // Module lookup for CSV.
  const moduleLookup = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const u of users) m.set(u.email, new Set(u.allModules));
    return m;
  }, [users]);

  // Keep focusIndex in bounds when data changes.
  useEffect(() => {
    if (focusIndex >= positioned.length) {
      setFocusIndex(positioned.length === 0 ? -1 : positioned.length - 1);
    }
  }, [positioned.length, focusIndex]);

  function handleSelect(leaf: PositionedLeaf) {
    if (leaf._kind === "junk") {
      setSelected({ kind: "junk", finding: leaf._data });
    } else if (leaf._kind === "duplicate") {
      setSelected({ kind: "duplicate", finding: leaf._data });
    } else {
      // orphan-role → open folder-permission side panel with representative folder.
      const d = leaf._data;
      setSelected({
        kind: "folderPermission",
        folderId: d.representativeFolderId,
        folderPath: d.representativeFolderPath,
        roleId: d.roleId,
        roleName: d.roleName,
        projectId: d.projectId,
        projectName: d.projectName,
        permType: d.permType,
        actions: d.actions,
        orphanReasons: d.orphanReasons,
      });
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (positioned.length === 0) return;
    // Pitfall 2 — block bubble up to SortableWidget drag handler so Enter doesn't drag.
    const k = event.key;
    if (
      k === "ArrowRight" ||
      k === "ArrowDown" ||
      k === "ArrowLeft" ||
      k === "ArrowUp" ||
      k === "Enter" ||
      k === " "
    ) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (k === "ArrowRight" || k === "ArrowDown") {
      setFocusIndex((i) => (i + 1) % positioned.length);
    } else if (k === "ArrowLeft" || k === "ArrowUp") {
      setFocusIndex((i) =>
        i <= 0 ? positioned.length - 1 : i - 1,
      );
    } else if (k === "Enter" || k === " ") {
      const target = positioned[focusIndex >= 0 ? focusIndex : 0];
      if (target) handleSelect(target);
    }
  }

  function isSelectedLeaf(leaf: PositionedLeaf): boolean {
    if (!selected) return false;
    if (selected.kind === "junk" && leaf._kind === "junk") {
      return selected.finding.role === leaf._data.role;
    }
    if (selected.kind === "duplicate" && leaf._kind === "duplicate") {
      return (
        selected.finding.roleA === leaf._data.roleA &&
        selected.finding.roleB === leaf._data.roleB
      );
    }
    if (selected.kind === "folderPermission" && leaf._kind === "orphan-role") {
      return (
        selected.projectId === leaf._data.projectId &&
        selected.roleId === leaf._data.roleId
      );
    }
    return false;
  }

  function leafOpacity(leaf: PositionedLeaf): number {
    if (isSelectedLeaf(leaf)) return 1;
    return getOpacity(`${leaf._kind}:${leaf._id}`);
  }

  function handleDownload() {
    const allLeaves: Leaf[] = [...leaves.junk, ...leaves.duplicate];
    const csvRows = allLeaves.map((leaf) => {
      if (leaf._kind === "junk") {
        const j = leaf._data;
        // LOCKED column order — DASH-13.
        let modules = "";
        if (!j.signals.zeroModules) {
          const mods = new Set<string>();
          for (const email of j.affectedMembers) {
            const set = moduleLookup.get(email);
            if (set) for (const m of set) mods.add(m);
          }
          modules = [...mods].sort().join(", ");
        }
        return {
          Type: "Junk",
          Severity: j.severity,
          Roles: j.role,
          Members: j.affectedMembers.length,
          Modules: modules,
          SuggestedAction: junkSuggestedAction(j),
        };
      }
      if (leaf._kind === "orphan-role") {
        const o = leaf._data;
        return {
          Type: "OrphanRole",
          Severity: "MEDIUM" as Severity,
          Roles: `${o.roleName} (${o.projectName})`,
          Members: 0,
          Modules: "",
          SuggestedAction: `Remove role '${o.roleName}' folder permissions on '${o.projectName}' — role has zero members in project`,
        };
      }
      const d = leaf._data;
      const mods = new Set<string>();
      for (const email of d.affectedMembers) {
        const set = moduleLookup.get(email);
        if (set) for (const m of set) mods.add(m);
      }
      return {
        Type: "Duplicate",
        Severity: "MEDIUM" as Severity,
        Roles: `${d.roleA}, ${d.roleB}`,
        Members: d.affectedMembers.length,
        Modules: [...mods].sort().join(", "),
        SuggestedAction: duplicateSuggestedAction(d),
      };
    });
    downloadCsv("recommendations.csv", csvRows);
  }

  // Loading sentinel: empty findings AND zero users (Pattern 3 sentinel from FindingsProvider).
  const isLoading = users.length === 0 && positioned.length === 0;

  // Header
  const header = (
    <div className="flex items-center justify-end">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={positioned.length === 0}
      >
        <Download className="mr-2 size-4" />
        Download CSV
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        <BubbleSkeleton width={W} height={H} />
      </div>
    );
  }

  if (positioned.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        <div
          className="flex items-center justify-center text-sm text-muted-foreground"
          style={{ height: H }}
        >
          No recommendations — all roles healthy
        </div>
      </div>
    );
  }

  const focusedLeaf =
    focusIndex >= 0 && focusIndex < positioned.length
      ? positioned[focusIndex]
      : null;

  // Hover-or-focus union for FocusRing rendering on selection too.
  const selectedLeaf = positioned.find(isSelectedLeaf) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {header}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto outline-none"
        role="img"
        aria-roledescription="severity bubble cluster"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (focusIndex < 0 && positioned.length > 0) setFocusIndex(0);
        }}
      >
        <title>
          {leaves.junk.length} junk findings, {leaves.duplicate.length} duplicate findings
        </title>
        <AnimatePresence>
          {positioned.map((leaf, i) => {
            const id = `${leaf._kind}:${leaf._id}`;
            const isSelected = isSelectedLeaf(leaf);
            const isFocused = focusIndex === i;
            const fill = severityColor[leaf._severity];
            const opacity = leafOpacity(leaf);
            const scale = isSelected ? 1.04 : 1;
            const memberCount =
              leaf._kind === "junk"
                ? leaf._data.affectedMembers.length
                : leaf._kind === "duplicate"
                  ? leaf._data.affectedMembers.length
                  : 0; // orphan-role: zero members by definition
            return (
              <g
                key={id}
                role="button"
                tabIndex={-1}
                aria-label={`${leaf._severity} severity, ${leaf._title}, ${memberCount} members`}
                style={{ cursor: "pointer", outline: "none" }}
                {...bind(id)}
                onClick={() => handleSelect(leaf)}
              >
                <motion.circle
                  layoutId={`recommendations:${leaf._kind}:${leaf._id}`}
                  initial={{ opacity: 0, scale: 0.4, cx: leaf.cx, cy: leaf.cy, r: leaf.r }}
                  animate={{
                    opacity,
                    scale,
                    cx: leaf.cx,
                    cy: leaf.cy,
                    r: leaf.r,
                  }}
                  exit={{ opacity: 0, scale: 0.4 }}
                  transition={transition}
                  fill={fill}
                  stroke="rgba(0,0,0,0.15)"
                  strokeWidth={1}
                  style={{ transformOrigin: `${leaf.cx}px ${leaf.cy}px` }}
                />
              </g>
            );
          })}
        </AnimatePresence>
        {/* FocusRing overlays — keep above bubbles, pointer-events:none */}
        {focusedLeaf && (
          <FocusRing
            shape="circle"
            cx={focusedLeaf.cx}
            cy={focusedLeaf.cy}
            r={focusedLeaf.r + 3}
            visible
          />
        )}
        {selectedLeaf && selectedLeaf !== focusedLeaf && (
          <FocusRing
            shape="circle"
            cx={selectedLeaf.cx}
            cy={selectedLeaf.cy}
            r={selectedLeaf.r + 3}
            visible
          />
        )}
        {/* Hover ring (subtle) — only when distinct from selection/focus */}
        {hoveredId && (() => {
          const hovered = positioned.find(
            (l) => `${l._kind}:${l._id}` === hoveredId,
          );
          if (!hovered) return null;
          if (hovered === focusedLeaf || hovered === selectedLeaf) return null;
          return (
            <circle
              cx={hovered.cx}
              cy={hovered.cy}
              r={hovered.r + 1}
              fill="none"
              stroke={accent.highlight}
              strokeOpacity={0.45}
              strokeWidth={1.5}
              style={{ pointerEvents: "none" }}
            />
          );
        })()}
      </svg>
    </div>
  );
}
