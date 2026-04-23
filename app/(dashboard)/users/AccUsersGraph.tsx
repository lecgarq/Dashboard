"use client";

import { useRef, useEffect, useState, useMemo, useCallback, useLayoutEffect } from "react";
import { cn } from "@/lib/core/utils";
import { type BulkAccUser } from "./AccAnalysisPanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserNode {
  kind: "user";
  id: string;         // email
  label: string;      // first name or initials
  email: string;
  name: string;
  projectCount: number;
  hasNoProjects: boolean;
  isHubAdmin: boolean;
  roles: string[];
  allRoles: string[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface RoleNode {
  kind: "role";
  id: string;         // "role:" + roleName
  label: string;      // role name (truncated)
  roleName: string;
  userCount: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

type SimNode = UserNode | RoleNode;

interface Edge {
  source: string;     // node id
  target: string;     // node id
  color: string;
  dashed: boolean;
  weight: number;
}

interface TooltipState {
  x: number;
  y: number;
  node: SimNode;
}

interface SidePanelState {
  node: SimNode;
  roleUsers?: string[];    // for role nodes
}

export interface AccUsersGraphProps {
  users: BulkAccUser[];
  onSelectUser?: (email: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_RADIUS = 14;
const ROLE_BASE_RADIUS = 14;
const ROLE_MAX_RADIUS = 28;
const USER_COLOR_NORMAL = "#6366f1";
const USER_COLOR_NO_PROJECTS = "#f59e0b";
const USER_COLOR_HUB_ADMIN = "#10b981";
const ROLE_COLOR = "#8b5cf6";
const EDGE_COLOR = "rgba(139, 92, 246, 0.25)";
const SIM_ITERATIONS = 200;
const REPULSION = 3500;
const ATTRACTION = 0.08;
const DAMPING = 0.7;
const CENTER_GRAVITY = 0.04;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFirstName(name: string, email: string): string {
  if (name && name.trim()) {
    return name.split(" ")[0].slice(0, 10);
  }
  // initials from email
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

function isHubAdmin(user: BulkAccUser): boolean {
  return user.allRoles.some((r) =>
    r.toLowerCase().includes("hub admin") ||
    r.toLowerCase().includes("account admin") ||
    r.toLowerCase().includes("administrator")
  );
}

function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

// ---------------------------------------------------------------------------
// Spring simulation (no d3)
// ---------------------------------------------------------------------------

function runSimulation(
  nodes: SimNode[],
  edges: Edge[],
  width: number,
  height: number
): SimNode[] {
  const nodeMap = new Map<string, SimNode>();
  // Work on copies so we don't mutate React state mid-render
  const ns: SimNode[] = nodes.map((n) => ({ ...n }));
  for (const n of ns) nodeMap.set(n.id, n);

  const cx = width / 2;
  const cy = height / 2;

  for (let iter = 0; iter < SIM_ITERATIONS; iter++) {
    // Reset forces
    const fx = new Float64Array(ns.length);
    const fy = new Float64Array(ns.length);

    // 1. Repulsion between all node pairs
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const dx = ns[j].x - ns[i].x || 0.01;
        const dy = ns[j].y - ns[i].y || 0.01;
        const dist2 = dx * dx + dy * dy;
        const dist = Math.sqrt(dist2) || 0.01;
        const force = REPULSION / dist2;
        const fx_ = (dx / dist) * force;
        const fy_ = (dy / dist) * force;
        fx[i] -= fx_;
        fy[i] -= fy_;
        fx[j] += fx_;
        fy[j] += fy_;
      }
    }

    // 2. Attraction along edges
    const idxMap = new Map(ns.map((n, i) => [n.id, i]));
    for (const e of edges) {
      const si = idxMap.get(e.source);
      const ti = idxMap.get(e.target);
      if (si == null || ti == null) continue;
      const dx = ns[ti].x - ns[si].x;
      const dy = ns[ti].y - ns[si].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = dist * ATTRACTION * e.weight;
      const fx_ = (dx / dist) * f;
      const fy_ = (dy / dist) * f;
      fx[si] += fx_;
      fy[si] += fy_;
      fx[ti] -= fx_;
      fy[ti] -= fy_;
    }

    // 3. Gravity toward center (prevents nodes flying off)
    for (let i = 0; i < ns.length; i++) {
      fx[i] += (cx - ns[i].x) * CENTER_GRAVITY;
      fy[i] += (cy - ns[i].y) * CENTER_GRAVITY;
    }

    // 4. Integrate
    for (let i = 0; i < ns.length; i++) {
      ns[i].vx = (ns[i].vx + fx[i]) * DAMPING;
      ns[i].vy = (ns[i].vy + fy[i]) * DAMPING;
      ns[i].x += ns[i].vx;
      ns[i].y += ns[i].vy;

      // Clamp to canvas bounds
      const r = ns[i].radius;
      ns[i].x = Math.max(r + 4, Math.min(width - r - 4, ns[i].x));
      ns[i].y = Math.max(r + 4, Math.min(height - r - 4, ns[i].y));
    }
  }

  return ns;
}

// ---------------------------------------------------------------------------
// Build nodes + edges from BulkAccUser[]
// ---------------------------------------------------------------------------

function buildGraph(
  users: BulkAccUser[],
  width: number,
  height: number
): { nodes: SimNode[]; edges: Edge[] } {
  const cachedUsers = users.filter((u) => u.found);
  const cx = width / 2;
  const cy = height / 2;

  // Role frequency for radius scaling
  const roleFreq = new Map<string, number>();
  for (const u of cachedUsers) {
    for (const r of u.allRoles) {
      roleFreq.set(r, (roleFreq.get(r) ?? 0) + 1);
    }
  }
  const maxRoleFreq = Math.max(1, ...roleFreq.values());

  // Create role nodes
  const roleNodes = new Map<string, RoleNode>();
  let ri = 0;
  const roleList = [...roleFreq.keys()];
  for (const role of roleList) {
    const count = roleFreq.get(role)!;
    const angle = (ri / roleList.length) * Math.PI * 2;
    const spread = Math.min(width, height) * 0.28;
    const radius = ROLE_BASE_RADIUS + ((count / maxRoleFreq) * (ROLE_MAX_RADIUS - ROLE_BASE_RADIUS));
    roleNodes.set(role, {
      kind: "role",
      id: `role:${role}`,
      label: truncate(role, 12),
      roleName: role,
      userCount: count,
      x: cx + Math.cos(angle) * spread,
      y: cy + Math.sin(angle) * spread,
      vx: 0,
      vy: 0,
      radius,
      color: ROLE_COLOR,
    });
    ri++;
  }

  // Create user nodes — random initial position
  const userNodes: UserNode[] = cachedUsers.map((u, i) => {
    const angle = (i / cachedUsers.length) * Math.PI * 2;
    const r = Math.min(width, height) * 0.15 + (Math.random() * 60 - 30);
    const color = isHubAdmin(u)
      ? USER_COLOR_HUB_ADMIN
      : u.hasNoProjects
        ? USER_COLOR_NO_PROJECTS
        : USER_COLOR_NORMAL;

    return {
      kind: "user",
      id: u.email,
      label: getFirstName(u.name, u.email),
      email: u.email,
      name: u.name,
      projectCount: u.projectCount,
      hasNoProjects: u.hasNoProjects,
      isHubAdmin: isHubAdmin(u),
      roles: u.allRoles,
      allRoles: u.allRoles,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      radius: USER_RADIUS,
      color,
    };
  });

  const nodes: SimNode[] = [...userNodes, ...roleNodes.values()];

  // Build edges: user -> role
  const edges: Edge[] = [];
  for (const u of userNodes) {
    for (const role of u.allRoles) {
      const rn = roleNodes.get(role);
      if (!rn) continue;
      edges.push({
        source: u.id,
        target: rn.id,
        color: EDGE_COLOR,
        dashed: false,
        weight: 1,
      });
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Diamond path helper for role nodes
// ---------------------------------------------------------------------------

function diamondPath(x: number, y: number, r: number): string {
  return `M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AccUsersGraph({ users, onSelectUser }: AccUsersGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 600 });
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [simulationDone, setSimulationDone] = useState(false);

  // Controls
  const [showRoles, setShowRoles] = useState(true);
  const [highlightOutliers, setHighlightOutliers] = useState(false);
  const [highlightNoProjects, setHighlightNoProjects] = useState(false);

  // Interaction
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Tooltip + side panel
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [selectedNode, setSelectedNode] = useState<SidePanelState | null>(null);

  // Pulse animation tick
  const [pulseTick, setPulseTick] = useState(0);
  useEffect(() => {
    if (!highlightOutliers && !highlightNoProjects) return;
    const id = setInterval(() => setPulseTick((t) => t + 1), 600);
    return () => clearInterval(id);
  }, [highlightOutliers, highlightNoProjects]);

  // Resize observer
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 50 && height > 50) {
        setDimensions({ width, height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Build + run simulation when users or dimensions change
  useEffect(() => {
    if (!users.length || dimensions.width < 100) return;
    setSimulationDone(false);

    const { nodes: rawNodes, edges: rawEdges } = buildGraph(users, dimensions.width, dimensions.height);
    setEdges(rawEdges);

    // Run simulation in a microtask to avoid blocking render
    const timeoutId = setTimeout(() => {
      const settled = runSimulation(rawNodes, rawEdges, dimensions.width, dimensions.height);
      setNodes(settled);
      setSimulationDone(true);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [users, dimensions]);

  // Role user lookup map
  const roleUserMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const u of users) {
      if (!u.found) continue;
      for (const role of u.allRoles) {
        const list = m.get(role) ?? [];
        list.push(u.name || u.email);
        m.set(role, list);
      }
    }
    return m;
  }, [users]);

  // Visible nodes (filter roles if showRoles is off)
  const visibleNodes = useMemo(() => {
    if (showRoles) return nodes;
    return nodes.filter((n) => n.kind !== "role");
  }, [nodes, showRoles]);

  const visibleEdges = useMemo(() => {
    if (showRoles) return edges;
    return [];
  }, [edges, showRoles]);

  // SVG transform string
  const transform = `translate(${pan.x}, ${pan.y}) scale(${zoom})`;

  // Hit test: find which node is at (svgX, svgY)
  function hitTest(svgX: number, svgY: number): SimNode | null {
    // Inverse transform: from viewport coords to graph coords
    const gx = (svgX - pan.x) / zoom;
    const gy = (svgY - pan.y) / zoom;

    for (const n of visibleNodes) {
      const dx = gx - n.x;
      const dy = gy - n.y;
      if (dx * dx + dy * dy <= n.radius * n.radius * 1.5) {
        return n;
      }
    }
    return null;
  }

  function getSvgCoords(e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const { x, y } = getSvgCoords(e);

    if (isPanning) {
      const dx = x - panStart.current.x;
      const dy = y - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
      return;
    }

    const hit = hitTest(x, y);
    if (hit) {
      setTooltip({ x, y, node: hit });
    } else {
      setTooltip(null);
    }
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const { x, y } = getSvgCoords(e);
    const hit = hitTest(x, y);
    if (!hit) {
      setIsPanning(true);
      panStart.current = { x, y, panX: pan.x, panY: pan.y };
    }
  }

  function handleMouseUp(e: React.MouseEvent<SVGSVGElement>) {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    const { x, y } = getSvgCoords(e);
    const hit = hitTest(x, y);
    if (hit) {
      if (hit.kind === "user") {
        setSelectedNode({ node: hit });
      } else {
        const rn = hit as RoleNode;
        setSelectedNode({ node: rn, roleUsers: roleUserMap.get(rn.roleName) ?? [] });
      }
    } else {
      setSelectedNode(null);
    }
  }

  function handleMouseLeave() {
    setTooltip(null);
    if (isPanning) setIsPanning(false);
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.2, Math.min(5, z * delta)));
  }

  function resetLayout() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    // Re-run simulation
    if (!users.length || dimensions.width < 100) return;
    setSimulationDone(false);
    const { nodes: rawNodes, edges: rawEdges } = buildGraph(users, dimensions.width, dimensions.height);
    setEdges(rawEdges);
    setTimeout(() => {
      const settled = runSimulation(rawNodes, rawEdges, dimensions.width, dimensions.height);
      setNodes(settled);
      setSimulationDone(true);
    }, 0);
  }

  // Determine if a user node is an "outlier" for highlighting
  function isOutlier(n: UserNode): boolean {
    // Outlier: has roles that only appear once globally, or zero roles
    if (n.allRoles.length === 0) return true;
    return n.allRoles.every((r) => {
      const freq = roleUserMap.get(r)?.length ?? 0;
      return freq <= 1;
    });
  }

  const pulseOn = pulseTick % 2 === 0;

  if (!users.length) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No ACC data available. Load ACC data in the ACC Analysis tab first.
      </div>
    );
  }

  return (
    <div className="flex h-full gap-0 relative">
      {/* Main graph area */}
      <div ref={containerRef} className="flex-1 relative bg-[hsl(var(--card))] rounded-xl border border-border/30 overflow-hidden">
        {/* Controls overlay */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 items-end">
          <div className="flex gap-1">
            <ControlButton active={showRoles} onClick={() => setShowRoles((v) => !v)}>
              {showRoles ? "Hide Roles" : "Show Roles"}
            </ControlButton>
            <ControlButton active={highlightOutliers} onClick={() => setHighlightOutliers((v) => !v)}>
              Outliers
            </ControlButton>
            <ControlButton active={highlightNoProjects} onClick={() => setHighlightNoProjects((v) => !v)}>
              No Projects
            </ControlButton>
            <ControlButton active={false} onClick={resetLayout}>
              Reset
            </ControlButton>
          </div>
          <div className="text-[10px] text-muted-foreground/60 pr-1">
            Scroll to zoom &bull; drag to pan &bull; click node for details
          </div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 bg-card/80 backdrop-blur-sm border border-border/30 rounded-xl px-3 py-2">
          <LegendDot color={USER_COLOR_NORMAL} label="User" />
          <LegendDot color={USER_COLOR_HUB_ADMIN} label="Hub Admin" />
          <LegendDot color={USER_COLOR_NO_PROJECTS} label="No Projects" />
          {showRoles && <LegendDiamond color={ROLE_COLOR} label="Role" />}
        </div>

        {/* Loading state */}
        {!simulationDone && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/50 backdrop-blur-sm z-20">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-xs">Running layout simulation...</span>
            </div>
          </div>
        )}

        {/* SVG Graph */}
        <svg
          className={cn("w-full h-full", isPanning ? "cursor-grabbing" : "cursor-default")}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
        >
          {/* Grid lines */}
          <defs>
            <pattern id="acc-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#acc-grid)" />

          <g transform={transform}>
            {/* Edges */}
            {visibleEdges.map((e, i) => {
              const src = nodes.find((n) => n.id === e.source);
              const tgt = nodes.find((n) => n.id === e.target);
              if (!src || !tgt) return null;
              return (
                <line
                  key={i}
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
                  stroke={e.color}
                  strokeWidth={0.8}
                  strokeDasharray={e.dashed ? "4 3" : undefined}
                />
              );
            })}

            {/* Role nodes (diamonds) */}
            {visibleNodes
              .filter((n): n is RoleNode => n.kind === "role")
              .map((n) => (
                <g key={n.id}>
                  <path
                    d={diamondPath(n.x, n.y, n.radius)}
                    fill={n.color}
                    fillOpacity={0.85}
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth={1}
                    className="transition-opacity"
                  />
                  {n.radius > 16 && (
                    <text
                      x={n.x}
                      y={n.y + 1}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={8}
                      fill="rgba(255,255,255,0.85)"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {n.label}
                    </text>
                  )}
                </g>
              ))}

            {/* User nodes (circles) */}
            {visibleNodes
              .filter((n): n is UserNode => n.kind === "user")
              .map((n) => {
                const pulseOutlier = highlightOutliers && isOutlier(n);
                const pulseNP = highlightNoProjects && n.hasNoProjects;
                const shouldPulse = pulseOutlier || pulseNP;

                return (
                  <g key={n.id}>
                    {/* Pulse ring */}
                    {shouldPulse && (
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={n.radius + (pulseOn ? 6 : 3)}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        strokeOpacity={pulseOn ? 0.7 : 0.3}
                        style={{ transition: "r 0.5s ease, stroke-opacity 0.5s ease" }}
                      />
                    )}
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={n.radius}
                      fill={n.color}
                      fillOpacity={0.9}
                      stroke="rgba(255,255,255,0.2)"
                      strokeWidth={1.2}
                    />
                    <text
                      x={n.x}
                      y={n.y + 1}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={7}
                      fontWeight="600"
                      fill="rgba(255,255,255,0.92)"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {n.label.slice(0, 4)}
                    </text>
                  </g>
                );
              })}
          </g>
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-30 pointer-events-none bg-card/95 backdrop-blur-sm border border-border/50 rounded-xl px-3 py-2 shadow-xl max-w-[220px]"
            style={{
              left: tooltip.x + 14,
              top: tooltip.y - 10,
              transform: tooltip.x > dimensions.width * 0.7 ? "translateX(-110%)" : undefined,
            }}
          >
            {tooltip.node.kind === "user" ? (
              <UserTooltip node={tooltip.node as UserNode} />
            ) : (
              <RoleTooltip node={tooltip.node as RoleNode} />
            )}
          </div>
        )}
      </div>

      {/* Side panel */}
      {selectedNode && (
        <SidePanel
          state={selectedNode}
          onClose={() => setSelectedNode(null)}
          onViewProfile={
            selectedNode.node.kind === "user"
              ? () => {
                  onSelectUser?.((selectedNode.node as UserNode).email);
                  setSelectedNode(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ControlButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all",
        active
          ? "bg-primary/20 text-primary border-primary/30"
          : "bg-card/80 backdrop-blur-sm text-muted-foreground border-border/40 hover:text-foreground hover:border-border"
      )}
    >
      {children}
    </button>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}

function LegendDiamond({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M5 0 L10 5 L5 10 L0 5 Z" fill={color} />
      </svg>
      {label}
    </div>
  );
}

function UserTooltip({ node }: { node: UserNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-foreground">{node.name || node.email}</p>
      <p className="text-[10px] text-muted-foreground">{node.email}</p>
      <div className="flex flex-wrap gap-1 pt-0.5">
        <span className="text-[10px] text-muted-foreground">
          {node.projectCount} project{node.projectCount !== 1 ? "s" : ""}
        </span>
        {node.isHubAdmin && (
          <span className="text-[10px] text-emerald-400">Hub Admin</span>
        )}
        {node.hasNoProjects && (
          <span className="text-[10px] text-amber-400">No projects</span>
        )}
      </div>
      {node.allRoles.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Roles: {node.allRoles.slice(0, 3).join(", ")}{node.allRoles.length > 3 ? ` +${node.allRoles.length - 3}` : ""}
        </p>
      )}
    </div>
  );
}

function RoleTooltip({ node }: { node: RoleNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-foreground">{node.roleName}</p>
      <p className="text-[10px] text-muted-foreground">{node.userCount} user{node.userCount !== 1 ? "s" : ""}</p>
    </div>
  );
}

function SidePanel({
  state,
  onClose,
  onViewProfile,
}: {
  state: SidePanelState;
  onClose: () => void;
  onViewProfile?: () => void;
}) {
  const n = state.node;

  return (
    <div className="w-64 shrink-0 ml-3 bg-card rounded-xl border border-border/30 p-4 flex flex-col gap-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground truncate">
          {n.kind === "user" ? (n as UserNode).name || (n as UserNode).email : (n as RoleNode).roleName}
        </h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {n.kind === "user" && (() => {
        const u = n as UserNode;
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground break-all">{u.email}</p>

            {/* Status badges */}
            <div className="flex flex-wrap gap-1.5">
              {u.isHubAdmin && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                  Hub Admin
                </span>
              )}
              {u.hasNoProjects && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                  No Projects
                </span>
              )}
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {u.projectCount} project{u.projectCount !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Roles */}
            {u.allRoles.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Roles</p>
                <div className="flex flex-wrap gap-1">
                  {u.allRoles.map((r) => (
                    <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {onViewProfile && (
              <button
                onClick={onViewProfile}
                className="w-full text-xs font-medium py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all"
              >
                View Profile
              </button>
            )}
          </div>
        );
      })()}

      {n.kind === "role" && (() => {
        const r = n as RoleNode;
        const roleUsers = state.roleUsers ?? [];
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              {r.userCount} user{r.userCount !== 1 ? "s" : ""} with this role
            </p>
            {roleUsers.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Users</p>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {roleUsers.map((name) => (
                    <div key={name} className="text-[11px] text-foreground px-2 py-1 rounded-lg bg-background/40">
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
