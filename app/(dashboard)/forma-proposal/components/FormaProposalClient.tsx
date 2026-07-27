"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Download, RotateCcw, Undo2 } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { countExplicit, subtreeSize, type FormaFolder } from "@/lib/forma/inheritance";
import type { FormaTier } from "@/lib/forma/tiers";
import { toCsv, toJson, type ExportInput } from "@/lib/forma/exportProposal";
import { FORMA_TIERS, TIER_COLOR, TIER_SHORT } from "@/lib/forma/tiers";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { useFormaDraft } from "./useFormaDraft";
import { RoleRail } from "./RoleRail";
import { FolderTreeAssign } from "./FolderTreeAssign";
import { RoleManagerDialog, type RoleDialogState } from "./RoleManagerDialog";
import { ModeSwitch, type FormaMode } from "./ModeSwitch";
import { HierarchyViewSkeleton } from "./HierarchyViewSkeleton";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

// ---------------------------------------------------------------------------
// Dynamic imports — deferred bundles (FRM-01, FRM-02)
// ---------------------------------------------------------------------------

/**
 * HierarchyView — dynamic(ssr:false) defers the d3-hierarchy bundle (~15KB gz)
 * until hierarchy mode is first shown. The HierarchyViewSkeleton is shown while
 * the bundle loads. The public 8-prop API is unchanged (PERF-01).
 */
const HierarchyView = dynamic(
  () => import("./HierarchyView").then((m) => m.HierarchyView),
  {
    ssr: false,
    loading: () => <HierarchyViewSkeleton />,
  },
);

/**
 * FormaParticleAccent — dynamic(ssr:false) keeps WebGL off SSR and off the
 * data table bundle. Rendered as an absolute inset-0 background layer (z-0).
 * PERF-05: FormaParticleAccent.tsx is the ONLY R3F import under forma-proposal.
 */
const FormaParticleAccent = dynamic(
  () => import("./FormaParticleAccent"),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// FormaProposalClient
// ---------------------------------------------------------------------------
export function FormaProposalClient({
  templateId, templateName, folders,
}: {
  templateId: string;
  templateName: string;
  folders: FormaFolder[];
}) {
  const reducedMotion = useReducedMotion();
  const d = useFormaDraft(templateId, folders);
  const [activeRoleId, setActiveRoleId] = useState<string>(d.draft.roles[0]?.id ?? "");
  const [dialog, setDialog] = useState<RoleDialogState>(null);
  const [mode, setMode] = useState<FormaMode>("permissions");

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

  // One shared boundary for BOTH views (tree + hierarchy): a subtree apply is
  // the page's only bulk-destructive edit, so preview its blast radius first.
  const applySubtreeConfirmed = (folderId: string, tier: FormaTier) => {
    const n = subtreeSize(folderId, d.index);
    const name = d.index.byId.get(folderId)?.name ?? "this folder";
    if (
      n > 1 &&
      !window.confirm(`Set "${tier}" on ${n} folders — "${name}" and everything inside it? Existing overrides in the subtree are replaced.`)
    ) {
      return;
    }
    d.applySubtree(activeId, folderId, tier);
  };

  // ---------------------------------------------------------------------------
  // Idle prefetch — import the HierarchyView bundle after first paint so the
  // first mode-switch feels instant (FRM-01; RESEARCH "Idle prefetch pattern").
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const prefetch = () => {
      import("./HierarchyView");
    };

    if (typeof requestIdleCallback !== "undefined") {
      idleId = requestIdleCallback(prefetch);
    } else {
      // Safari fallback
      timeoutId = setTimeout(prefetch, 2000);
    }

    return () => {
      if (idleId !== undefined) cancelIdleCallback(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  if (!d.hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading your draft…
      </div>
    );
  }

  return (
    // Outermost container — relative so FormaParticleAccent can abs-position within it
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Particle accent — z-0, absolute inset-0, pointer-events:none (FRM-02, PERF-05).
          Skipped entirely under prefers-reduced-motion: it is a perpetual WebGL
          drift loop, which the CSS clamp in globals.css cannot reach. */}
      {!reducedMotion && <FormaParticleAccent />}

      {/* All editor content sits at z-[1] so it renders above the accent */}
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        {/* Top bar — light float polish (CONTEXT.md FRM-02) */}
        <PremiumSurface
          variant="float"
          className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="text-sm font-semibold tracking-tight text-foreground">Forma Proposal</h1>
            <span className="hidden items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground lg:inline-flex">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
              {templateName} · local draft · never synced to ACC
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ModeSwitch mode={mode} onChange={setMode} />
            <span aria-hidden className="h-5 w-px bg-border/60" />
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
        </PremiumSurface>

        {/* Draft-loss guard: persist failed (quota / private mode / storage off)
            — the draft now lives only in memory, so say so and push export. */}
        {d.saveFailed && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-foreground"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
            <span className="font-medium">This draft is not saving to your browser.</span>
            <span className="text-muted-foreground">
              Storage failed (full or blocked) — changes will be lost when you leave. Export now to keep your work.
            </span>
            <button
              type="button"
              className={cn(barButton, "ml-auto")}
              onClick={() => download(`forma-proposal-${templateId}.json`, toJson(exportInput()), "application/json")}
            >
              <Download className="h-3.5 w-3.5" /> Export JSON
            </button>
          </div>
        )}

        {/* Another tab wrote this draft. Persist is a whole-draft overwrite with
            no read-back, so without this the last writer silently destroys the
            other tab's work and neither tab is ever told. */}
        {d.otherTabChanged && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-foreground"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
            <span className="font-medium">This draft changed in another tab.</span>
            <span className="text-muted-foreground">
              Keeping this version overwrites the other tab&apos;s changes.
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" className={barButton} onClick={d.acceptOtherTab}>
                Load other tab&apos;s version
              </button>
              <button type="button" className={barButton} onClick={d.keepThisVersion}>
                Keep this version
              </button>
            </div>
          </div>
        )}

        {/* One-deep undo for the three paths that discard unreconstructable work
            (reset, subtree apply, role delete). Offered until the next edit. */}
        {d.undoLabel !== null && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs text-foreground"
          >
            <Undo2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>{d.undoLabel}.</span>
            <button type="button" className={cn(barButton, "ml-auto")} onClick={d.undo}>
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
          </div>
        )}

        {mode === "permissions" ? (
          <div className="flex min-h-0 flex-1">
            {/* Role rail — glass elevation on outer container; rows inside stay flat */}
            <PremiumSurface
              variant="glass"
              className="flex min-h-0 shrink-0 flex-col border-r border-border/60"
            >
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
            </PremiumSurface>

            {/* Editor section — base elevation on outer container; folder rows stay flat */}
            <PremiumSurface
              variant="base"
              className="flex min-w-0 flex-1 flex-col"
            >
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
                <div key={activeId} className="flex-1 animate-in fade-in-50 overflow-y-auto p-2 duration-200">
                  {/* FolderTreeAssign rows are flat (CONTEXT.md FRM-02) */}
                  <FolderTreeAssign
                    index={d.index}
                    explicit={explicit}
                    onSet={(folderId, tier) => d.setTier(activeId, folderId, tier)}
                    onClear={(folderId) => d.clearTier(activeId, folderId)}
                    onApplySubtree={applySubtreeConfirmed}
                  />
                </div>
              ) : (
                <p className="p-6 text-sm text-muted-foreground">Add a role to begin.</p>
              )}

              {/* Tier legend footer — chips stay flat (CONTEXT.md FRM-02) */}
              <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
                <span className="font-semibold uppercase tracking-wide">Tiers</span>
                {FORMA_TIERS.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TIER_COLOR[t] }} />
                    {TIER_SHORT[t]}
                  </span>
                ))}
              </footer>
            </PremiumSurface>
          </div>
        ) : (
          // Hierarchy view container — base elevation on outer shell
          <PremiumSurface variant="base" className="min-h-0 flex-1">
            <HierarchyView
              index={d.index}
              explicit={explicit}
              rootLabel={templateName}
              roles={d.draft.roles}
              activeRoleId={activeId}
              activeRoleLabel={activeRole?.label ?? "—"}
              onPickRole={setActiveRoleId}
              onSetTier={(folderId, tier) => d.setTier(activeId, folderId, tier)}
              onApplySubtree={applySubtreeConfirmed}
              onClear={(folderId) => d.clearTier(activeId, folderId)}
            />
          </PremiumSurface>
        )}
      </div>

      <RoleManagerDialog
        state={dialog}
        existingIds={d.draft.roles.map((r) => r.id)}
        assignmentCount={
          dialog?.mode === "edit" ? countExplicit(d.draft.assignments[dialog.role.id] ?? {}) : 0
        }
        onAdd={(role) => { d.addRole(role); setActiveRoleId(role.id); }}
        onRename={d.renameRole}
        onDelete={(roleId) => { d.deleteRole(roleId); }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
