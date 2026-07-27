"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { buildRoleColorMap } from "../roleColors";
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";
import type { FolderActivitySummary, FolderActivityNode } from "../folderActivityCounts";

const DEFAULT_TOP = 8;
const isWarn = (name: string) => name === UNKNOWN_ROLE || name === MULTIPLE_ROLES;

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

/** Stacked role-distribution bar for one folder row. */
function RoleBar({ node, colorFor }: { node: FolderActivityNode; colorFor: (r: string) => string }) {
  return (
    <span className="relative ml-2 hidden h-2.5 w-28 shrink-0 overflow-hidden rounded-full bg-muted sm:flex" aria-hidden>
      {node.roleSlices.map((s) => (
        <span
          key={s.name}
          style={{ width: `${node.total > 0 ? (s.value / node.total) * 100 : 0}%`, background: colorFor(s.name) }}
          className="h-full"
        />
      ))}
    </span>
  );
}

/**
 * Presentational node → role → user tree. Nodes (Top-N, with a show-all toggle)
 * carry a stacked role-distribution bar; expanding a node reveals role rows,
 * expanding a role reveals the users (clickable to the profile drawer). Role
 * colors come from the shared buildRoleColorMap so they match the "Activity by
 * role" donut. Nodes were originally folders within one project; the folder-
 * first inversion (2026-07-07) also feeds it PROJECT nodes within one folder —
 * `noun` labels the show-all button accordingly.
 */
export function FolderActivityByRole({
  summary,
  onUserClick,
  defaultTopN = DEFAULT_TOP,
  noun = "folders",
}: {
  summary: FolderActivitySummary;
  onUserClick?: (email: string) => void;
  defaultTopN?: number;
  noun?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [openRoles, setOpenRoles] = useState<Set<string>>(new Set()); // key = `${folder} ${role}`

  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  // Stable color per role across every folder bar in this project.
  const colorMap = useMemo(() => {
    const names: string[] = [];
    for (const f of summary.folders) for (const s of f.roleSlices) if (!names.includes(s.name)) names.push(s.name);
    return buildRoleColorMap(names, dark);
  }, [summary, dark]);
  const colorFor = (r: string) => colorMap.get(r) ?? "#888";

  if (summary.folders.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
        No folder activity found for this selection.
      </div>
    );
  }

  const folders = showAll ? summary.folders : summary.folders.slice(0, defaultTopN);
  const hidden = summary.folders.length - folders.length;
  const toggle = (set: Set<string>, key: string, upd: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    upd(next);
  };

  return (
    <div data-testid="folder-activity-tree" className="flex flex-col gap-1">
      {folders.map((f) => {
        const fOpen = openFolders.has(f.name);
        return (
          <div key={f.name} data-testid="folder-row" className="rounded-lg border border-border/60 bg-card/40">
            <button
              type="button"
              aria-expanded={fOpen}
              onClick={() => toggle(openFolders, f.name, setOpenFolders)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <span className={`shrink-0 text-muted-foreground transition-transform ${fOpen ? "rotate-90" : ""}`}>›</span>
              <span className="flex-1 truncate font-medium text-foreground">{f.name}</span>
              <RoleBar node={f} colorFor={colorFor} />
              <span className="shrink-0 tabular-nums text-foreground">{f.total.toLocaleString()}</span>
              <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(f.total, summary.total)}</span>
            </button>

            {fOpen && (
              <div className="border-t border-border/60 px-2 py-1.5">
                {f.roleSlices.map((s) => {
                  const rKey = `${f.name} ${s.name}`;
                  const rOpen = openRoles.has(rKey);
                  const users = f.usersByRole.get(s.name) ?? [];
                  return (
                    <div key={s.name} data-testid="role-row">
                      <button
                        type="button"
                        aria-expanded={rOpen}
                        onClick={() => toggle(openRoles, rKey, setOpenRoles)}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                      >
                        <span className={`shrink-0 text-muted-foreground transition-transform ${rOpen ? "rotate-90" : ""}`}>›</span>
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorFor(s.name) }} aria-hidden />
                        <span className={`flex-1 truncate ${isWarn(s.name) ? "text-warning" : "text-foreground/90"}`}>
                          {isWarn(s.name) ? `⚠ ${s.name}` : s.name}
                        </span>
                        <span className="shrink-0 tabular-nums text-foreground">{s.value.toLocaleString()}</span>
                        <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(s.value, f.total)}</span>
                      </button>

                      {rOpen && (
                        <ul className="list-none py-0.5 pl-8 pr-1">
                          {users.map((u) => {
                            const clickable = !!(u.email && onUserClick);
                            return (
                              <li key={u.email} data-testid="user-row">
                                <button
                                  type="button"
                                  disabled={!clickable}
                                  onClick={() => clickable && onUserClick!(u.email)}
                                  title={clickable ? `View ${u.name}'s profile` : u.email}
                                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors ${
                                    clickable ? "cursor-pointer text-foreground/85 hover:bg-accent hover:text-primary" : "cursor-default text-foreground/70"
                                  }`}
                                >
                                  <span className="flex-1 truncate">{u.name}</span>
                                  <span className="shrink-0 tabular-nums text-foreground">{u.count.toLocaleString()}</span>
                                  <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(u.count, s.value)}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {hidden > 0 && !showAll && (
        <button
          type="button"
          data-testid="folder-activity-showall"
          onClick={() => setShowAll(true)}
          className="mt-1 self-start rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          Show all {summary.folders.length} {noun} ({hidden} more)
        </button>
      )}
    </div>
  );
}
