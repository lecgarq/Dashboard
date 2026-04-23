"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Users, Shield, AlertTriangle, FolderOpen, Layers, ChevronDown, ChevronRight, CloudDownload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";

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

function abbreviateModuleKey(key: string): string {
  const SHORT: Record<string, string> = {
    datum: "Datum",
    documentManagement: "Forma Data Management",
    designCollaboration: "Forma Design Collaboration",
    modelCoordination: "Model Coord",
    preconstruction: "Preconstruction",
    autoSpecs: "AutoSpecs",
    build: "Build",
    insight: "Insight",
    design: "Design",
  };
  return SHORT[key] ?? key;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  color,
  onClick,
  clickable,
}: {
  label: string;
  value: number | string;
  color: "blue" | "violet" | "amber" | "green" | "cyan";
  onClick?: () => void;
  clickable?: boolean;
}) {
  const colorMap = {
    blue: "from-blue-500/20 to-blue-500/5 border-blue-500/20 text-blue-400",
    violet: "from-violet-500/20 to-violet-500/5 border-violet-500/20 text-violet-400",
    amber: "from-amber-500/20 to-amber-500/5 border-amber-500/20 text-amber-400",
    green: "from-green-500/20 to-green-500/5 border-green-500/20 text-green-400",
    cyan: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/20 text-cyan-400",
  };

  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        "flex-1 min-w-0 p-4 rounded-2xl border bg-gradient-to-br text-left transition-all",
        colorMap[color],
        clickable && "hover:scale-[1.02] cursor-pointer",
        !clickable && "cursor-default"
      )}
    >
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs mt-1 text-muted-foreground">{label}</div>
      {clickable && (
        <div className="text-[10px] mt-1 opacity-60">click to expand</div>
      )}
    </button>
  );
}

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
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
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

  const bulkSync = trpc.users.bulkAccSync.useMutation({
    onSuccess: (data) => {
      setSyncResult({ found: data.found, notFound: data.notFound, errors: data.errors });
      utils.users.bulkAccSummary.invalidate();
      refetch();
    },
  });

  const metrics = useMemo(() => {
    const cachedUsers = users.filter((u) => u.found);

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

    // Module fingerprints
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

    const topFingerprints = [...moduleFingerprints.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    const maxFpCount = topFingerprints[0]?.[1]?.count ?? 1;

    // Hub projects
    const allProjectIds = new Set(cachedUsers.flatMap((u) => u.projects.map((p) => p.id)));

    const noProjectUsers = users.filter((u) => u.hasNoProjects);

    return {
      totalCachedUsers: cachedUsers.length,
      totalRoles: roleSet.size,
      roleFrequencyMap,
      usersWithDuplicateRoles,
      usersWithMultiRoleProjects,
      totalProjects: allProjectIds.size,
      moduleCombinations: moduleFingerprints.size,
      outlierFingerprints,
      topFingerprints,
      maxFpCount,
      noProjectUsers,
    };
  }, [users]);

  const sortedRoles = useMemo(() => {
    return [...metrics.roleFrequencyMap.entries()]
      .sort((a, b) => b[1].length - a[1].length);
  }, [metrics.roleFrequencyMap]);

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
            Computed from {users.length} registered users &middot; {metrics.totalCachedUsers} with ACC data
          </p>
        </div>
        <div className="flex items-center gap-2">
          {syncResult && !bulkSync.isPending && (
            <span className="text-xs text-muted-foreground">
              Sync: {syncResult.found} found · {syncResult.notFound} not in ACC{syncResult.errors > 0 ? ` · ${syncResult.errors} errors` : ""}
            </span>
          )}
          <button
            onClick={() => { setSyncResult(null); bulkSync.mutate(); }}
            disabled={bulkSync.isPending}
            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 rounded-lg px-3 py-1.5 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {bulkSync.isPending ? (
              <RefreshCw size={12} className="animate-spin" />
            ) : (
              <CloudDownload size={12} />
            )}
            {bulkSync.isPending ? `Syncing ${users.length} users…` : "Sync All to ACC"}
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

      {/* Row 1: KPI Cards */}
      <div className="flex flex-wrap gap-3">
        <StatCard
          label="ACC Users (cached)"
          value={metrics.totalCachedUsers}
          color="blue"
        />
        <StatCard
          label="Unique Roles"
          value={metrics.totalRoles}
          color="violet"
        />
        <StatCard
          label="Duplicate-Role Users"
          value={metrics.usersWithDuplicateRoles.length}
          color="amber"
          clickable={metrics.usersWithDuplicateRoles.length > 0}
          onClick={() => setExpandDuplicateRoles((v) => !v)}
        />
        <StatCard
          label="Hub Projects"
          value={metrics.totalProjects}
          color="green"
        />
        <StatCard
          label="Module Combinations"
          value={metrics.moduleCombinations}
          color="cyan"
        />
      </div>

      {/* Duplicate Roles expandable list */}
      {expandDuplicateRoles && metrics.usersWithDuplicateRoles.length > 0 && (
        <SectionCard title="Users with Duplicate Roles (same role in multiple projects)">
          <div className="space-y-2">
            {metrics.usersWithDuplicateRoles.map((u) => {
              const dupes = Object.entries(countBy(u.projects.flatMap((p) => p.roles)))
                .filter(([, c]) => c > 1);
              return (
                <div key={u.email} className="rounded-xl border border-border/30 p-3 bg-background/40">
                  <div className="flex items-center gap-2">
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
        </SectionCard>
      )}

      {/* Row 2: Role Frequency + Multi-Role Projects */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Role Frequency Table */}
        <SectionCard title="Role Frequency">
          {sortedRoles.length === 0 ? (
            <p className="text-xs text-muted-foreground">No roles found in cached data.</p>
          ) : (
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-[1fr_60px_50px] gap-2 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                <span>Role</span>
                <span className="text-right">Users</span>
                <span className="text-right">%</span>
              </div>
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
                      className={cn(
                        "w-full grid grid-cols-[1fr_60px_50px] gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-primary/5 transition-colors text-xs",
                        isOrphan && "text-amber-400",
                        !isOrphan && "text-foreground"
                      )}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        <span className="truncate">{role}</span>
                        {isOrphan && (
                          <Badge variant="secondary" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20 shrink-0">
                            orphan
                          </Badge>
                        )}
                      </span>
                      <span className="text-right font-medium">{userList.length}</span>
                      <span className="text-right text-muted-foreground">{pct}%</span>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-2 flex flex-wrap gap-1">
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
            </div>
          )}
        </SectionCard>

        {/* Right: Multi-Role Projects */}
        <SectionCard title="Multi-Role in Same Project">
          {metrics.usersWithMultiRoleProjects.length === 0 ? (
            <p className="text-xs text-muted-foreground">No users have multiple roles in the same project.</p>
          ) : (
            <div className="space-y-3">
              {metrics.usersWithMultiRoleProjects.map((u) => {
                const multiRoleProjects = u.projects.filter((p) => p.roles.length > 1);
                return (
                  <div key={u.email} className="rounded-xl border border-border/30 p-3 bg-background/40">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">{u.name || u.email}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {multiRoleProjects.length} project{multiRoleProjects.length !== 1 ? "s" : ""} affected
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
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
          )}
        </SectionCard>
      </div>

      {/* Row 3: Module Access Patterns */}
      <SectionCard title="Module Access Patterns — Top 10 Combinations">
        {metrics.topFingerprints.length === 0 ? (
          <p className="text-xs text-muted-foreground">No module data found in cached ACC records.</p>
        ) : (
          <div className="space-y-2">
            {metrics.topFingerprints.map(([fp, { count }]) => {
              const pct = Math.round((count / metrics.maxFpCount) * 100);
              const label = fp
                .split("|")
                .map(abbreviateModuleKey)
                .join(" + ");
              const totalProjPct = metrics.totalProjects > 0
                ? Math.round((count / metrics.totalProjects) * 100)
                : 0;

              return (
                <div key={fp} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[70%]" title={label}>{label}</span>
                    <span className="text-foreground font-medium ml-2 shrink-0">
                      {count} <span className="text-muted-foreground font-normal">({totalProjPct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Outliers */}
        {metrics.outlierFingerprints.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/30">
            <p className="text-xs font-medium text-foreground mb-2">
              Outlier Combinations (appear only once)
            </p>
            <div className="space-y-1">
              {metrics.outlierFingerprints.map(({ fp, example }) => (
                <div key={fp} className="flex items-start gap-2 text-[11px]">
                  <span className="text-amber-400 shrink-0 mt-0.5">
                    <AlertTriangle size={10} />
                  </span>
                  <span className="text-muted-foreground">
                    <span className="text-foreground">{fp.split("|").map(abbreviateModuleKey).join(" + ")}</span>
                    {" "}&mdash; {example}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Row 4: Users Without Projects */}
      {metrics.noProjectUsers.length > 0 && (
        <SectionCard title="Users Without ACC Projects">
          <div className="space-y-1 mb-3">
            {/* Table header */}
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
