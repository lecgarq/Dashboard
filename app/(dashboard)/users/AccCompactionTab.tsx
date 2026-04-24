"use client";

import { useState } from "react";
import { cn } from "@/lib/core/utils";
import { AccInsightCard } from "./AccInsightCard";
import { AccCompactionTable } from "./AccCompactionTable";
import type { CompactionCandidate, CompactionResult } from "@/lib/acc/compactionAnalysis";

interface AccCompactionTabProps {
  result: CompactionResult;
  onSelectUser: (email: string) => void;
}

const FLAG_CHIP_CLASSES = {
  "junk-role": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "module-discrepancy": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "duplicate-role": "bg-violet-500/10 text-violet-400 border-violet-500/20",
  inactive: "bg-red-500/10 text-red-400 border-red-500/20",
} as const;

type ExpandedCard = "junk-role" | "module-discrepancy" | "duplicate-role" | "inactive" | null;

export function AccCompactionTab({ result, onSelectUser }: AccCompactionTabProps) {
  const [expanded, setExpanded] = useState<ExpandedCard>(null);

  function toggle(card: ExpandedCard) {
    setExpanded((current) => (current === card ? null : card));
  }

  const { byFlag, totalCandidates } = result;

  return (
    <div className="space-y-5">

      {/* Verdict headline */}
      <div className="rounded-2xl border border-border/30 bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground">
              {totalCandidates > 0 ? (
                <>{totalCandidates} compaction candidate{totalCandidates !== 1 ? "s" : ""}</>
              ) : (
                "No compaction candidates found"
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalCandidates > 0
                ? "Users flagged with at least one access anomaly - review before removing licenses."
                : "All synced users have clean role and module assignments."}
            </p>
          </div>
          {totalCandidates > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(["junk-role", "module-discrepancy", "duplicate-role", "inactive"] as const).map((flag) => {
                const count = byFlag[flag].length;
                if (count === 0) return null;
                return (
                  <span key={flag} className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full border", FLAG_CHIP_CLASSES[flag])}>
                    {count} {flag === "junk-role" ? "junk role" : flag === "module-discrepancy" ? "module discrepancy" : flag === "duplicate-role" ? "duplicate role" : "inactive"}
                    {count !== 1 ? "s" : ""}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Insight cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AccInsightCard
          title="Junk Roles"
          count={byFlag["junk-role"].length}
          description="Roles assigned to <=2 users across the hub - likely misconfigured or leftover"
          variant="amber"
          isExpanded={expanded === "junk-role"}
          onToggle={() => toggle("junk-role")}
        >
          <JunkRoleDetails candidates={byFlag["junk-role"]} onSelectUser={onSelectUser} />
        </AccInsightCard>

        <AccInsightCard
          title="Module Discrepancies"
          count={byFlag["module-discrepancy"].length}
          description="Module access deviates from others with the same role in the same project"
          variant="blue"
          isExpanded={expanded === "module-discrepancy"}
          onToggle={() => toggle("module-discrepancy")}
        >
          <ModuleDiscrepancyDetails candidates={byFlag["module-discrepancy"]} onSelectUser={onSelectUser} />
        </AccInsightCard>

        <AccInsightCard
          title="Duplicate Roles"
          count={byFlag["duplicate-role"].length}
          description="Same role assigned across 2+ projects for the same user"
          variant="violet"
          isExpanded={expanded === "duplicate-role"}
          onToggle={() => toggle("duplicate-role")}
        >
          <DuplicateRoleDetails candidates={byFlag["duplicate-role"]} onSelectUser={onSelectUser} />
        </AccInsightCard>

        <AccInsightCard
          title="Inactive Users"
          count={byFlag["inactive"].length}
          description="Synced users with zero active projects"
          variant="red"
          isExpanded={expanded === "inactive"}
          onToggle={() => toggle("inactive")}
        >
          <InactiveDetails candidates={byFlag["inactive"]} onSelectUser={onSelectUser} />
        </AccInsightCard>
      </div>

      {/* Full compaction table */}
      {totalCandidates > 0 && (
        <div className="rounded-2xl border border-border/30 bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold text-foreground">All Compaction Candidates</h3>
            <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full bg-muted/30 text-muted-foreground border border-border/30">
              {totalCandidates}
            </span>
          </div>
          <AccCompactionTable candidates={result.candidates} onSelectUser={onSelectUser} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline card detail views
// ---------------------------------------------------------------------------

const ROWS_PREVIEW = 5;

function ShowAllButton({ total, shown, onToggle }: { total: number; shown: boolean; onToggle: () => void }) {
  if (total <= ROWS_PREVIEW) return null;
  return (
    <button onClick={onToggle} className="mt-2 text-xs text-primary hover:text-primary/80 transition-colors">
      {shown ? "Show less" : `Show all ${total}`}
    </button>
  );
}

function UserRow({ name, email, onClick }: { name: string; email: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left hover:opacity-80 transition-opacity">
      <span className="text-xs font-medium text-foreground">{name || email}</span>
      <span className="text-[10px] text-muted-foreground ml-1.5">{email}</span>
    </button>
  );
}

function JunkRoleDetails({ candidates, onSelectUser }: { candidates: CompactionCandidate[]; onSelectUser: (email: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const rows = candidates.flatMap((c: any) =>
    c.junkRoles.map((jr: any) => ({ user: c.user, ...jr }))
  );
  const visible = showAll ? rows : rows.slice(0, ROWS_PREVIEW);
  return (
    <div className="space-y-2">
      {visible.map((row: any, i: number) => (
        <div key={i} className="rounded-lg bg-amber-500/5 border border-amber-500/15 px-3 py-2 space-y-0.5">
          <UserRow name={row.user.name} email={row.user.email} onClick={() => onSelectUser(row.user.email)} />
          <p className="text-[10px] text-muted-foreground">
            Role <span className="text-amber-400 font-medium">{row.role}</span> in {row.project}
            <span className="ml-1">({row.globalCount} user{row.globalCount !== 1 ? "s" : ""} globally)</span>
          </p>
        </div>
      ))}
      <ShowAllButton total={rows.length} shown={showAll} onToggle={() => setShowAll((v) => !v)} />
    </div>
  );
}

function ModuleDiscrepancyDetails({ candidates, onSelectUser }: { candidates: any[]; onSelectUser: (email: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const rows = candidates.flatMap((c: any) =>
    c.moduleDiscrepancies.map((md: any) => ({ user: c.user, ...md }))
  );
  const visible = showAll ? rows : rows.slice(0, ROWS_PREVIEW);
  return (
    <div className="space-y-2">
      {visible.map((row: any, i: number) => (
        <div key={i} className="rounded-lg bg-blue-500/5 border border-blue-500/15 px-3 py-2 space-y-0.5">
          <UserRow name={row.user.name} email={row.user.email} onClick={() => onSelectUser(row.user.email)} />
          <p className="text-[10px] text-muted-foreground">
            <span className="text-blue-400 font-medium">{row.role}</span> in {row.project}
          </p>
          {row.unexpectedModules.length > 0 && (
            <p className="text-[10px] text-muted-foreground">Unexpected: {row.unexpectedModules.join(", ")}</p>
          )}
          {row.missingModules.length > 0 && (
            <p className="text-[10px] text-muted-foreground">Missing: {row.missingModules.join(", ")}</p>
          )}
        </div>
      ))}
      <ShowAllButton total={rows.length} shown={showAll} onToggle={() => setShowAll((v) => !v)} />
    </div>
  );
}

function DuplicateRoleDetails({ candidates, onSelectUser }: { candidates: any[]; onSelectUser: (email: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const rows = candidates.flatMap((c: any) =>
    c.duplicateRoles.map((dr: any) => ({ user: c.user, ...dr }))
  );
  const visible = showAll ? rows : rows.slice(0, ROWS_PREVIEW);
  return (
    <div className="space-y-2">
      {visible.map((row: any, i: number) => (
        <div key={i} className="rounded-lg bg-violet-500/5 border border-violet-500/15 px-3 py-2 space-y-0.5">
          <UserRow name={row.user.name} email={row.user.email} onClick={() => onSelectUser(row.user.email)} />
          <p className="text-[10px] text-muted-foreground">
            Role <span className="text-violet-400 font-medium">{row.role}</span> in {row.projects.length} projects: {row.projects.join(", ")}
          </p>
        </div>
      ))}
      <ShowAllButton total={rows.length} shown={showAll} onToggle={() => setShowAll((v) => !v)} />
    </div>
  );
}

function InactiveDetails({ candidates, onSelectUser }: { candidates: any[]; onSelectUser: (email: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? candidates : candidates.slice(0, ROWS_PREVIEW);
  return (
    <div className="space-y-2">
      {visible.map((c: any) => (
        <div key={c.user.email} className="rounded-lg bg-red-500/5 border border-red-500/15 px-3 py-2 space-y-0.5">
          <UserRow name={c.user.name} email={c.user.email} onClick={() => onSelectUser(c.user.email)} />
          <p className="text-[10px] text-muted-foreground">
            {c.user.projectCount} project{c.user.projectCount !== 1 ? "s" : ""} total - 0 active
            {c.user.syncedAt && ` - synced ${new Date(c.user.syncedAt).toLocaleDateString()}`}
          </p>
        </div>
      ))}
      <ShowAllButton total={candidates.length} shown={showAll} onToggle={() => setShowAll((v) => !v)} />
    </div>
  );
}
