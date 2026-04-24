"use client";

import { useMemo, useState } from "react";
import { RefreshCw, AlertTriangle, CloudDownload, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";
import { moduleLabel } from "@/lib/acc/modules";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulkAccProject {
  id: string;
  name: string;
  status: string;
  isAdmin: boolean;
  roles: string[];
  modules: string[];
}

export interface BulkAccUser {
  email: string;
  name: string;
  found: boolean;
  projectCount: number;
  activeCount: number;
  adminCount: number;
  hasNoProjects: boolean;
  syncedAt: string;
  allRoles: string[];
  allModules: string[];
  projects: BulkAccProject[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countBy<T>(arr: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of arr) {
    const key = String(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

// Stable color palette — 16 distinct colors, cycles if more roles
const PALETTE = [
  "#6366f1", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899", "#14b8a6",
  "#f97316", "#8b5cf6", "#06b6d4", "#84cc16", "#ef4444", "#a78bfa",
  "#fb923c", "#34d399", "#60a5fa", "#fbbf24",
];

// Module-specific colors aligned to ACC modules order
const MODULE_COLORS = [
  "#06b6d4", // Datum         → cyan
  "#3b82f6", // Data Mgmt     → blue
  "#8b5cf6", // Design Collab → violet
  "#22c55e", // Model Coord   → green
  "#f59e0b", // Preconstruction→ amber
  "#ec4899", // AutoSpecs     → pink
  "#f97316", // Build         → orange
  "#84cc16", // Insight       → lime
  "#14b8a6", // Design        → teal
];

// ---------------------------------------------------------------------------
// SVG Donut / Pie helpers
// ---------------------------------------------------------------------------

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}

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
// InteractivePie
// ---------------------------------------------------------------------------

interface PieSlice {
  id: string;
  label: string;
  value: number;
  color: string;
}

function InteractivePie({
  slices,
  size = 210,
  innerR = 58,
  selected,
  onSelect,
  centerLabel = "total",
}: {
  slices: PieSlice[];
  size?: number;
  innerR?: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  centerLabel?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 12;
  const POP = 11;

  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  let angle = -90;
  const computed = slices.map((s) => {
    const sweep = (s.value / total) * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    return { ...s, start, end };
  });

  const activeId = hovered ?? selected;
  const activeSlice = computed.find((s) => s.id === activeId);

  return (
    <div className="flex gap-5 items-center flex-wrap">
      {/* SVG */}
      <div className="relative shrink-0">
        <svg
          width={size} height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
        >
          {computed.map((s) => {
            const isActive = activeId === s.id;
            const pop = isActive ? POP : 0;
            const dim = !!activeId && !isActive;
            return (
              <path
                key={s.id}
                d={arcPath(cx, cy, outerR, innerR, s.start, s.end, pop)}
                fill={s.color}
                opacity={dim ? 0.25 : 1}
                className="cursor-pointer"
                style={{
                  transition: "opacity 0.15s, filter 0.15s",
                  filter: isActive ? `drop-shadow(0 0 7px ${s.color}88)` : undefined,
                }}
                onMouseEnter={() => setHovered(s.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(selected === s.id ? null : s.id)}
              />
            );
          })}
          {/* Center */}
          <text
            x={cx} y={cy - 7}
            textAnchor="middle" fontSize="22" fontWeight="800"
            fill={activeSlice ? activeSlice.color : "currentColor"}
            className={activeSlice ? "" : "text-foreground"}
            style={{ transition: "fill 0.2s" }}
          >
            {activeSlice ? activeSlice.value : total}
          </text>
          <text
            x={cx} y={cy + 11}
            textAnchor="middle" fontSize="9.5"
            fill="currentColor" className="text-muted-foreground"
          >
            {activeSlice
              ? `${Math.round((activeSlice.value / total) * 100)}% of total`
              : centerLabel}
          </text>
          {activeSlice && (
            <text
              x={cx} y={cy + 26}
              textAnchor="middle" fontSize="8.5"
              fill="currentColor" className="text-muted-foreground"
            >
              {activeSlice.label.length > 18
                ? activeSlice.label.slice(0, 16) + "…"
                : activeSlice.label}
            </text>
          )}
        </svg>
      </div>

      {/* Legend */}
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
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-xs text-foreground truncate flex-1 min-w-0">
                {s.label}
              </span>
              <span
                className="text-xs font-bold tabular-nums shrink-0"
                style={{ color: s.color }}
              >
                {pct}%
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right shrink-0">
                {s.value}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionCard
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  badge,
  children,
  className,
  accent,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5",
        accent
          ? "border-violet-500/25 shadow-[0_0_24px_rgba(139,92,246,0.07)]"
          : "border-border/30",
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HBar — compact horizontal bar (for role combos)
// ---------------------------------------------------------------------------

function HBar({
  label,
  value,
  max,
  color,
  sublabel,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  sublabel?: string;
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
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${w}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DonutRing — small summary ring for coverage overview
// ---------------------------------------------------------------------------

const DR = 26;
const DC = 2 * Math.PI * DR;

function DonutRing({
  value, total, color, label, sublabel,
}: {
  value: number; total: number; color: string; label: string; sublabel: string;
}) {
  const pct = total > 0 ? value / total : 0;
  const dash = pct * DC;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="70" height="70" viewBox="0 0 70 70">
        <circle cx="35" cy="35" r={DR} fill="none" stroke="currentColor"
          strokeWidth="7" className="text-muted/20" />
        <circle cx="35" cy="35" r={DR} fill="none" stroke={color}
          strokeWidth="7"
          strokeDasharray={`${dash} ${DC - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 35 35)"
        />
        <text x="35" y="32" textAnchor="middle" fontSize="12" fontWeight="700"
          fill="currentColor" className="text-foreground">
          {Math.round(pct * 100)}%
        </text>
        <text x="35" y="44" textAnchor="middle" fontSize="7.5"
          fill="currentColor" className="text-muted-foreground">
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
// Main Component
// ---------------------------------------------------------------------------

export function AccAnalysisPanel({
  users,
  refetch,
}: {
  users: BulkAccUser[];
  refetch: () => void;
}) {
  const utils = trpc.useUtils();

  const [syncResult, setSyncResult] = useState<{ found: number; notFound: number; errors: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);

  // Pie selections
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  // Collapsibles
  const [showCombos, setShowCombos] = useState(false);
  const [showOutliers, setShowOutliers] = useState(false);
  const [showNoProjects, setShowNoProjects] = useState(false);

  const bulkSyncMutation = trpc.users.bulkAccSync.useMutation();

  async function runBulkSync() {
    setSyncResult(null);
    setSyncError(null);
    const emails = users.map((u) => u.email).filter(Boolean);
    if (emails.length === 0) return;
    const CHUNK_SIZE = 50;
    let found = 0, notFound = 0, errors = 0;
    setSyncProgress({ done: 0, total: emails.length });
    try {
      for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
        const chunk = emails.slice(i, i + CHUNK_SIZE);
        const result = await bulkSyncMutation.mutateAsync({ emails: chunk });
        found += result.found;
        notFound += result.notFound;
        errors += result.errors;
        setSyncProgress({ done: Math.min(i + CHUNK_SIZE, emails.length), total: emails.length });
      }
      setSyncResult({ found, notFound, errors });
      utils.users.bulkAccSummary.invalidate();
      refetch();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncProgress(null);
    }
  }

  const isSyncing = syncProgress !== null;

  const metrics = useMemo(() => {
    const cachedUsers = users.filter((u) => u.found);
    const notFoundUsers = users.filter((u) => !u.found);

    // Role frequency map
    const roleFreqMap = new Map<string, string[]>();
    for (const u of cachedUsers) {
      for (const role of u.allRoles) {
        const list = roleFreqMap.get(role) ?? [];
        list.push(u.name || u.email);
        roleFreqMap.set(role, list);
      }
    }

    // Duplicate role users
    const usersWithDuplicateRoles = cachedUsers.filter((u) => {
      const counts = countBy(u.projects.flatMap((p) => p.roles));
      return Object.values(counts).some((c) => c > 1);
    });

    // Multi-role in same project
    const usersWithMultiRoleProjects = cachedUsers.filter((u) =>
      u.projects.some((p) => p.roles.length > 1)
    );

    // Role combination frequencies (for multi-role section)
    const roleCombos = new Map<string, number>();
    for (const u of cachedUsers) {
      for (const p of u.projects) {
        if (p.roles.length > 1) {
          const key = [...p.roles].sort().join(" + ");
          roleCombos.set(key, (roleCombos.get(key) ?? 0) + 1);
        }
      }
    }
    const sortedRoleCombos = [...roleCombos.entries()].sort((a, b) => b[1] - a[1]);

    // Per-module adoption across project-slots
    const moduleAdoptionMap = new Map<string, number>();
    let totalProjectSlots = 0;
    const allProjectIds = new Set<string>();
    for (const u of cachedUsers) {
      for (const p of u.projects) {
        totalProjectSlots++;
        allProjectIds.add(p.id);
        for (const mod of p.modules) {
          moduleAdoptionMap.set(mod, (moduleAdoptionMap.get(mod) ?? 0) + 1);
        }
      }
    }

    // Admin / active users
    const adminUsers = cachedUsers.filter((u) => u.adminCount > 0);
    const activeUsers = cachedUsers.filter((u) => u.activeCount > 0);

    // Module fingerprints (for outlier detection)
    const moduleFingerprints = new Map<string, { count: number; example: string }>();
    for (const u of cachedUsers) {
      for (const p of u.projects) {
        const fp = [...p.modules].sort().join("|");
        if (!fp) continue;
        const existing = moduleFingerprints.get(fp);
        if (existing) {
          existing.count++;
        } else {
          moduleFingerprints.set(fp, { count: 1, example: `${u.name || u.email} / ${p.name}` });
        }
      }
    }
    const outlierFingerprints = [...moduleFingerprints.entries()]
      .filter(([, v]) => v.count === 1)
      .map(([fp, v]) => ({ fp, example: v.example, mods: fp.split("|") }))
      .sort((a, b) => b.mods.length - a.mods.length);

    const noProjectUsers = users.filter((u) => u.hasNoProjects && !!u.syncedAt);

    return {
      totalUsers: users.length,
      totalCachedUsers: cachedUsers.length,
      notFoundUsers,
      adminUsers,
      activeUsers,
      totalProjects: allProjectIds.size,
      totalProjectSlots,
      roleFreqMap,
      usersWithDuplicateRoles,
      usersWithMultiRoleProjects,
      sortedRoleCombos,
      moduleAdoptionMap,
      outlierFingerprints,
      noProjectUsers,
    };
  }, [users]);

  // Build pie slices for Role Distribution (top 14 + "Other")
  const rolePieSlices = useMemo<PieSlice[]>(() => {
    const sorted = [...metrics.roleFreqMap.entries()]
      .sort((a, b) => b[1].length - a[1].length);
    const MAX_SLICES = 14;
    const top = sorted.slice(0, MAX_SLICES);
    const rest = sorted.slice(MAX_SLICES);
    const slices: PieSlice[] = top.map(([role, users], i) => ({
      id: role,
      label: role,
      value: users.length,
      color: PALETTE[i % PALETTE.length],
    }));
    if (rest.length > 0) {
      const otherCount = rest.reduce((s, [, u]) => s + u.length, 0);
      slices.push({ id: "__other__", label: `Other (${rest.length} roles)`, value: otherCount, color: "#475569" });
    }
    return slices;
  }, [metrics.roleFreqMap]);

  // Build pie slices for Module Adoption
  const modulePieSlices = useMemo<PieSlice[]>(() => {
    return [...metrics.moduleAdoptionMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([mod, count], i) => ({
        id: mod,
        label: moduleLabel(mod),
        value: count,
        color: MODULE_COLORS[i % MODULE_COLORS.length],
      }));
  }, [metrics.moduleAdoptionMap]);

  // Selected role → user list to display
  const selectedRoleUsers = selectedRole && selectedRole !== "__other__"
    ? metrics.roleFreqMap.get(selectedRole) ?? []
    : [];

  // Selected module → matching projects info
  const selectedModuleLabel = selectedModule ? moduleLabel(selectedModule) : null;
  const selectedModuleCount = selectedModule ? metrics.moduleAdoptionMap.get(selectedModule) ?? 0 : 0;

  const maxComboCount = metrics.sortedRoleCombos[0]?.[1] ?? 1;

  function handleForceRefresh() {
    utils.users.bulkAccSummary.invalidate();
    refetch();
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground">ACC Hub Analysis</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {users.length} users &middot; {metrics.totalCachedUsers} synced &middot; {metrics.totalProjects} unique projects
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {syncError && !isSyncing && (
            <span className="text-xs text-red-400 max-w-[260px] truncate" title={syncError}>
              Error: {syncError}
            </span>
          )}
          {syncResult && !isSyncing && !syncError && (
            <span className="text-xs text-muted-foreground">
              Sync: {syncResult.found} found · {syncResult.notFound} not in ACC
              {syncResult.errors > 0 ? ` · ${syncResult.errors} errors` : ""}
            </span>
          )}
          {isSyncing && syncProgress && (
            <span className="text-xs text-muted-foreground">
              Syncing {syncProgress.done}/{syncProgress.total}…
            </span>
          )}
          <button
            onClick={runBulkSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 rounded-lg px-3 py-1.5 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSyncing ? <RefreshCw size={12} className="animate-spin" /> : <CloudDownload size={12} />}
            {isSyncing ? `Syncing ${users.length} users…` : "Sync All to ACC"}
          </button>
          <button
            onClick={refetch}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 border border-primary/20 rounded-lg px-3 py-1.5 bg-primary/5 hover:bg-primary/10 transition-all"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Coverage Rings ── */}
      <div className="rounded-2xl border border-border/30 bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Organization Coverage</h3>
        <div className="flex flex-wrap justify-around gap-6 py-1">
          <DonutRing value={metrics.totalCachedUsers} total={metrics.totalUsers}
            color="#3b82f6" label="ACC Coverage" sublabel="users synced" />
          <DonutRing value={metrics.activeUsers.length} total={metrics.totalCachedUsers}
            color="#22c55e" label="Active Users" sublabel="have active projects" />
          <DonutRing value={metrics.adminUsers.length} total={metrics.totalCachedUsers}
            color="#f59e0b" label="Admin Users" sublabel="admin on ≥1 project" />
          <DonutRing value={metrics.usersWithDuplicateRoles.length} total={metrics.totalCachedUsers}
            color="#ef4444" label="Duplicate Roles" sublabel="same role, multi-project" />
        </div>
        {metrics.notFoundUsers.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/30">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-2">
              Not found in ACC ({metrics.notFoundUsers.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {metrics.notFoundUsers.slice(0, 12).map((u) => (
                <Badge key={u.email} variant="secondary" className="text-[10px]">
                  {u.name || u.email}
                </Badge>
              ))}
              {metrics.notFoundUsers.length > 12 && (
                <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                  +{metrics.notFoundUsers.length - 12} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Role Distribution Pie — most important ── */}
      <SectionCard
        title="Role Distribution"
        badge={
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20 font-semibold">
            {rolePieSlices.length > 1 && rolePieSlices.at(-1)?.id === "__other__"
              ? rolePieSlices.length - 1
              : rolePieSlices.length} roles
          </span>
        }
        accent
      >
        {rolePieSlices.length === 0 ? (
          <p className="text-xs text-muted-foreground">No roles found in cached data.</p>
        ) : (
          <>
            <InteractivePie
              slices={rolePieSlices}
              size={220}
              innerR={62}
              selected={selectedRole}
              onSelect={setSelectedRole}
              centerLabel="users assigned"
            />
            {/* Drill-down: selected role → user list */}
            {selectedRole && selectedRole !== "__other__" && selectedRoleUsers.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/30">
                <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{
                      backgroundColor:
                        rolePieSlices.find((s) => s.id === selectedRole)?.color,
                    }}
                  />
                  {selectedRole}
                  <span className="text-muted-foreground font-normal">
                    — {selectedRoleUsers.length} user{selectedRoleUsers.length !== 1 ? "s" : ""}
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedRoleUsers.map((name) => (
                    <Badge key={name} variant="secondary" className="text-[10px]">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/50 mt-3">
              Hover to highlight · click a slice or legend item to drill down
            </p>
          </>
        )}
      </SectionCard>

      {/* ── Module Adoption Pie ── */}
      <SectionCard
        title="Module Adoption Across Projects"
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
            <InteractivePie
              slices={modulePieSlices}
              size={200}
              innerR={56}
              selected={selectedModule}
              onSelect={setSelectedModule}
              centerLabel="project-slots"
            />
            {selectedModule && selectedModuleLabel && (
              <div className="mt-4 pt-4 border-t border-border/30">
                <p className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{
                      backgroundColor:
                        modulePieSlices.find((s) => s.id === selectedModule)?.color,
                    }}
                  />
                  {selectedModuleLabel}
                  <span className="text-muted-foreground font-normal">
                    — active in {selectedModuleCount} of {metrics.totalProjectSlots} project-slots
                    ({metrics.totalProjectSlots > 0
                      ? Math.round((selectedModuleCount / metrics.totalProjectSlots) * 100)
                      : 0}%)
                  </span>
                </p>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/50 mt-3">
              Counts how many project-slots have each module enabled
            </p>
          </>
        )}
      </SectionCard>

      {/* ── Multi-Role in Same Project ── */}
      {metrics.usersWithMultiRoleProjects.length > 0 && (
        <SectionCard
          title="Multi-Role in Same Project"
          badge={
            <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
              {metrics.usersWithMultiRoleProjects.length} users
            </Badge>
          }
        >
          {/* Role combination frequency — the real insight */}
          {metrics.sortedRoleCombos.length > 0 && (
            <div className="mb-5">
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-3">
                Most Common Role Combinations in Single Projects
              </p>
              <div className="space-y-2.5">
                {metrics.sortedRoleCombos.slice(0, 12).map(([combo, count]) => (
                  <HBar
                    key={combo}
                    label={combo}
                    value={count}
                    max={maxComboCount}
                    color="#f59e0b"
                    sublabel={`${count} project${count !== 1 ? "s" : ""}`}
                  />
                ))}
                {metrics.sortedRoleCombos.length > 12 && (
                  <p className="text-[10px] text-muted-foreground">
                    +{metrics.sortedRoleCombos.length - 12} more combinations
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Expandable per-user detail */}
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
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">{u.name || u.email}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {affected.length} project{affected.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {affected.map((p) => (
                        <div key={p.id} className="flex items-start gap-2 text-xs">
                          <span className="text-muted-foreground shrink-0 pt-px">{p.name}:</span>
                          <div className="flex flex-wrap gap-1">
                            {p.roles.map((r) => (
                              <span
                                key={r}
                                className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-medium"
                              >
                                {r}
                              </span>
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

      {/* ── Unusual Module Combinations ── */}
      {metrics.outlierFingerprints.length > 0 && (
        <SectionCard
          title="Unusual Module Combinations"
          badge={
            <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
              {metrics.outlierFingerprints.length} unique
            </Badge>
          }
        >
          <p className="text-[11px] text-muted-foreground mb-3">
            Each combination below appears in only one project across the hub — these are worth reviewing.
          </p>
          {/* First 6 always visible */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {metrics.outlierFingerprints.slice(0, showOutliers ? undefined : 6).map(({ fp, example, mods }) => (
              <div
                key={fp}
                className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 space-y-2"
              >
                <div className="flex flex-wrap gap-1">
                  {mods.map((mod) => (
                    <span
                      key={mod}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 font-medium"
                    >
                      {moduleLabel(mod)}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground truncate" title={example}>
                  <AlertTriangle size={9} className="inline text-amber-400 mr-1" />
                  {example}
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
              {showOutliers
                ? "Show less"
                : `Show all ${metrics.outlierFingerprints.length} combinations`}
            </button>
          )}
        </SectionCard>
      )}

      {/* ── Users Without Projects ── */}
      {metrics.noProjectUsers.length > 0 && (
        <div className="rounded-2xl border border-border/30 bg-card p-5">
          <button
            onClick={() => setShowNoProjects((v) => !v)}
            className="w-full flex items-center justify-between text-sm font-semibold text-foreground"
          >
            <span className="flex items-center gap-2">
              {showNoProjects ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Users Without ACC Projects
              <Badge variant="secondary" className="text-[10px]">
                {metrics.noProjectUsers.length}
              </Badge>
            </span>
          </button>
          {showNoProjects && (
            <div className="mt-4 space-y-1">
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                <span>Name</span><span>Email</span><span>Synced At</span>
              </div>
              {metrics.noProjectUsers.map((u) => (
                <div key={u.email} className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-2 py-1.5 rounded-lg bg-background/40 text-xs">
                  <span className="text-foreground truncate">{u.name || "—"}</span>
                  <span className="text-muted-foreground truncate">{u.email}</span>
                  <span className="text-muted-foreground truncate">
                    {u.syncedAt ? new Date(u.syncedAt).toLocaleDateString() : "not cached"}
                  </span>
                </div>
              ))}
              <button
                onClick={handleForceRefresh}
                className="mt-3 text-xs text-primary hover:text-primary/80 border border-primary/20 rounded-lg px-3 py-1.5 bg-primary/5 hover:bg-primary/10 transition-all flex items-center gap-1.5"
              >
                <RefreshCw size={11} />
                Force Refresh All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
