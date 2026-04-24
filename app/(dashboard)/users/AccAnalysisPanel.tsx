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

// ---------------------------------------------------------------------------
// DonutRing — pure SVG, no dependencies
// ---------------------------------------------------------------------------

const DONUT_R = 26;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;

function DonutRing({
  value,
  total,
  color,
  label,
  sublabel,
}: {
  value: number;
  total: number;
  color: string;
  label: string;
  sublabel: string;
}) {
  const pct = total > 0 ? value / total : 0;
  const dash = pct * DONUT_CIRC;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="72" height="72" viewBox="0 0 72 72">
        {/* Track */}
        <circle cx="36" cy="36" r={DONUT_R} fill="none" stroke="currentColor"
          strokeWidth="8" className="text-muted/20" />
        {/* Arc */}
        <circle
          cx="36" cy="36" r={DONUT_R} fill="none" stroke="currentColor"
          strokeWidth="8"
          className={color}
          strokeDasharray={`${dash} ${DONUT_CIRC - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
        />
        {/* Percent */}
        <text x="36" y="33" textAnchor="middle" fontSize="13" fontWeight="700"
          fill="currentColor" className="text-foreground">
          {Math.round(pct * 100)}%
        </text>
        <text x="36" y="46" textAnchor="middle" fontSize="8"
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
// HBar — horizontal bar with label, value, and % text
// ---------------------------------------------------------------------------

function HBar({
  label,
  value,
  max,
  pct,
  color,
  secondaryText,
  dimmed,
}: {
  label: string;
  value: number;
  max: number;
  pct: number;
  color: string;
  secondaryText?: string;
  dimmed?: boolean;
}) {
  const widthPct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className={cn("group space-y-1", dimmed && "opacity-50")}>
      <div className="flex items-center justify-between text-xs gap-2">
        <span className="truncate text-foreground font-medium max-w-[60%]" title={label}>
          {label}
        </span>
        <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
          {secondaryText && <span className="text-[10px]">{secondaryText}</span>}
          <span className="tabular-nums font-bold text-foreground">{value}</span>
          <span className="text-[11px] w-8 text-right">{pct}%</span>
        </div>
      </div>
      <div className="h-3 rounded-full bg-muted/20 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionCard
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border/30 bg-card p-5", className)}>
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      {children}
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

  const [expandDuplicateRoles, setExpandDuplicateRoles] = useState(false);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ found: number; notFound: number; errors: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);

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

    // Role inventory
    const roleSet = new Set(cachedUsers.flatMap((u) => u.allRoles));

    const roleFrequencyMap = new Map<string, string[]>();
    for (const u of cachedUsers) {
      for (const role of u.allRoles) {
        const existing = roleFrequencyMap.get(role) ?? [];
        existing.push(u.name || u.email);
        roleFrequencyMap.set(role, existing);
      }
    }

    // Duplicate role = same role name in >1 project for this user
    const usersWithDuplicateRoles = cachedUsers.filter((u) => {
      const roleCounts = countBy(u.projects.flatMap((p) => p.roles));
      return Object.values(roleCounts).some((c) => c > 1);
    });

    // Multi-role in same project
    const usersWithMultiRoleProjects = cachedUsers.filter((u) =>
      u.projects.some((p) => p.roles.length > 1)
    );

    // All unique projects
    const allProjectIds = new Set(cachedUsers.flatMap((u) => u.projects.map((p) => p.id)));
    const totalProjects = allProjectIds.size;

    // Per-module adoption (how many project-slots use each module)
    const moduleAdoptionMap = new Map<string, number>();
    let totalProjectSlots = 0;
    for (const u of cachedUsers) {
      for (const p of u.projects) {
        totalProjectSlots++;
        for (const mod of p.modules) {
          moduleAdoptionMap.set(mod, (moduleAdoptionMap.get(mod) ?? 0) + 1);
        }
      }
    }

    // Admin users count
    const adminUsers = cachedUsers.filter((u) => u.adminCount > 0);

    // Active users (has at least one active project)
    const activeUsers = cachedUsers.filter((u) => u.activeCount > 0);

    // Module fingerprints (kept for outlier detection)
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
      .map(([fp, v]) => ({ fp, example: v.example }));

    const noProjectUsers = users.filter((u) => u.hasNoProjects && !!u.syncedAt);

    return {
      totalUsers: users.length,
      totalCachedUsers: cachedUsers.length,
      notFoundUsers,
      adminUsers,
      activeUsers,
      totalRoles: roleSet.size,
      roleFrequencyMap,
      usersWithDuplicateRoles,
      usersWithMultiRoleProjects,
      totalProjects,
      totalProjectSlots,
      moduleAdoptionMap,
      outlierFingerprints,
      noProjectUsers,
    };
  }, [users]);

  const sortedRoles = useMemo(() => {
    return [...metrics.roleFrequencyMap.entries()]
      .sort((a, b) => b[1].length - a[1].length);
  }, [metrics.roleFrequencyMap]);

  const sortedModules = useMemo(() => {
    return [...metrics.moduleAdoptionMap.entries()]
      .sort((a, b) => b[1] - a[1]);
  }, [metrics.moduleAdoptionMap]);

  const maxRoleCount = sortedRoles[0]?.[1]?.length ?? 1;
  const maxModuleCount = sortedModules[0]?.[1] ?? 1;

  function handleForceRefresh() {
    utils.users.bulkAccSummary.invalidate();
    refetch();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground">ACC Hub Analysis</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {users.length} registered users &middot; {metrics.totalCachedUsers} synced &middot; {metrics.totalProjects} unique projects
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

      {/* ── Row 1: Coverage Overview (Donuts) ── */}
      <SectionCard title="Organization Coverage">
        <div className="flex flex-wrap justify-around gap-6 py-2">
          <DonutRing
            value={metrics.totalCachedUsers}
            total={metrics.totalUsers}
            color="text-blue-500"
            label="ACC Coverage"
            sublabel="users synced"
          />
          <DonutRing
            value={metrics.activeUsers.length}
            total={metrics.totalCachedUsers}
            color="text-green-500"
            label="Active Users"
            sublabel="have active projects"
          />
          <DonutRing
            value={metrics.adminUsers.length}
            total={metrics.totalCachedUsers}
            color="text-amber-500"
            label="Admin Users"
            sublabel="admin on ≥1 project"
          />
          <DonutRing
            value={metrics.usersWithDuplicateRoles.length}
            total={metrics.totalCachedUsers}
            color="text-rose-500"
            label="Duplicate Roles"
            sublabel="same role, multi-project"
          />
        </div>
        {/* Not-found users quick list */}
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
      </SectionCard>

      {/* ── Row 2: Module Adoption + Role Distribution ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Module Adoption */}
        <SectionCard title="Module Adoption Across Projects">
          {sortedModules.length === 0 ? (
            <p className="text-xs text-muted-foreground">No module data in cached records.</p>
          ) : (
            <div className="space-y-3">
              {sortedModules.map(([mod, count]) => {
                const pct = metrics.totalProjectSlots > 0
                  ? Math.round((count / metrics.totalProjectSlots) * 100)
                  : 0;
                return (
                  <HBar
                    key={mod}
                    label={moduleLabel(mod)}
                    value={count}
                    max={maxModuleCount}
                    pct={pct}
                    color="bg-gradient-to-r from-cyan-500 to-cyan-400"
                    secondaryText={`${count} project${count !== 1 ? "s" : ""}`}
                  />
                );
              })}
              <p className="text-[10px] text-muted-foreground/50 pt-1">
                % = share of all project-module slots ({metrics.totalProjectSlots} total)
              </p>
            </div>
          )}
        </SectionCard>

        {/* Role Distribution */}
        <SectionCard title="Role Distribution">
          {sortedRoles.length === 0 ? (
            <p className="text-xs text-muted-foreground">No roles found in cached data.</p>
          ) : (
            <div className="space-y-2">
              {sortedRoles.map(([role, userList]) => {
                const pct = metrics.totalCachedUsers > 0
                  ? Math.round((userList.length / metrics.totalCachedUsers) * 100)
                  : 0;
                const isOrphan = userList.length === 1;
                const isExpanded = expandedRole === role;

                return (
                  <div key={role}>
                    <button
                      onClick={() => setExpandedRole(isExpanded ? null : role)}
                      className="w-full group"
                    >
                      <HBar
                        label={role}
                        value={userList.length}
                        max={maxRoleCount}
                        pct={pct}
                        color={isOrphan
                          ? "bg-gradient-to-r from-amber-500 to-amber-400"
                          : "bg-gradient-to-r from-violet-500 to-violet-400"
                        }
                        dimmed={isOrphan}
                        secondaryText={isOrphan ? "orphan" : undefined}
                      />
                    </button>
                    {isExpanded && (
                      <div className="px-1 pt-1 pb-2 flex flex-wrap gap-1">
                        {userList.map((name) => (
                          <Badge key={name} variant="secondary" className="text-[10px]">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-[10px] text-muted-foreground/50 pt-1">
                Click any role to see which users hold it. Amber = only 1 user.
              </p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Row 3: Duplicate Roles (expandable) ── */}
      {metrics.usersWithDuplicateRoles.length > 0 && (
        <SectionCard title="">
          <button
            onClick={() => setExpandDuplicateRoles((v) => !v)}
            className="w-full flex items-center justify-between text-sm font-semibold text-foreground -mt-1 mb-0"
          >
            <span className="flex items-center gap-2">
              {expandDuplicateRoles ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Users with Duplicate Roles
              <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                {metrics.usersWithDuplicateRoles.length}
              </Badge>
            </span>
            <span className="text-[10px] text-muted-foreground font-normal">same role across multiple projects</span>
          </button>
          {expandDuplicateRoles && (
            <div className="space-y-2 mt-4">
              {metrics.usersWithDuplicateRoles.map((u) => {
                const dupes = Object.entries(countBy(u.projects.flatMap((p) => p.roles)))
                  .filter(([, c]) => c > 1);
                return (
                  <div key={u.email} className="rounded-xl border border-border/30 p-3 bg-background/40">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{u.name || u.email}</span>
                      <Badge variant="secondary" className="text-[10px]">{u.email}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {dupes.map(([role, count]) => (
                        <Badge key={role} variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                          {role} &times;{count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Row 4: Multi-Role Projects ── */}
      {metrics.usersWithMultiRoleProjects.length > 0 && (
        <SectionCard title={`Multi-Role in Same Project (${metrics.usersWithMultiRoleProjects.length} users)`}>
          <div className="space-y-3">
            {metrics.usersWithMultiRoleProjects.map((u) => {
              const multiRoleProjects = u.projects.filter((p) => p.roles.length > 1);
              return (
                <div key={u.email} className="rounded-xl border border-border/30 p-3 bg-background/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">{u.name || u.email}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {multiRoleProjects.length} project{multiRoleProjects.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {multiRoleProjects.map((p) => (
                      <div key={p.id} className="text-xs">
                        <span className="text-muted-foreground">{p.name}: </span>
                        <span className="text-foreground">{p.roles.join(", ")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* ── Row 5: Outlier Module Combos ── */}
      {metrics.outlierFingerprints.length > 0 && (
        <SectionCard title="Unusual Module Combinations (appear only once)">
          <div className="space-y-1.5">
            {metrics.outlierFingerprints.map(({ fp, example }) => (
              <div key={fp} className="flex items-start gap-2 text-[11px] p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <AlertTriangle size={11} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-foreground font-medium">
                    {fp.split("|").map(moduleLabel).join(" + ")}
                  </span>
                  <span className="text-muted-foreground"> — {example}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Row 6: Users Without Projects ── */}
      {metrics.noProjectUsers.length > 0 && (
        <SectionCard title="Users Without ACC Projects">
          <div className="space-y-1 mb-3">
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              <span>Name</span>
              <span>Email</span>
              <span>Synced At</span>
            </div>
            {metrics.noProjectUsers.map((u) => (
              <div
                key={u.email}
                className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-2 py-1.5 rounded-lg bg-background/40 text-xs"
              >
                <span className="text-foreground truncate">{u.name || "—"}</span>
                <span className="text-muted-foreground truncate">{u.email}</span>
                <span className="text-muted-foreground truncate">
                  {u.syncedAt ? new Date(u.syncedAt).toLocaleDateString() : "not cached"}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={handleForceRefresh}
            className="text-xs text-primary hover:text-primary/80 border border-primary/20 rounded-lg px-3 py-1.5 bg-primary/5 hover:bg-primary/10 transition-all flex items-center gap-1.5"
          >
            <RefreshCw size={11} />
            Force Refresh All
          </button>
        </SectionCard>
      )}
    </div>
  );
}
