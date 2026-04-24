"use client";

import { useMemo, useState } from "react";
import { Search, ChevronDown, ChevronRight, Users, ShieldCheck, Briefcase, RefreshCw, AlertTriangle, Ghost } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";

interface RoleEntry {
  role: string;
  userCount: number;
  projectSlots: number;
  users: Array<{
    email: string;
    name: string;
    projects: Array<{ id: string; name: string; isAdmin: boolean }>;
  }>;
}

function buildRoleIndex(users: BulkAccUser[]): RoleEntry[] {
  const map = new Map<string, RoleEntry>();
  for (const u of users) {
    if (!u.found) continue;
    for (const p of u.projects) {
      for (const role of p.roles) {
        let entry = map.get(role);
        if (!entry) {
          entry = { role, userCount: 0, projectSlots: 0, users: [] };
          map.set(role, entry);
        }
        entry.projectSlots++;
        const existing = entry.users.find((x) => x.email === u.email);
        if (existing) {
          existing.projects.push({ id: p.id, name: p.name, isAdmin: p.isAdmin });
        } else {
          entry.userCount++;
          entry.users.push({
            email: u.email,
            name: u.name || u.email,
            projects: [{ id: p.id, name: p.name, isAdmin: p.isAdmin }],
          });
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.userCount - a.userCount || a.role.localeCompare(b.role));
}

function StatPill({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number | string; color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-card px-4 py-3 min-w-[130px]">
      <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}18` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    </div>
  );
}

type SortMode = "users-desc" | "users-asc" | "alpha";
type FilterMode = "all" | "multi-project" | "admin";

export function AccRolesTab({
  users,
  onSelectUser,
}: {
  users: BulkAccUser[];
  onSelectUser?: (email: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("users-desc");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  const roleIndex = useMemo(() => buildRoleIndex(users), [users]);
  const syncedUsers = useMemo(() => users.filter((u) => u.found), [users]);
  const maxUserCount = roleIndex[0]?.userCount ?? 1;

  const totalProjectSlots = useMemo(
    () => roleIndex.reduce((s, r) => s + r.projectSlots, 0),
    [roleIndex],
  );

  const hubRolesQuery = trpc.users.getHubRoles.useQuery(undefined, { staleTime: 5 * 60_000 });
  const syncHubRoles = trpc.users.syncHubRoles.useMutation({
    onSuccess: () => hubRolesQuery.refetch(),
  });

  const { unassignedRoles, deletedRoles } = useMemo(() => {
    const hubRoles = hubRolesQuery.data?.roles ?? [];
    const assignedNames = new Set(roleIndex.map((r) => r.role));
    const hubNames = new Set(hubRoles.map((r) => r.name));
    return {
      unassignedRoles: hubRoles.filter((r) => !assignedNames.has(r.name)),
      deletedRoles: roleIndex.filter((r) => hubNames.size > 0 && !hubNames.has(r.role)),
    };
  }, [hubRolesQuery.data, roleIndex]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = q ? roleIndex.filter((r) => r.role.toLowerCase().includes(q)) : [...roleIndex];

    if (filterMode === "multi-project") {
      result = result.filter((r) => r.users.some((u) => u.projects.length > 1));
    } else if (filterMode === "admin") {
      result = result.filter((r) => r.users.some((u) => u.projects.some((p) => p.isAdmin)));
    }

    if (sortMode === "users-asc") result.sort((a, b) => a.userCount - b.userCount);
    else if (sortMode === "alpha") result.sort((a, b) => a.role.localeCompare(b.role));
    // users-desc is already the default order from buildRoleIndex

    return result;
  }, [roleIndex, query, sortMode, filterMode]);

  return (
    <div className="space-y-5">

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-3">
        <StatPill icon={<Briefcase size={15} />} label="Assigned Roles" value={roleIndex.length} color="#8b5cf6" />
        <StatPill icon={<Users size={15} />} label="Synced Users" value={syncedUsers.length} color="#3b82f6" />
        <StatPill icon={<ShieldCheck size={15} />} label="Role Assignments" value={totalProjectSlots} color="#22c55e" />
        {hubRolesQuery.data?.roles.length ? (
          <StatPill icon={<Briefcase size={15} />} label="Hub Roles Total" value={hubRolesQuery.data.roles.length} color="#f59e0b" />
        ) : null}
        <button
          onClick={() => syncHubRoles.mutate()}
          disabled={syncHubRoles.isPending}
          className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 border border-amber-500/20 rounded-lg px-3 py-1.5 bg-amber-500/5 hover:bg-amber-500/10 transition-all disabled:opacity-50 ml-auto"
        >
          <RefreshCw size={12} className={syncHubRoles.isPending ? "animate-spin" : ""} />
          {syncHubRoles.isPending ? "Syncing..." : "Sync Hub Roles"}
        </button>
      </div>

      {/* Deleted roles warning */}
      {deletedRoles.length > 0 && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Ghost size={14} className="text-red-400 shrink-0" />
            <p className="text-sm font-semibold text-red-400">
              {deletedRoles.length} Deleted / Ghost Role{deletedRoles.length !== 1 ? "s" : ""}
            </p>
            <span className="text-[10px] text-red-400/60 font-normal">These roles exist in your cached data but are no longer defined in the hub</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {deletedRoles.map((r) => (
              <button
                key={r.role}
                onClick={() => setExpandedRole(expandedRole === r.role ? null : r.role)}
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15 transition-colors"
              >
                <AlertTriangle size={10} />
                {r.role}
                <span className="opacity-60">{r.userCount} user{r.userCount !== 1 ? "s" : ""}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unassigned hub roles */}
      {unassignedRoles.length > 0 && (
        <div className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Briefcase size={14} className="text-muted-foreground shrink-0" />
            <p className="text-sm font-semibold text-muted-foreground">
              {unassignedRoles.length} Unassigned Role{unassignedRoles.length !== 1 ? "s" : ""}
            </p>
            <span className="text-[10px] text-muted-foreground/60 font-normal">Defined in hub but no synced users currently have them</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unassignedRoles.map((r) => (
              <span key={r.id} className="text-[11px] px-2.5 py-1 rounded-lg border border-border/30 text-muted-foreground/60 bg-muted/10">
                {r.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter + Sort toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Filter:</span>
          {(["all", "multi-project", "admin"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-lg border transition-colors",
                filterMode === mode
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border/40 hover:text-foreground hover:border-border",
              )}
            >
              {mode === "all" ? "All Roles" : mode === "multi-project" ? "Multi-Project" : "Admin Roles"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Sort:</span>
          {([["users-desc", "Most Users"], ["users-asc", "Fewest"], ["alpha", "A–Z"]] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-lg border transition-colors",
                sortMode === mode
                  ? "bg-card text-foreground border-border"
                  : "text-muted-foreground border-transparent hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search roles..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-border/40 bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Result count */}
      {(query || filterMode !== "all") && filtered.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {roleIndex.length} roles
        </p>
      )}

      {/* Role list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No roles match "{query}"</p>
      ) : (
        <div className="rounded-2xl border border-border/30 bg-card overflow-hidden">
          <div className="grid grid-cols-[1fr_56px_56px_24px] gap-2 px-4 py-2 border-b border-border/20 text-[10px] uppercase tracking-wide text-muted-foreground/60 font-medium">
            <span>Role</span>
            <span className="text-right">Users</span>
            <span className="text-right">Slots</span>
            <span />
          </div>
          <div className="divide-y divide-border/20">
            {filtered.map((entry) => {
              const isOpen = expandedRole === entry.role;
              const barW = maxUserCount > 0 ? (entry.userCount / maxUserCount) * 100 : 0;
              return (
                <div key={entry.role}>
                  <button
                    onClick={() => setExpandedRole(isOpen ? null : entry.role)}
                    className={cn(
                      "w-full grid grid-cols-[1fr_56px_56px_24px] gap-2 items-center px-4 py-3 text-left transition-colors",
                      isOpen ? "bg-white/5" : "hover:bg-white/3",
                    )}
                  >
                    {/* Role name + bar */}
                    <div className="min-w-0 space-y-1">
                      <span className={cn("text-sm font-medium truncate block", isOpen ? "text-primary" : "text-foreground")}>
                        {entry.role}
                      </span>
                      <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden w-full">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${barW}%`, backgroundColor: isOpen ? "#8b5cf6" : "#6366f188" }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-foreground text-right">{entry.userCount}</span>
                    <span className="text-xs tabular-nums text-muted-foreground text-right">{entry.projectSlots}</span>
                    {isOpen ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 space-y-2 bg-white/[0.02] border-t border-border/20">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-3">
                        {entry.userCount} user{entry.userCount !== 1 ? "s" : ""} with this role
                      </p>
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {entry.users.map((u) => (
                          <div key={u.email} className="rounded-xl border border-border/25 bg-card/60 overflow-hidden">
                            <button
                              onClick={() => onSelectUser?.(u.email)}
                              className={cn(
                                "w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left",
                                onSelectUser && "hover:bg-white/5 cursor-pointer transition-colors",
                              )}
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{u.name}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {u.projects.length} project{u.projects.length !== 1 ? "s" : ""}
                              </span>
                            </button>
                            <div className="px-3 pb-2.5 flex flex-wrap gap-1.5">
                              {u.projects.map((p) => (
                                <span
                                  key={p.id}
                                  className={cn(
                                    "text-[10px] px-2 py-0.5 rounded-full border font-medium",
                                    p.isAdmin
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                      : "bg-muted/20 text-muted-foreground border-border/30",
                                  )}
                                >
                                  {p.name}{p.isAdmin ? " ★" : ""}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
