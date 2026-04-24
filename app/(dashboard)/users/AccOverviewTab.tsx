"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/core/utils";
import { moduleLabel } from "@/lib/acc/modules";
import type { BulkAccUser } from "@/lib/acc/acc-types";

// ---------------------------------------------------------------------------
// Helpers & constants
// ---------------------------------------------------------------------------

function countBy<T>(arr: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of arr) {
    const key = String(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

const PALETTE = [
  "#6366f1", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899", "#14b8a6",
  "#f97316", "#8b5cf6", "#06b6d4", "#84cc16", "#ef4444", "#a78bfa",
  "#fb923c", "#34d399", "#60a5fa", "#fbbf24",
];

const MODULE_COLORS = [
  "#06b6d4", "#3b82f6", "#8b5cf6", "#22c55e",
  "#f59e0b", "#ec4899", "#f97316", "#84cc16", "#14b8a6",
];

function rad(deg: number) { return (deg * Math.PI) / 180; }

function arcPath(
  cx: number, cy: number,
  outerR: number, innerR: number,
  startDeg: number, endDeg: number,
  popPx = 0,
): string {
  const midDeg = (startDeg + endDeg) / 2;
  const dx = popPx * Math.cos(rad(midDeg));
  const dy = popPx * Math.sin(rad(midDeg));
  const pt = (deg: number, r: number) => ({
    x: cx + dx + r * Math.cos(rad(deg)),
    y: cy + dy + r * Math.sin(rad(deg)),
  });
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const A = pt(startDeg, outerR);
  const B = pt(endDeg, outerR);
  const C = pt(endDeg, innerR);
  const D = pt(startDeg, innerR);
  return `M${A.x},${A.y} A${outerR},${outerR},0,${large},1,${B.x},${B.y} L${C.x},${C.y} A${innerR},${innerR},0,${large},0,${D.x},${D.y}Z`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface PieSlice { id: string; label: string; value: number; color: string; }

function InteractivePie({
  slices, size = 210, innerR = 58, selected, onSelect, centerLabel = "total",
}: {
  slices: PieSlice[]; size?: number; innerR?: number;
  selected: string | null; onSelect: (id: string | null) => void; centerLabel?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const cx = size / 2, cy = size / 2, outerR = size / 2 - 12, POP = 11;
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  let angle = -90;
  const computed = slices.map((s) => {
    const sweep = (s.value / total) * 360;
    const start = angle;
    angle += sweep;
    return { ...s, start, end: angle };
  });
  const activeId = hovered ?? selected;
  const activeSlice = computed.find((s) => s.id === activeId);
  return (
    <div className="flex gap-5 items-center flex-wrap">
      <div className="relative shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
          {computed.map((s) => {
            const isActive = activeId === s.id;
            const dim = !!activeId && !isActive;
            return (
              <path
                key={s.id}
                d={arcPath(cx, cy, outerR, innerR, s.start, s.end, isActive ? POP : 0)}
                fill={s.color}
                opacity={dim ? 0.25 : 1}
                className="cursor-pointer"
                style={{ transition: "opacity 0.15s, filter 0.15s", filter: isActive ? `drop-shadow(0 0 7px ${s.color}88)` : undefined }}
                onMouseEnter={() => setHovered(s.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(selected === s.id ? null : s.id)}
              />
            );
          })}
          <text x={cx} y={cy - 7} textAnchor="middle" fontSize="22" fontWeight="800"
            fill={activeSlice ? activeSlice.color : "currentColor"}
            className={activeSlice ? "" : "text-foreground"}
            style={{ transition: "fill 0.2s" }}>
            {activeSlice ? activeSlice.value : total}
          </text>
          <text x={cx} y={cy + 11} textAnchor="middle" fontSize="9.5" fill="currentColor" className="text-muted-foreground">
            {activeSlice ? `${Math.round((activeSlice.value / total) * 100)}% of total` : centerLabel}
          </text>
          {activeSlice && (
            <text x={cx} y={cy + 26} textAnchor="middle" fontSize="8.5" fill="currentColor" className="text-muted-foreground">
              {activeSlice.label.length > 18 ? activeSlice.label.slice(0, 16) + "..." : activeSlice.label}
            </text>
          )}
        </svg>
      </div>
      <div className="flex-1 min-w-[160px] space-y-0.5 max-h-[220px] overflow-y-auto pr-1">
        {computed.map((s) => {
          const pct = Math.round((s.value / total) * 100);
          const isActive = activeId === s.id;
          const dim = !!activeId && !isActive;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(selected === s.id ? null : s.id)}
              onMouseEnter={() => setHovered(s.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ opacity: dim ? 0.3 : 1, transition: "opacity 0.15s" }}
              className={cn(
                "w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg transition-colors",
                isActive ? "bg-white/8 ring-1 ring-white/10" : "hover:bg-white/5",
              )}
            >
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-xs text-foreground truncate flex-1 min-w-0">{s.label}</span>
              <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: s.color }}>{pct}%</span>
              <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right shrink-0">{s.value}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionCard({ title, badge, children, className, accent }: {
  title: string; badge?: React.ReactNode; children: React.ReactNode; className?: string; accent?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-2xl border bg-card p-5",
      accent ? "border-violet-500/25 shadow-[0_0_24px_rgba(139,92,246,0.07)]" : "border-border/30",
      className,
    )}>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

function HBar({ label, value, max, color, sublabel }: {
  label: string; value: number; max: number; color: string; sublabel?: string;
}) {
  const w = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs gap-2">
        <span className="text-foreground truncate flex-1 min-w-0" title={label}>{label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
          <span className="tabular-nums font-bold text-foreground">{value}</span>
        </div>
      </div>
      <div className="h-3 rounded-full bg-muted/20 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

const DR = 26, DC = 2 * Math.PI * DR;

function DonutRing({ value, total, color, label, sublabel }: {
  value: number; total: number; color: string; label: string; sublabel: string;
}) {
  const pct = total > 0 ? value / total : 0;
  const dash = pct * DC;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="70" height="70" viewBox="0 0 70 70">
        <circle cx="35" cy="35" r={DR} fill="none" stroke="currentColor" strokeWidth="7" className="text-muted/20" />
        <circle cx="35" cy="35" r={DR} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${DC - dash}`} strokeLinecap="round" transform="rotate(-90 35 35)" />
        <text x="35" y="32" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor" className="text-foreground">
          {Math.round(pct * 100)}%
        </text>
        <text x="35" y="44" textAnchor="middle" fontSize="7.5" fill="currentColor" className="text-muted-foreground">
          {value}/{total}
        </text>
      </svg>
      <div className="text-center">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground">{sublabel}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccOverviewTab
// ---------------------------------------------------------------------------

interface AccOverviewTabProps {
  users: BulkAccUser[];
  onSelectUser?: (email: string) => void;
}

export function AccOverviewTab({ users, onSelectUser }: AccOverviewTabProps) {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [expandedOtherRole, setExpandedOtherRole] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [showCombos, setShowCombos] = useState(false);
  const [showOutliers, setShowOutliers] = useState(false);
  const [showNoProjects, setShowNoProjects] = useState(false);

  const metrics = useMemo(() => {
    const cachedUsers = users.filter((u) => u.found);
    const notFoundUsers = users.filter((u) => !u.found);

    const roleFreqMap = new Map<string, Array<{ name: string; email: string }>>();
    for (const u of cachedUsers) {
      for (const role of u.allRoles) {
        const list = roleFreqMap.get(role) ?? [];
        list.push({ name: u.name || u.email, email: u.email });
        roleFreqMap.set(role, list);
      }
    }

    const usersWithDuplicateRoles = cachedUsers.filter((u) => {
      const counts = countBy(u.projects.flatMap((p) => p.roles));
      return Object.values(counts).some((c) => c > 1);
    });

    const usersWithMultiRoleProjects = cachedUsers.filter((u) =>
      u.projects.some((p) => p.roles.length > 1)
    );

    const roleCombos = new Map<string, number>();
    for (const u of cachedUsers) {
      for (const p of u.projects) {
        if (p.roles.length > 1) {
          const key = [...p.roles].sort().join(" + ");
          roleCombos.set(key, (roleCombos.get(key) ?? 0) + 1);
        }
      }
    }

    const moduleAdoptionMap = new Map<string, number>();
    const projectAnalysisMap = new Map<string, {
      id: string; name: string; status: string;
      users: { email: string; name: string; roles: string[]; modules: string[]; isAdmin: boolean }[];
      roleCounts: Map<string, number>;
      moduleCounts: Map<string, number>;
    }>();
    let totalProjectSlots = 0;
    const allProjectIds = new Set<string>();

    for (const u of cachedUsers) {
      for (const p of u.projects) {
        totalProjectSlots++;
        allProjectIds.add(p.id);
        const entry = projectAnalysisMap.get(p.id) ?? {
          id: p.id, name: p.name, status: p.status, users: [],
          roleCounts: new Map<string, number>(), moduleCounts: new Map<string, number>(),
        };
        entry.users.push({ email: u.email, name: u.name || u.email, roles: p.roles, modules: p.modules, isAdmin: p.isAdmin });
        for (const role of p.roles) entry.roleCounts.set(role, (entry.roleCounts.get(role) ?? 0) + 1);
        for (const mod of p.modules) {
          entry.moduleCounts.set(mod, (entry.moduleCounts.get(mod) ?? 0) + 1);
          moduleAdoptionMap.set(mod, (moduleAdoptionMap.get(mod) ?? 0) + 1);
        }
        projectAnalysisMap.set(p.id, entry);
      }
    }

    const adminUsers = cachedUsers.filter((u) => u.adminCount > 0);
    const activeUsers = cachedUsers.filter((u) => u.activeCount > 0);

    const moduleFingerprints = new Map<string, { count: number; example: string }>();
    for (const u of cachedUsers) {
      for (const p of u.projects) {
        const fp = [...p.modules].sort().join("|");
        if (!fp) continue;
        const ex = moduleFingerprints.get(fp);
        if (ex) { ex.count++; } else {
          moduleFingerprints.set(fp, { count: 1, example: `${u.name || u.email} / ${p.name}` });
        }
      }
    }
    const outlierFingerprints = [...moduleFingerprints.entries()]
      .filter(([, v]) => v.count === 1)
      .map(([fp, v]) => ({ fp, example: v.example, mods: fp.split("|") }))
      .sort((a, b) => b.mods.length - a.mods.length);

    const noProjectUsers = users.filter((u) => u.hasNoProjects && !!u.syncedAt);
    const topProjects = [...projectAnalysisMap.values()]
      .map((project) => ({
        ...project,
        slotCount: project.users.length,
        roleBreakdown: [...project.roleCounts.entries()].sort((a, b) => b[1] - a[1]),
        moduleBreakdown: [...project.moduleCounts.entries()].sort((a, b) => b[1] - a[1]),
      }))
      .sort((a, b) => b.slotCount - a.slotCount || a.name.localeCompare(b.name));

    return {
      totalUsers: users.length,
      totalCachedUsers: cachedUsers.length,
      notFoundUsers,
      adminUsers,
      activeUsers,
      totalProjects: allProjectIds.size,
      totalProjectSlots,
      topProjects,
      roleFreqMap,
      usersWithDuplicateRoles,
      usersWithMultiRoleProjects,
      sortedRoleCombos: [...roleCombos.entries()].sort((a, b) => b[1] - a[1]),
      moduleAdoptionMap,
      outlierFingerprints,
      noProjectUsers,
    };
  }, [users]);

  const rolePieSlices = useMemo<PieSlice[]>(() => {
    const sorted = [...metrics.roleFreqMap.entries()].sort((a, b) => b[1].length - a[1].length);
    const top = sorted.slice(0, 14);
    const rest = sorted.slice(14);
    const slices: PieSlice[] = top.map(([role, users], i) => ({
      id: role, label: role, value: users.length, color: PALETTE[i % PALETTE.length],
    }));
    if (rest.length > 0) {
      slices.push({ id: "__other__", label: `Other (${rest.length} roles)`, value: rest.reduce((s, [, u]) => s + u.length, 0), color: "#475569" });
    }
    return slices;
  }, [metrics.roleFreqMap]);

  const hiddenRoleEntries = useMemo(() => {
    const visible = new Set(rolePieSlices.filter((s) => s.id !== "__other__").map((s) => s.id));
    return [...metrics.roleFreqMap.entries()].filter(([role]) => !visible.has(role)).sort((a, b) => b[1].length - a[1].length);
  }, [metrics.roleFreqMap, rolePieSlices]);

  const modulePieSlices = useMemo<PieSlice[]>(() => {
    return [...metrics.moduleAdoptionMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([mod, count], i) => ({ id: mod, label: moduleLabel(mod), value: count, color: MODULE_COLORS[i % MODULE_COLORS.length] }));
  }, [metrics.moduleAdoptionMap]);

  const selectedRoleUsers = selectedRole && selectedRole !== "__other__"
    ? (metrics.roleFreqMap.get(selectedRole) ?? [])
    : [];

  const selectedModuleCount = selectedModule ? metrics.moduleAdoptionMap.get(selectedModule) ?? 0 : 0;
  const maxComboCount = metrics.sortedRoleCombos[0]?.[1] ?? 1;

  return (
    <div className="space-y-5">

      {/* Coverage rings */}
      <div className="rounded-2xl border border-border/30 bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Organization Coverage</h3>
        <div className="flex flex-wrap justify-around gap-6 py-1">
          <DonutRing value={metrics.totalCachedUsers} total={metrics.totalUsers} color="#3b82f6" label="ACC Coverage" sublabel="users synced" />
          <DonutRing value={metrics.activeUsers.length} total={metrics.totalCachedUsers} color="#22c55e" label="Active Users" sublabel="have active projects" />
          <DonutRing value={metrics.adminUsers.length} total={metrics.totalCachedUsers} color="#f59e0b" label="Admin Users" sublabel="admin on >=1 project" />
          <DonutRing value={metrics.usersWithDuplicateRoles.length} total={metrics.totalCachedUsers} color="#ef4444" label="Duplicate Roles" sublabel="same role, multi-project" />
        </div>
        {metrics.notFoundUsers.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/30">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-2">
              Not found in ACC ({metrics.notFoundUsers.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {metrics.notFoundUsers.slice(0, 12).map((u) => (
                <Badge key={u.email} variant="secondary" className="text-[10px]">{u.name || u.email}</Badge>
              ))}
              {metrics.notFoundUsers.length > 12 && (
                <Badge variant="secondary" className="text-[10px] text-muted-foreground">+{metrics.notFoundUsers.length - 12} more</Badge>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Charts row: role + module side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard
          title="Role Distribution"
          badge={
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20 font-semibold">
              {rolePieSlices.length > 1 && rolePieSlices.at(-1)?.id === "__other__" ? rolePieSlices.length - 1 : rolePieSlices.length} roles
            </span>
          }
          accent
        >
          {rolePieSlices.length === 0 ? (
            <p className="text-xs text-muted-foreground">No roles found in cached data.</p>
          ) : (
            <>
              <InteractivePie slices={rolePieSlices} size={200} innerR={56} selected={selectedRole}
                onSelect={(role) => { setSelectedRole(role); setExpandedOtherRole(null); }} centerLabel="users assigned" />
              {selectedRole && selectedRole !== "__other__" && selectedRoleUsers.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/30">
                  <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: rolePieSlices.find((s) => s.id === selectedRole)?.color }} />
                    {selectedRole}
                    <span className="text-muted-foreground font-normal">- {selectedRoleUsers.length} user{selectedRoleUsers.length !== 1 ? "s" : ""}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRoleUsers.map((u) => (
                      <button
                        key={u.email}
                        onClick={() => onSelectUser?.(u.email)}
                        className={cn("text-[10px] px-2 py-0.5 rounded-full border bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors", onSelectUser && "cursor-pointer")}
                      >
                        {u.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {selectedRole === "__other__" && hiddenRoleEntries.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/30">
                  <p className="text-xs font-semibold text-foreground mb-2">
                    Hidden Roles <span className="text-muted-foreground font-normal">({hiddenRoleEntries.length})</span>
                  </p>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                    {hiddenRoleEntries.map(([role, roleUsers]) => (
                      <div key={role} className="rounded-lg border border-border/30 bg-background/40">
                        <button
                          onClick={() => setExpandedOtherRole((c) => c === role ? null : role)}
                          className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left"
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            {expandedOtherRole === role ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            <span className="text-xs text-foreground truncate">{role}</span>
                          </span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">{roleUsers.length}</Badge>
                        </button>
                        {expandedOtherRole === role && (
                          <div className="px-2.5 pb-2 flex flex-wrap gap-1.5">
                            {roleUsers.map((u) => (
                              <button
                                key={u.email}
                                onClick={() => onSelectUser?.(u.email)}
                                className={cn("text-[10px] px-2 py-0.5 rounded-full border bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors", onSelectUser && "cursor-pointer")}
                              >
                                {u.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/50 mt-3">Hover to highlight - click to drill down</p>
            </>
          )}
        </SectionCard>

        <SectionCard
          title="Module Adoption"
          badge={
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 font-semibold">
              {modulePieSlices.length} modules
            </span>
          }
        >
          {modulePieSlices.length === 0 ? (
            <p className="text-xs text-muted-foreground">No module data in cached records.</p>
          ) : (
            <>
              <InteractivePie slices={modulePieSlices} size={200} innerR={56} selected={selectedModule} onSelect={setSelectedModule} centerLabel="project-slots" />
              {selectedModule && (
                <div className="mt-4 pt-4 border-t border-border/30">
                  <p className="text-xs text-muted-foreground">
                    Active in {selectedModuleCount} of {metrics.totalProjectSlots} project-slots
                    {metrics.totalProjectSlots > 0 && ` (${Math.round((selectedModuleCount / metrics.totalProjectSlots) * 100)}%)`}
                  </p>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/50 mt-3">Counts how many project-slots have each module enabled</p>
            </>
          )}
        </SectionCard>
      </div>

      {/* Top Projects */}
      {metrics.topProjects.length > 0 && (
        <SectionCard
          title="Top Projects"
          badge={<Badge variant="secondary" className="text-[10px]">{metrics.totalProjectSlots} project-slots</Badge>}
        >
          <div className="space-y-2">
            {metrics.topProjects.slice(0, 12).map((project) => (
              <div key={project.id} className="rounded-xl border border-border/30 bg-background/40">
                <button
                  onClick={() => setExpandedProjectId((c) => c === project.id ? null : project.id)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {expandedProjectId === project.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="text-sm font-medium text-foreground truncate">{project.name}</span>
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-foreground shrink-0">{project.slotCount}</span>
                </button>
                {expandedProjectId === project.id && (
                  <div className="px-3 pb-3 space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {project.roleBreakdown.map(([role, count]) => (
                        <Badge key={role} variant="secondary" className="text-[10px] bg-violet-500/10 text-violet-400 border-violet-500/20">
                          {role}: {count}
                        </Badge>
                      ))}
                      {project.moduleBreakdown.map(([mod, count]) => (
                        <Badge key={mod} variant="secondary" className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                          {moduleLabel(mod)}: {count}
                        </Badge>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
                      {project.users.map((user) => (
                        <button
                          key={`${project.id}:${user.email}`}
                          onClick={() => onSelectUser?.(user.email)}
                          className={cn(
                            "rounded-lg bg-card/60 border border-border/20 px-2 py-1.5 text-left transition-colors",
                            onSelectUser && "hover:bg-card hover:border-border/40 cursor-pointer",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-foreground truncate">{user.name}</span>
                            {user.isAdmin && <span className="text-[9px] text-emerald-400 font-semibold shrink-0">ADMIN</span>}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {metrics.topProjects.length > 12 && (
              <p className="text-[10px] text-muted-foreground">+{metrics.topProjects.length - 12} more projects</p>
            )}
          </div>
        </SectionCard>
      )}

      {/* Multi-Role in Same Project */}
      {metrics.usersWithMultiRoleProjects.length > 0 && (
        <SectionCard
          title="Multi-Role in Same Project"
          badge={<Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">{metrics.usersWithMultiRoleProjects.length} users</Badge>}
        >
          {metrics.sortedRoleCombos.length > 0 && (
            <div className="mb-5">
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-3">Most Common Role Combinations</p>
              <div className="space-y-2.5">
                {metrics.sortedRoleCombos.slice(0, 12).map(([combo, count]) => (
                  <HBar key={combo} label={combo} value={count} max={maxComboCount} color="#f59e0b"
                    sublabel={`${count} project${count !== 1 ? "s" : ""}`} />
                ))}
                {metrics.sortedRoleCombos.length > 12 && (
                  <p className="text-[10px] text-muted-foreground">+{metrics.sortedRoleCombos.length - 12} more combinations</p>
                )}
              </div>
            </div>
          )}
          <button
            onClick={() => setShowCombos((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showCombos ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Show per-user breakdown
          </button>
          {showCombos && (
            <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
              {metrics.usersWithMultiRoleProjects.map((u) => {
                const affected = u.projects.filter((p) => p.roles.length > 1);
                return (
                  <div key={u.email} className="rounded-xl border border-border/30 p-3 bg-background/40">
                    <button
                      onClick={() => onSelectUser?.(u.email)}
                      className={cn("flex items-center justify-between mb-2 w-full text-left", onSelectUser && "hover:opacity-80 cursor-pointer")}
                    >
                      <span className="text-sm font-medium text-foreground">{u.name || u.email}</span>
                      <Badge variant="secondary" className="text-[10px]">{affected.length} project{affected.length !== 1 ? "s" : ""}</Badge>
                    </button>
                    <div className="space-y-1">
                      {affected.map((p) => (
                        <div key={p.id} className="flex items-start gap-2 text-xs">
                          <span className="text-muted-foreground shrink-0 pt-px">{p.name}:</span>
                          <div className="flex flex-wrap gap-1">
                            {p.roles.map((r) => (
                              <span key={r} className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-medium">{r}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}

      {/* Unusual Module Combinations */}
      {metrics.outlierFingerprints.length > 0 && (
        <SectionCard
          title="Unusual Module Combinations"
          badge={<Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">{metrics.outlierFingerprints.length} unique</Badge>}
        >
          <p className="text-[11px] text-muted-foreground mb-3">Each combination appears in only one project - worth reviewing.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {metrics.outlierFingerprints.slice(0, showOutliers ? undefined : 6).map(({ fp, example, mods }) => (
              <div key={fp} className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {mods.map((mod) => (
                    <span key={mod} className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 font-medium">
                      {moduleLabel(mod)}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground truncate" title={example}>
                  <AlertTriangle size={9} className="inline text-amber-400 mr-1" />{example}
                </p>
              </div>
            ))}
          </div>
          {metrics.outlierFingerprints.length > 6 && (
            <button
              onClick={() => setShowOutliers((v) => !v)}
              className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showOutliers ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {showOutliers ? "Show less" : `Show all ${metrics.outlierFingerprints.length} combinations`}
            </button>
          )}
        </SectionCard>
      )}

      {/* Users Without Projects */}
      {metrics.noProjectUsers.length > 0 && (
        <div className="rounded-2xl border border-border/30 bg-card p-5">
          <button
            onClick={() => setShowNoProjects((v) => !v)}
            className="w-full flex items-center justify-between text-sm font-semibold text-foreground"
          >
            <span className="flex items-center gap-2">
              {showNoProjects ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Users Without ACC Projects
              <Badge variant="secondary" className="text-[10px]">{metrics.noProjectUsers.length}</Badge>
            </span>
          </button>
          {showNoProjects && (
            <div className="mt-4 space-y-1">
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                <span>Name</span><span>Email</span><span>Synced At</span>
              </div>
              {metrics.noProjectUsers.map((u) => (
                <button
                  key={u.email}
                  onClick={() => onSelectUser?.(u.email)}
                  className={cn(
                    "w-full grid grid-cols-[1fr_1fr_1fr] gap-3 px-2 py-1.5 rounded-lg bg-background/40 text-xs text-left",
                    onSelectUser && "hover:bg-background/60 cursor-pointer transition-colors",
                  )}
                >
                  <span className="text-foreground truncate">{u.name || "-"}</span>
                  <span className="text-muted-foreground truncate">{u.email}</span>
                  <span className="text-muted-foreground">{u.syncedAt ? new Date(u.syncedAt).toLocaleDateString() : "not cached"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
