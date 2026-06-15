"use client";
import { useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import type { FormaFolder } from "@/lib/forma/inheritance";
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

  // Keep the active role valid as the list changes.
  const activeRole = d.draft.roles.find((r) => r.id === activeRoleId) ?? d.draft.roles[0];
  const activeId = activeRole?.id ?? "";
  const explicit = d.draft.assignments[activeId] ?? {};

  const exportInput = (): ExportInput => ({
    templateProjectId: templateId,
    templateName,
    roles: d.draft.roles,
    folders,
    assignments: d.draft.assignments,
  });

  if (!d.hydrated) {
    return <div className="p-8 text-sm text-muted-foreground">Loading your draft…</div>;
  }

  return (
    <div className="flex h-full min-h-0">
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
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {activeRole?.label ?? "—"}
            </h2>
            <p className="truncate text-xs text-muted-foreground">{templateName} · draft</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => download(`forma-proposal-${templateId}.json`, toJson(exportInput()), "application/json")}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/40"
            >
              <Download size={13} /> JSON
            </button>
            <button
              type="button"
              onClick={() => download(`forma-proposal-${templateId}.csv`, toCsv(exportInput()), "text/csv")}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/40"
            >
              <Download size={13} /> CSV
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Reset the whole draft to blank?")) d.reset();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
            >
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-2">
          {activeId ? (
            <FolderTreeAssign
              index={d.index}
              explicit={explicit}
              onSet={(folderId, tier) => d.setTier(activeId, folderId, tier)}
              onClear={(folderId) => d.clearTier(activeId, folderId)}
              onApplySubtree={(folderId, tier) => d.applySubtree(activeId, folderId, tier)}
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">Add a role to begin.</p>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide">Legend</span>
          {FORMA_TIERS.map((t) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: TIER_COLOR[t] }} />
              {TIER_SHORT[t]}
            </span>
          ))}
        </footer>
      </section>

      <RoleManagerDialog
        state={dialog}
        existingIds={d.draft.roles.map((r) => r.id)}
        onAdd={(role) => {
          d.addRole(role);
          setActiveRoleId(role.id);
        }}
        onRename={d.renameRole}
        onDelete={(roleId) => {
          d.deleteRole(roleId);
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
