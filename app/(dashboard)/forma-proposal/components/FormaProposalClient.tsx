"use client";
import { useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { countExplicit, type FormaFolder } from "@/lib/forma/inheritance";
import { toCsv, toJson, type ExportInput } from "@/lib/forma/exportProposal";
import { FORMA_TIERS, TIER_COLOR, TIER_SHORT } from "@/lib/forma/tiers";
import { useFormaDraft } from "./useFormaDraft";
import { RoleRail } from "./RoleRail";
import { FolderTreeAssign } from "./FolderTreeAssign";
import { RoleManagerDialog, type RoleDialogState } from "./RoleManagerDialog";

function download(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const barButton =
  "inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-foreground/80 transition-all duration-150 hover:-translate-y-px hover:border-border hover:text-foreground hover:shadow-sm active:translate-y-0";

export function FormaProposalClient({
  templateId, templateName, folders,
}: {
  templateId: string;
  templateName: string;
  folders: FormaFolder[];
}) {
  const d = useFormaDraft(templateId, folders);
  const [activeRoleId, setActiveRoleId] = useState<string>(d.draft.roles[0]?.id ?? "");
  const [dialog, setDialog] = useState<RoleDialogState>(null);

  const activeRole = d.draft.roles.find((r) => r.id === activeRoleId) ?? d.draft.roles[0];
  const activeId = activeRole?.id ?? "";
  const explicit = d.draft.assignments[activeId] ?? {};
  const folderCount = d.index.byId.size;
  const coverage = countExplicit(explicit);

  const exportInput = (): ExportInput => ({
    templateProjectId: templateId,
    templateName,
    roles: d.draft.roles,
    folders,
    assignments: d.draft.assignments,
  });

  if (!d.hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading your draft…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="text-sm font-semibold tracking-tight text-foreground">Forma Proposal</h1>
          <span className="hidden items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline-flex">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
            {templateName} · local draft · never synced to ACC
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className={barButton}
            onClick={() => download(`forma-proposal-${templateId}.json`, toJson(exportInput()), "application/json")}>
            <Download className="h-3.5 w-3.5" /> JSON
          </button>
          <button type="button" className={barButton}
            onClick={() => download(`forma-proposal-${templateId}.csv`, toCsv(exportInput()), "text/csv")}>
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button type="button"
            className={cn(barButton, "text-destructive/80 hover:text-destructive")}
            onClick={() => { if (window.confirm("Reset the whole draft to blank?")) d.reset(); }}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </header>

      {/* Split: roles | tree */}
      <div className="flex min-h-0 flex-1">
        <RoleRail
          roles={d.draft.roles}
          assignments={d.draft.assignments}
          activeRoleId={activeId}
          onSelect={setActiveRoleId}
          onAddRole={() => setDialog({ mode: "add" })}
          onManage={(roleId) => {
            const role = d.draft.roles.find((r) => r.id === roleId);
            if (role) setDialog({ mode: "edit", role });
          }}
        />

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
            <div className="min-w-0">
              <h2 className="truncate text-[13px] font-semibold text-foreground">
                {activeRole?.label ?? "—"}
              </h2>
              <p className="truncate text-[11px] text-muted-foreground">
                {activeRole?.group ?? ""}
                {activeRole ? " · " : ""}
                <span className="tabular-nums">{coverage}</span> of{" "}
                <span className="tabular-nums">{folderCount}</span> folders set
              </p>
            </div>
          </div>

          {activeId ? (
            <div
              key={activeId}
              className="flex-1 animate-in fade-in-50 overflow-y-auto p-2 duration-200"
            >
              <FolderTreeAssign
                index={d.index}
                explicit={explicit}
                onSet={(folderId, tier) => d.setTier(activeId, folderId, tier)}
                onClear={(folderId) => d.clearTier(activeId, folderId)}
                onApplySubtree={(folderId, tier) => d.applySubtree(activeId, folderId, tier)}
              />
            </div>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">Add a role to begin.</p>
          )}

          <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 px-4 py-2 text-[10px] text-muted-foreground">
            <span className="font-semibold uppercase tracking-wide">Tiers</span>
            {FORMA_TIERS.map((t) => (
              <span key={t} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TIER_COLOR[t] }} />
                {TIER_SHORT[t]}
              </span>
            ))}
          </footer>
        </section>
      </div>

      <RoleManagerDialog
        state={dialog}
        existingIds={d.draft.roles.map((r) => r.id)}
        onAdd={(role) => { d.addRole(role); setActiveRoleId(role.id); }}
        onRename={d.renameRole}
        onDelete={(roleId) => { d.deleteRole(roleId); }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
