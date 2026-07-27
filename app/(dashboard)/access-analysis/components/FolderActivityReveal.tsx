"use client";
import { useEffect, useMemo, useState } from "react";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { FolderActivityByRole } from "./FolderActivityByRole";
import {
  summarizeFolderProjects,
  type FolderActivitySummary,
  type FolderProjectRow,
} from "../folderActivityCounts";
import type { MembershipRolesInput } from "../roleActivityCounts";
import type { FolderRankTotal } from "@/lib/server/folderActivityView";

const FOLDER_TOP = 10;

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

/**
 * Lazy "expand to load" panel for Folder Activity by Role — FOLDER-FIRST
 * hierarchy (owner-directed inversion, 2026-07-07): the ranked folders come
 * first; expanding a folder reveals the projects it lives in (same-name folders
 * merge across projects), then the roles within each project, then the people.
 * Defers all querying until the user expands. Reads the page's project
 * selection (selectedProjectIds) and the in-memory memberships for role
 * attribution, so it stays consistent with the donuts above.
 */
export function FolderActivityReveal({
  selectedProjectIds,
  memberships,
  loadFolders,
  loadDetail,
  onUserClick,
}: {
  selectedProjectIds: string[];
  memberships: MembershipRolesInput[];
  loadFolders: (ids: string[]) => Promise<FolderRankTotal[]>;
  loadDetail: (folderName: string, ids: string[]) => Promise<FolderProjectRow[]>;
  onUserClick?: (email: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<FolderRankTotal[] | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [showAllFolders, setShowAllFolders] = useState(false);
  const [openFolder, setOpenFolder] = useState<Set<string>>(new Set());
  const [summaries, setSummaries] = useState<Map<string, FolderActivitySummary>>(new Map());

  const idsKey = useMemo(() => [...selectedProjectIds].sort().join(","), [selectedProjectIds]);

  // (Re)load the folder ranking whenever the panel is open and the selection changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingFolders(true);
    setFolders(null);
    setOpenFolder(new Set());
    setSummaries(new Map());
    loadFolders(selectedProjectIds)
      .then((rows) => {
        if (!cancelled) setFolders(rows);
      })
      .finally(() => {
        if (!cancelled) setLoadingFolders(false);
      });
    return () => {
      cancelled = true;
    };
    // idsKey captures selection identity; loadFolders is a stable server-action ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idsKey]);

  const buildSummary = async (folderName: string) => {
    if (summaries.has(folderName)) return;
    const rows = await loadDetail(folderName, selectedProjectIds);
    const summary = summarizeFolderProjects(rows, memberships);
    setSummaries((prev) => new Map(prev).set(folderName, summary));
  };

  const toggleFolder = (folderName: string) => {
    setOpenFolder((prev) => {
      const next = new Set(prev);
      next.has(folderName) ? next.delete(folderName) : next.add(folderName);
      return next;
    });
    void buildSummary(folderName);
  };

  const grandTotal = folders ? folders.reduce((s, f) => s + f.activity, 0) : 0;
  const visibleFolders = folders ? (showAllFolders ? folders : folders.slice(0, FOLDER_TOP)) : [];

  return (
    <PremiumSurface variant="base" className="flex flex-col gap-0 overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-4 p-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Folder Activity by Role</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Folders first — expand a folder to see the projects it lives in (same-name folders merge
            across projects), then each project&apos;s roles, then the people. Folder-scoped,
            user-attributed activity only; ticks above set the projects.
          </p>
        </div>
        <button
          type="button"
          data-testid="folder-activity-expand"
          onClick={() => setOpen((p) => !p)}
          aria-expanded={open}
          className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/20"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div data-testid="folder-activity-panel" className="px-5 pb-5">
          {loadingFolders && <p className="py-6 text-center text-sm text-muted-foreground">Loading folder activity…</p>}

          {!loadingFolders && folders && folders.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No folder activity for the selected projects.</p>
          )}

          {!loadingFolders && folders && folders.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {visibleFolders.map((f) => {
                const fOpen = openFolder.has(f.folderName);
                const summary = summaries.get(f.folderName);
                return (
                  <div key={f.folderName} data-testid="fa-folder-row" className="rounded-xl border border-border bg-card/40">
                    <button
                      type="button"
                      aria-expanded={fOpen}
                      onClick={() => toggleFolder(f.folderName)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <span className={`shrink-0 text-muted-foreground transition-transform ${fOpen ? "rotate-90" : ""}`}>›</span>
                      <span className="flex-1 truncate font-semibold text-foreground">{f.folderName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {f.projects.toLocaleString()} {f.projects === 1 ? "project" : "projects"} · {f.users.toLocaleString()} users
                      </span>
                      <span className="shrink-0 tabular-nums text-foreground">{f.activity.toLocaleString()}</span>
                      <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(f.activity, grandTotal)}</span>
                    </button>
                    {fOpen && (
                      <div className="border-t border-border px-3 py-2">
                        {summary ? (
                          <FolderActivityByRole summary={summary} onUserClick={onUserClick} noun="projects" />
                        ) : (
                          <p className="py-4 text-center text-xs text-muted-foreground">Loading {f.folderName}…</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {!showAllFolders && folders.length > FOLDER_TOP && (
                <button
                  type="button"
                  onClick={() => setShowAllFolders(true)}
                  className="mt-1 self-start rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  Show all {folders.length} folders ({folders.length - FOLDER_TOP} more)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </PremiumSurface>
  );
}
