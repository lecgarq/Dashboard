"use client";

import { useState } from "react";
import { 
  Users, 
  ShieldAlert, 
  Layers, 
  FolderLock, 
  ChevronRight, 
  Grid,
  AlertTriangle,
  Award,
  BookOpen
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/core/trpc";
import { cn } from "@/lib/core/utils";

export function PermissionRiskPanel() {
  const query = trpc.accMembers.getPermissionRiskScorecard.useQuery(undefined, {
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const [activeTab, setActiveTab] = useState<"users" | "roles" | "folders">("users");

  if (query.isLoading) {
    return (
      <div className="rounded-lg border bg-card p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-6 w-1/4 bg-muted rounded" />
        <div className="h-4 w-1/2 bg-muted rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-3" />
        <h3 className="text-lg font-semibold text-destructive">Scorecard Fetch Error</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {query.error?.message || "Failed to load permission risk scorecard metrics."}
        </p>
      </div>
    );
  }

  const {
    worstUsersByFootprint,
    worstUsersByBlastRadius,
    overPrivilegedRoles,
    inheritanceBreaks,
    lockouts,
    sprawlFolders
  } = query.data;

  // Let's typecast arrays to make TS happy
  const usersFootprint = (worstUsersByFootprint || []) as any[];
  const usersBlast = (worstUsersByBlastRadius || []) as any[];
  const rolesOver = (overPrivilegedRoles || []) as any[];
  const rolesBreaks = (inheritanceBreaks || []) as any[];
  const folderLockouts = (lockouts || []) as any[];
  const folderSprawl = (sprawlFolders || []) as any[];

  return (
    <Card className="border shadow-md overflow-hidden bg-card/60 backdrop-blur-sm transition-all duration-300">
      <CardHeader className="border-b bg-card/40 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Award className="h-5 w-5 text-indigo-500" />
              Permission Complexity &amp; Governance Scorecard
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Quantitative structural analysis of Hermosillo's folder exposure, blast-radius consolidated identities, and inheritance break risks.
            </CardDescription>
          </div>
          <Badge className="text-xs px-2.5 py-0.5 bg-rose-500/10 text-rose-500 border border-rose-500/20" variant="outline">
            Permission Sprawl Audit Active
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Navigation Tabs */}
        <div className="flex border-b bg-card/20">
          <button
            onClick={() => setActiveTab("users")}
            className={cn(
              "flex items-center gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wider border-r transition-all duration-200",
              activeTab === "users"
                ? "bg-background text-indigo-500 border-b-2 border-b-indigo-500"
                : "text-muted-foreground hover:bg-card/30 hover:text-foreground"
            )}
          >
            <Users className="h-4 w-4" />
            Consolidated Users ({usersFootprint.length})
          </button>
          <button
            onClick={() => setActiveTab("roles")}
            className={cn(
              "flex items-center gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wider border-r transition-all duration-200",
              activeTab === "roles"
                ? "bg-background text-indigo-500 border-b-2 border-b-indigo-500"
                : "text-muted-foreground hover:bg-card/30 hover:text-foreground"
            )}
          >
            <Layers className="h-4 w-4" />
            Sprawled &amp; Overprivileged Roles ({rolesOver.length + rolesBreaks.length})
          </button>
          <button
            onClick={() => setActiveTab("folders")}
            className={cn(
              "flex items-center gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wider transition-all duration-200",
              activeTab === "folders"
                ? "bg-background text-indigo-500 border-b-2 border-b-indigo-500"
                : "text-muted-foreground hover:bg-card/30 hover:text-foreground"
            )}
          >
            <FolderLock className="h-4 w-4" />
            Level 2 Path Anomalies ({folderLockouts.length + folderSprawl.length})
          </button>
        </div>

        <div className="p-6">
          {/* TAB 1: WORST USERS */}
          {activeTab === "users" && (
            <div className="space-y-8">
              {/* Row 1: High Project Footprints */}
              <div>
                <h3 className="text-sm font-bold text-foreground/90 flex items-center gap-2 mb-4">
                  <span className="flex h-2 w-2 rounded-full bg-amber-500" />
                  Top Users by Project Presence &amp; Identity Consolidation
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {usersFootprint.slice(0, 4).map((u, idx) => (
                    <div 
                      key={u.email} 
                      className="p-4 rounded-xl border border-border/60 bg-card/25 hover:border-amber-500/30 transition-all duration-300 relative group overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-3 text-4xl font-extrabold text-foreground/[0.04] group-hover:text-foreground/[0.08] transition-colors">
                        #{idx + 1}
                      </div>
                      <div className="font-bold text-sm tracking-tight">{u.name}</div>
                      <div className="text-[10px] text-muted-foreground">{u.email}</div>
                      <div className="text-[10px] font-semibold text-indigo-400 mt-1">{u.company || "Hermosillo Hub"}</div>
                      
                      <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-border/40 text-xs">
                        <div>
                          <div className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Project Presence</div>
                          <div className="font-extrabold text-amber-500 text-lg mt-0.5">{u.projectCount} <span className="text-[10px] text-muted-foreground font-normal">projects</span></div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Roles Held</div>
                          <div className="font-extrabold text-foreground text-lg mt-0.5">{u.distinctRoles} <span className="text-[10px] text-muted-foreground font-normal">roles</span></div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1">
                        {u.rolesHeld?.slice(0, 4).map((role: string) => (
                          <Badge key={role} variant="outline" className="text-[9px] px-1.5 py-px border-indigo-500/10 text-indigo-400 bg-indigo-500/[0.02]">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Row 2: High Blast Radii */}
              <div>
                <h3 className="text-sm font-bold text-foreground/90 flex items-center gap-2 mb-4">
                  <span className="flex h-2 w-2 rounded-full bg-rose-500" />
                  Top Users by Folder Blast Radius (Cumulative Write/Admin Access)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {usersBlast.slice(0, 4).map((u, idx) => (
                    <div 
                      key={u.email} 
                      className="p-4 rounded-xl border border-border/60 bg-card/25 hover:border-rose-500/30 transition-all duration-300 relative group overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-3 text-4xl font-extrabold text-foreground/[0.04] group-hover:text-foreground/[0.08] transition-colors">
                        #{idx + 1}
                      </div>
                      <div className="font-bold text-sm tracking-tight">{u.name}</div>
                      <div className="text-[10px] text-muted-foreground">{u.email}</div>
                      <div className="text-[10px] font-semibold text-rose-400 mt-1">{u.company || "Hermosillo Hub"}</div>
                      
                      <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-border/40 text-xs">
                        <div>
                          <div className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Write Blast Radius</div>
                          <div className="font-extrabold text-rose-500 text-lg mt-0.5">{u.writeFolderCount} <span className="text-[10px] text-muted-foreground font-normal">folders</span></div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Admin Full Control</div>
                          <div className="font-extrabold text-foreground text-lg mt-0.5">{u.adminFolderCount} <span className="text-[10px] text-muted-foreground font-normal">folders</span></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SPRAWLED & OVERPRIVILEGED ROLES */}
          {activeTab === "roles" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Overprivileged non-admin full controllers */}
              <div>
                <h3 className="text-sm font-bold text-foreground/90 flex items-center gap-2 mb-4">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                  Over-Privileged Roles (Non-Admin Full Controllers)
                </h3>
                <div className="space-y-3">
                  {rolesOver.map((r, idx) => (
                    <div 
                      key={r.roleName}
                      className="p-3.5 rounded-xl border border-border/60 bg-card/20 hover:border-rose-500/20 transition-all duration-200 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold text-foreground">{r.roleName}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Active as administrator in <span className="font-semibold text-foreground/80">{r.projectCount} projects</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="px-2 py-1 text-[10px] font-bold border-rose-500/20 text-rose-500 bg-rose-500/[0.03]">
                        {r.fullControllerCount} Admin Folders
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Inheritance breaks */}
              <div>
                <h3 className="text-sm font-bold text-foreground/90 flex items-center gap-2 mb-4">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-indigo-500" />
                  Roles Driving Permission Inheritance Breaks
                </h3>
                <div className="space-y-3">
                  {rolesBreaks.slice(0, 5).map((r, idx) => (
                    <div 
                      key={r.roleName}
                      className="p-3.5 rounded-xl border border-border/60 bg-card/20 hover:border-indigo-500/20 transition-all duration-200 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold text-foreground">{r.roleName}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Incurs <span className="font-semibold text-foreground/80">{r.averageAssignmentsPerProject} manual overrides</span> per project
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-extrabold text-indigo-400">{Number(r.totalFolderAssignments).toLocaleString()}</div>
                        <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Manual Overrides</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LEVEL 2 PATH ANOMALIES */}
          {activeTab === "folders" && (
            <div className="space-y-8">
              {/* Lockouts */}
              <div>
                <h3 className="text-sm font-bold text-rose-500 flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  Lock-Out Risks: Standard Level 2 Folders Missing Architect Permissions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {folderLockouts.slice(0, 6).map((l, idx) => (
                    <div 
                      key={idx}
                      className="p-3.5 rounded-xl border border-rose-500/10 bg-rose-500/[0.02] flex flex-col justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                          {l.folderName}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-semibold mt-1">
                          Project: {l.projectName}
                        </div>
                        <div className="text-[9px] bg-card px-2 py-1 rounded text-muted-foreground tracking-tight font-mono mt-2 flex items-center gap-1 shrink-0">
                          <ChevronRight className="h-3 w-3 inline text-indigo-500" />
                          {l.folderPath}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sprawl Folders */}
              <div>
                <h3 className="text-sm font-bold text-amber-500 flex items-center gap-2 mb-4">
                  <Grid className="h-4 w-4" />
                  Wide-Open Paths: Excessive Direct Role Configurations on Level 2 Folders
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {folderSprawl.slice(0, 6).map((s, idx) => (
                    <div 
                      key={idx}
                      className="p-3.5 rounded-xl border border-amber-500/10 bg-amber-500/[0.02] flex items-center justify-between"
                    >
                      <div className="min-w-0 pr-4">
                        <div className="text-xs font-bold text-amber-500 truncate">{s.folderName}</div>
                        <div className="text-[10px] text-muted-foreground font-semibold mt-0.5 truncate">
                          Project: {s.projectName}
                        </div>
                        <div className="text-[9px] bg-card px-2 py-1 rounded text-muted-foreground tracking-tight font-mono mt-2 flex items-center gap-1">
                          <ChevronRight className="h-3 w-3 inline text-indigo-500 shrink-0" />
                          <span className="truncate">{s.folderPath}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="px-2.5 py-1 text-[10px] font-bold border-amber-500/20 text-amber-500 bg-amber-500/[0.03] shrink-0">
                        {s.totalRoles} Active Roles
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
