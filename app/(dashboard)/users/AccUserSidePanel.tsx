"use client";

import { useEffect } from "react";
import { X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/core/utils";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { CompactionCandidate } from "@/lib/acc/compactionAnalysis";
import { moduleLabel } from "@/lib/acc/modules";

const FLAG_META = {
  "junk-role": { label: "Junk Role", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  "module-discrepancy": { label: "Module Discrepancy", cls: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  "duplicate-role": { label: "Duplicate Role", cls: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  inactive: { label: "Inactive", cls: "text-red-400 bg-red-500/10 border-red-500/20" },
} as const;

interface AccUserSidePanelProps {
  user: BulkAccUser | null;
  candidate?: CompactionCandidate;
  onClose: () => void;
  onViewProfile?: (email: string) => void;
}

export function AccUserSidePanel({ user, candidate, onClose, onViewProfile }: AccUserSidePanelProps) {
  useEffect(() => {
    if (!user) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [user, onClose]);

  return (
    <>
      {user && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      )}
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 w-[400px] max-w-[90vw] bg-background border-l border-border z-50 flex flex-col transition-transform duration-200 ease-out",
          user ? "translate-x-0" : "translate-x-full",
        )}
      >
        {user && (
          <>
            <div className="flex items-start justify-between gap-3 p-5 border-b border-border/40">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">{user.name || user.email}</h3>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                {user.syncedAt && (
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    Synced {new Date(user.syncedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
                <X size={16} />
              </button>
            </div>

            {candidate && candidate.flags.length > 0 && (
              <div className="px-5 py-3 border-b border-border/40 flex flex-wrap gap-1.5">
                {candidate.flags.map((flag) => {
                  const meta = FLAG_META[flag];
                  return (
                    <span key={flag} className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", meta.cls)}>
                      {meta.label}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Projects", value: user.projectCount },
                  { label: "Active", value: user.activeCount },
                  { label: "Admin on", value: user.adminCount },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-border/30 bg-card p-3 text-center">
                    <p className="text-base font-bold text-foreground">{value}</p>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-baseline justify-between gap-2 py-1">
                <span className="text-xs text-muted-foreground shrink-0">Company Role</span>
                <span className="text-xs text-foreground text-right truncate">
                  {user.companyRole ?? "Unspecified"}
                </span>
              </div>

              {candidate && (
                <>
                  {candidate.junkRoles.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-amber-400 mb-2">Junk Roles</p>
                      <div className="space-y-1">
                        {candidate.junkRoles.map((jr, i) => (
                          <div key={i} className="rounded-lg bg-amber-500/5 border border-amber-500/15 px-3 py-2 text-xs">
                            <span className="font-medium text-foreground">{jr.role}</span>
                            <span className="text-muted-foreground"> in {jr.project} </span>
                            <span className="text-muted-foreground">({jr.globalCount} user{jr.globalCount !== 1 ? "s" : ""} globally)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {candidate.moduleDiscrepancies.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-blue-400 mb-2">Module Discrepancies</p>
                      <div className="space-y-2">
                        {candidate.moduleDiscrepancies.map((md, i) => (
                          <div key={i} className="rounded-lg bg-blue-500/5 border border-blue-500/15 px-3 py-2 text-xs space-y-1">
                            <p className="font-medium text-foreground">{md.project} - {md.role}</p>
                            {md.unexpectedModules.length > 0 && (
                              <p className="text-muted-foreground">
                                Unexpected: {md.unexpectedModules.map(moduleLabel).join(", ")}
                              </p>
                            )}
                            {md.missingModules.length > 0 && (
                              <p className="text-muted-foreground">
                                Missing: {md.missingModules.map(moduleLabel).join(", ")}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {candidate.duplicateRoles.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-violet-400 mb-2">Duplicate Roles</p>
                      <div className="space-y-1">
                        {candidate.duplicateRoles.map((dr, i) => (
                          <div key={i} className="rounded-lg bg-violet-500/5 border border-violet-500/15 px-3 py-2 text-xs">
                            <span className="font-medium text-foreground">{dr.role}</span>
                            <span className="text-muted-foreground"> appears in {dr.projects.length} projects: </span>
                            <span className="text-foreground">{dr.projects.join(", ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {user.projects.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-2">
                    All Projects ({user.projects.length})
                  </p>
                  <div className="space-y-2">
                    {user.projects.map((p) => (
                      <div key={p.id} className="rounded-xl border border-border/30 bg-card/60 p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-foreground truncate">{p.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {p.isAdmin && <span className="text-[9px] text-emerald-400 font-bold">ADMIN</span>}
                            <span className={cn(
                              "text-[9px] font-medium px-1.5 py-0.5 rounded",
                              p.status === "ACTIVE"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-muted/20 text-muted-foreground",
                            )}>
                              {p.status}
                            </span>
                          </div>
                        </div>
                        {p.roles.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {p.roles.map((r) => (
                              <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                        {p.modules.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {p.modules.map((m) => (
                              <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                {moduleLabel(m)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {onViewProfile && (
              <div className="p-4 border-t border-border/40">
                <button
                  onClick={() => onViewProfile(user.email)}
                  className="w-full flex items-center justify-center gap-2 text-xs text-primary hover:text-primary/80 border border-primary/20 rounded-xl px-3 py-2.5 bg-primary/5 hover:bg-primary/10 transition-all"
                >
                  <ExternalLink size={12} />
                  View Full Profile
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
