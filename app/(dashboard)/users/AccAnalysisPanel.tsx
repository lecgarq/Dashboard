"use client";

import { useMemo, useState } from "react";
import { RefreshCw, CloudDownload } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";
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
  refetch,
  onSelectUser: onViewProfile,
}: {
  users: BulkAccUser[];
  refetch: () => void;
  onSelectUser?: (email: string) => void;
}) {
  const utils = trpc.useUtils();
  const [subTab, setSubTab] = useState<SubTab>("overview");

  // Sync state
  const [syncResult, setSyncResult] = useState<{ found: number; notFound: number; errors: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);

  // Side panel state
  const [sidePanelEmail, setSidePanelEmail] = useState<string | null>(null);

  const bulkSyncMutation = trpc.users.bulkAccSync.useMutation();
  const rebuildGraphMutation = trpc.users.rebuildAccGraphCache.useMutation();

  const compactionResult = useMemo(() => analyzeCompactionCandidates(users), [users]);

  const candidateByEmail = useMemo(
    () => new Map(compactionResult.candidates.map((c) => [c.user.email, c])),
    [compactionResult.candidates],
  );

  const sidePanelUser = sidePanelEmail ? users.find((u) => u.email === sidePanelEmail) ?? null : null;
  const sidePanelCandidate = sidePanelEmail ? candidateByEmail.get(sidePanelEmail) : undefined;

  function openSidePanel(email: string) { setSidePanelEmail(email); }
  function closeSidePanel() { setSidePanelEmail(null); }

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
        const result = await bulkSyncMutation.mutateAsync({ emails: chunk, rebuildGraphCache: false });
        found += result.found;
        notFound += result.notFound;
        errors += result.errors;
        setSyncProgress({ done: Math.min(i + CHUNK_SIZE, emails.length), total: emails.length });
      }
      await rebuildGraphMutation.mutateAsync();
      setSyncResult({ found, notFound, errors });
      utils.users.bulkAccSummary.invalidate();
      utils.users.getPrecomputedGraph.invalidate();
      refetch();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncProgress(null);
    }
  }

  const isSyncing = syncProgress !== null;
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
        <div className="flex items-center gap-2 flex-wrap">
          {syncError && !isSyncing && (
            <span className="text-xs text-red-400 max-w-[260px] truncate" title={syncError}>Error: {syncError}</span>
          )}
          {syncResult && !isSyncing && !syncError && (
            <span className="text-xs text-muted-foreground">
              Sync: {syncResult.found} found - {syncResult.notFound} not in ACC
              {syncResult.errors > 0 ? ` - ${syncResult.errors} errors` : ""}
            </span>
          )}
          {isSyncing && syncProgress && (
            <span className="text-xs text-muted-foreground">Syncing {syncProgress.done}/{syncProgress.total}...</span>
          )}
          <button
            onClick={runBulkSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 rounded-lg px-3 py-1.5 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSyncing ? <RefreshCw size={12} className="animate-spin" /> : <CloudDownload size={12} />}
            {isSyncing ? `Syncing ${users.length} users...` : "Sync All to ACC"}
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
      />
    </div>
  );
}
