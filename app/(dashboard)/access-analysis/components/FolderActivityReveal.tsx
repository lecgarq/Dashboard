"use client";
import { useEffect, useMemo, useState } from "react";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { FolderActivityByRole } from "./FolderActivityByRole";
import {
  summarizeFolderActivity,
  rolesByEmailForProject,
  type FolderActivitySummary,
  type FolderActivityRow,
} from "../folderActivityCounts";
import type { MembershipRolesInput } from "../roleActivityCounts";
import type { ProjectActivityTotal } from "@/lib/server/folderActivityView";

const PROJECT_TOP = 8;

/**
 * Lazy "expand to load" panel for Folder Activity by Role. Defers all querying
 * until the user expands. One project selected → its tree directly; several →
 * ranked project rows, each lazy-loading its own tree on expand. Reads the page's
 * project selection (selectedProjectIds) and the in-memory memberships for role
 * attribution, so it stays consistent with the donuts above.
 */
export function FolderActivityReveal({
  selectedProjectIds,
  memberships,
  loadProjects,
  loadTree,
}: {
  selectedProjectIds: string[];
  memberships: MembershipRolesInput[];
  loadProjects: (ids: string[]) => Promise<ProjectActivityTotal[]>;
  loadTree: (projectId: string) => Promise<FolderActivityRow[]>;
}) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectActivityTotal[] | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [openProject, setOpenProject] = useState<Set<string>>(new Set());
  const [summaries, setSummaries] = useState<Map<string, FolderActivitySummary>>(new Map());

  const idsKey = useMemo(() => [...selectedProjectIds].sort().join(","), [selectedProjectIds]);

  // (Re)load the project list whenever the panel is open and the selection changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingProjects(true);
    setProjects(null);
    setOpenProject(new Set());
    loadProjects(selectedProjectIds)
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
    // idsKey captures selection identity; loadProjects is a stable server-action ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idsKey]);

  const buildSummary = async (projectId: string) => {
    if (summaries.has(projectId)) return;
    const rows = await loadTree(projectId);
    const summary = summarizeFolderActivity(rows, rolesByEmailForProject(memberships, projectId));
    setSummaries((prev) => new Map(prev).set(projectId, summary));
  };

  const toggleProject = (projectId: string) => {
    setOpenProject((prev) => {
      const next = new Set(prev);
      next.has(projectId) ? next.delete(projectId) : next.add(projectId);
      return next;
    });
    void buildSummary(projectId);
  };

  // Single-project selection → load + render its tree directly (no project header).
  const single = projects && projects.length === 1 ? projects[0] : null;
  useEffect(() => {
    if (single) void buildSummary(single.projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [single?.projectId]);

  const visibleProjects = projects
    ? showAllProjects
      ? projects
      : projects.slice(0, PROJECT_TOP)
    : [];

  return (
    <PremiumSurface variant="base" className="flex flex-col gap-0 overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-4 p-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Folder Activity by Role</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            File activity per folder, broken down by the role each person held and then by user.
            Folder-scoped activity only (~86% of all activity); ticks above set the projects.
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
          {loadingProjects && <p className="py-6 text-center text-sm text-muted-foreground">Loading folder activity…</p>}

          {!loadingProjects && projects && projects.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No folder activity for the selected projects.</p>
          )}

          {!loadingProjects && single && (
            summaries.get(single.projectId) ? (
              <FolderActivityByRole summary={summaries.get(single.projectId)!} onUserClick={undefined} />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading {single.projectName}…</p>
            )
          )}

          {!loadingProjects && projects && projects.length > 1 && (
            <div className="flex flex-col gap-1.5">
              {visibleProjects.map((p) => {
                const pOpen = openProject.has(p.projectId);
                const summary = summaries.get(p.projectId);
                return (
                  <div key={p.projectId} data-testid="fa-project-row" className="rounded-xl border border-border bg-card/40">
                    <button
                      type="button"
                      aria-expanded={pOpen}
                      onClick={() => toggleProject(p.projectId)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <span className={`shrink-0 text-muted-foreground transition-transform ${pOpen ? "rotate-90" : ""}`}>›</span>
                      <span className="flex-1 truncate font-semibold text-foreground">{p.projectName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{p.folders.toLocaleString()} folders</span>
                      <span className="shrink-0 tabular-nums text-foreground">{p.activity.toLocaleString()}</span>
                    </button>
                    {pOpen && (
                      <div className="border-t border-border px-3 py-2">
                        {summary ? (
                          <FolderActivityByRole summary={summary} onUserClick={undefined} />
                        ) : (
                          <p className="py-4 text-center text-xs text-muted-foreground">Loading {p.projectName}…</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {!showAllProjects && projects.length > PROJECT_TOP && (
                <button
                  type="button"
                  onClick={() => setShowAllProjects(true)}
                  className="mt-1 self-start rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  Show all {projects.length} projects ({projects.length - PROJECT_TOP} more)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </PremiumSurface>
  );
}
