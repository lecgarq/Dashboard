"use client";

import { useEffect, useMemo } from "react";
import { X, ExternalLink, AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { CompactionCandidate } from "@/lib/acc/compactionAnalysis";
import { moduleLabel } from "@/lib/acc/modules";
import { parseProductsJson, type ProductTier } from "@/lib/acc/productsTierMap";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Tier priority for tie-breaking when computing the "across all projects" summary tier.
// Order: administrator > member > none > other (passthrough strings).
const TIER_PRIORITY: Record<string, number> = {
  administrator: 3,
  member: 2,
  none: 1,
};

function tierBadgeVariant(tier: string): "default" | "secondary" | "outline" {
  if (tier === "administrator") return "default";
  if (tier === "member") return "secondary";
  return "outline";
}

interface ModuleAggregate {
  moduleKey: string;
  label: string;
  summaryTier: string;
  summaryTierLabel: string;
  isUnknownModule: boolean;
  deviations: Array<{
    projectId: string;
    projectName: string;
    tier: string;
    tierLabel: string;
  }>;
}

function aggregateModuleAccess(
  productsRows: ReadonlyArray<{ projectId: string; projectName: string; products: unknown }>,
): ModuleAggregate[] {
  // Parse each project's products → ProductTier[]
  const parsedByProject = productsRows.map((row) => ({
    projectId: row.projectId,
    projectName: row.projectName,
    tiers: parseProductsJson(row.products),
  }));

  // Map<moduleKey, { tierCounts, perProject, label, isUnknownModule }>
  const moduleMap = new Map<
    string,
    {
      label: string;
      isUnknownModule: boolean;
      tierCounts: Map<string, number>;
      perProject: Array<{
        projectId: string;
        projectName: string;
        tier: string;
        tierLabel: string;
      }>;
    }
  >();

  for (const { projectId, projectName, tiers } of parsedByProject) {
    for (const t of tiers) {
      let entry = moduleMap.get(t.module);
      if (!entry) {
        entry = {
          label: t.label,
          isUnknownModule: t.isUnknownModule,
          tierCounts: new Map(),
          perProject: [],
        };
        moduleMap.set(t.module, entry);
      }
      const tierStr = String(t.tier);
      entry.tierCounts.set(tierStr, (entry.tierCounts.get(tierStr) ?? 0) + 1);
      entry.perProject.push({
        projectId,
        projectName,
        tier: tierStr,
        tierLabel: t.tierLabel,
      });
    }
  }

  const result: ModuleAggregate[] = [];
  for (const [moduleKey, entry] of moduleMap.entries()) {
    // Highest-count tier wins; tie broken by TIER_PRIORITY (administrator > member > none > other).
    let summaryTier = "";
    let summaryCount = -1;
    let summaryPriority = -1;
    for (const [tier, count] of entry.tierCounts.entries()) {
      const priority = TIER_PRIORITY[tier] ?? 0;
      if (
        count > summaryCount ||
        (count === summaryCount && priority > summaryPriority)
      ) {
        summaryTier = tier;
        summaryCount = count;
        summaryPriority = priority;
      }
    }
    const summaryEntry = entry.perProject.find((p) => p.tier === summaryTier);
    const summaryTierLabel = summaryEntry?.tierLabel ?? summaryTier;
    const deviations = entry.perProject.filter((p) => p.tier !== summaryTier);
    result.push({
      moduleKey,
      label: entry.label,
      summaryTier,
      summaryTierLabel,
      isUnknownModule: entry.isUnknownModule,
      deviations,
    });
  }
  // Stable display order: known modules first, then unknown; alphabetical within each group.
  result.sort((a, b) => {
    if (a.isUnknownModule !== b.isUnknownModule) return a.isUnknownModule ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
  return result;
}

function ModuleAccessSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-8 rounded-lg bg-muted/40 animate-pulse" />
      ))}
    </div>
  );
}

interface ModuleAccessSectionProps {
  email: string;
  onApplyModuleFilter?: (moduleKey: string, tier: string) => void;
}

function ModuleAccessSection({ email, onApplyModuleFilter }: ModuleAccessSectionProps) {
  const { data: productsRows, isLoading } = trpc.accMembers.getProductsForUser.useQuery(
    { email },
    { enabled: !!email, staleTime: 300_000 },
  );

  const aggregated = useMemo<ModuleAggregate[]>(() => {
    if (!productsRows || productsRows.length === 0) return [];
    return aggregateModuleAccess(productsRows);
  }, [productsRows]);

  const handleClick = (mod: ModuleAggregate) => {
    if (onApplyModuleFilter) onApplyModuleFilter(mod.moduleKey, mod.summaryTier);
  };

  return (
    <div>
      {/* Native <details> avoids introducing a new shadcn Collapsible primitive (CONTEXT lock). */}
      <details open className="group">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-2 py-1 select-none">
          <span className="text-xs font-semibold text-foreground">Module Access</span>
          <ChevronDown size={12} className="text-muted-foreground transition-transform group-open:rotate-0 -rotate-90" />
        </summary>
        <div className="mt-2 space-y-1.5">
          {isLoading ? <ModuleAccessSkeleton /> : null}
          {!isLoading && (!productsRows || productsRows.length === 0 || aggregated.length === 0) ? (
            <p className="text-xs text-muted-foreground">No module assignments.</p>
          ) : null}
          {!isLoading && aggregated.length > 0 ? (
            <TooltipProvider delayDuration={150}>
              {aggregated.map((mod) => (
                <button
                  key={mod.moduleKey}
                  type="button"
                  onClick={() => handleClick(mod)}
                  className="w-full text-left rounded-lg border border-border/30 bg-card/60 hover:bg-card hover:border-border/60 px-3 py-2 transition-all"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {mod.isUnknownModule ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <span className="text-xs">Unknown module from APS</span>
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                    <span className="text-xs font-medium text-foreground">{mod.label}</span>
                    <Badge
                      variant={tierBadgeVariant(mod.summaryTier)}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {mod.summaryTierLabel}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">across all projects</span>
                  </div>
                  {mod.deviations.length > 0 ? (
                    <ul className="ml-4 mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                      {mod.deviations.map((d) => (
                        <li key={d.projectId} className="flex items-center gap-1.5 flex-wrap">
                          <span>except</span>
                          <span className="font-medium text-foreground/80 truncate max-w-[180px]">{d.projectName}</span>
                          <span>:</span>
                          <Badge
                            variant={tierBadgeVariant(d.tier)}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {d.tierLabel}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </button>
              ))}
            </TooltipProvider>
          ) : null}
        </div>
      </details>
    </div>
  );
}

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
  /**
   * LIST-04 click-through: emits module+tier when a row in the Module Access section is clicked.
   * Consumer is responsible for narrowing the directory list (CONTEXT lock: facet-reduction is the spotlight).
   */
  onApplyModuleFilter?: (moduleKey: string, tier: string) => void;
}

export function AccUserSidePanel({ user, candidate, onClose, onViewProfile, onApplyModuleFilter }: AccUserSidePanelProps) {
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

              <div className="flex items-baseline justify-between gap-2 py-1">
                <span className="text-xs text-muted-foreground shrink-0">Last Activity</span>
                <span className="text-xs text-foreground text-right truncate">
                  {user.lastSignIn
                    ? new Date(user.lastSignIn).toLocaleDateString()
                    : "Unknown"}
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

              {/* LIST-04: Module Access section — clean append, expanded by default, never renders raw JSON. */}
              {user.email && (
                <ModuleAccessSection
                  email={user.email}
                  onApplyModuleFilter={onApplyModuleFilter}
                />
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
