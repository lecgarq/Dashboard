"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/core/utils";
import { analyzeCompactionCandidates } from "@/lib/acc/compactionAnalysis";
import { AccOverviewTab } from "./AccOverviewTab";
import { AccCompactionTab } from "./AccCompactionTab";
import { AccRolesTab } from "./AccRolesTab";
import { AccUserSidePanel } from "./AccUserSidePanel";

// Re-export types for backwards compatibility with existing importers
export type { BulkAccUser, BulkAccProject } from "@/lib/acc/acc-types";
import type { BulkAccUser } from "@/lib/acc/acc-types";

type SubTab = "overview" | "roles" | "compaction";

export function AccAnalysisPanel({
  users,
  onSelectUser: onViewProfile,
  onApplyModuleFilter,
}: {
  users: BulkAccUser[];
  onSelectUser?: (email: string) => void;
  /** LIST-04: forwarded to AccUserSidePanel so Module Access clicks can filter the directory. */
  onApplyModuleFilter?: (moduleKey: string, tier: string) => void;
}) {
  const [subTab, setSubTab] = useState<SubTab>("overview");

  // Side panel state
  const [sidePanelEmail, setSidePanelEmail] = useState<string | null>(null);

  const compactionResult = useMemo(() => analyzeCompactionCandidates(users), [users]);

  const candidateByEmail = useMemo(
    () => new Map(compactionResult.candidates.map((c) => [c.user.email, c])),
    [compactionResult.candidates],
  );

  const sidePanelUser = sidePanelEmail ? users.find((u) => u.email === sidePanelEmail) ?? null : null;
  const sidePanelCandidate = sidePanelEmail ? candidateByEmail.get(sidePanelEmail) : undefined;

  function openSidePanel(email: string) { setSidePanelEmail(email); }
  function closeSidePanel() { setSidePanelEmail(null); }

  const cachedCount = users.filter((u) => u.found).length;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground">ACC Hub Analysis</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {users.length} users &middot; {cachedCount} synced &middot; {compactionResult.totalCandidates} compaction candidate{compactionResult.totalCandidates !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Sub-tab switcher */}
      <div className="flex items-center gap-1 border-b border-border/40 pb-0">
        {(["overview", "roles", "compaction"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-all -mb-px flex items-center gap-1.5",
              subTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === "overview" ? "Overview" : tab === "roles" ? "Roles & Access" : "Compaction Analysis"}
            {tab === "compaction" && compactionResult.totalCandidates > 0 && (
              <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                {compactionResult.totalCandidates}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {subTab === "overview" && (
        <AccOverviewTab users={users} onSelectUser={openSidePanel} />
      )}
      {subTab === "roles" && (
        <AccRolesTab users={users} onSelectUser={openSidePanel} />
      )}
      {subTab === "compaction" && (
        <AccCompactionTab result={compactionResult} onSelectUser={openSidePanel} />
      )}

      {/* Shared side panel */}
      <AccUserSidePanel
        user={sidePanelUser}
        candidate={sidePanelCandidate}
        onClose={closeSidePanel}
        onViewProfile={onViewProfile ? (email) => { closeSidePanel(); onViewProfile(email); } : undefined}
        onApplyModuleFilter={onApplyModuleFilter}
      />
    </div>
  );
}
