"use client";
import { useCallback, useMemo, useState } from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Folder, FolderOpen, Layers, Undo2 } from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  resolveEffectiveTier, type ExplicitMap, type FolderIndex, type FormaFolder,
} from "@/lib/forma/inheritance";
import type { FormaTier } from "@/lib/forma/tiers";
import { TierPicker } from "./TierPicker";

function sortFolders<T extends { name: string; fullPath: string | null }>(arr: readonly T[]): T[] {
  return [...arr].sort((a, b) => (a.fullPath ?? a.name).localeCompare(b.fullPath ?? b.name));
}

interface RowCtx {
  index: FolderIndex;
  explicit: ExplicitMap;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  /** Search scope: null = no search (show all, honor collapsed); a Set = matches + their ancestors, force-expanded. */
  visible: Set<string> | null;
  onSet: (folderId: string, tier: FormaTier) => void;
  onClear: (folderId: string) => void;
  onApplySubtree: (folderId: string, tier: FormaTier) => void;
}

// Module-level recursive row (kept out of the parent to stay lint-clean and stable).
function FolderRow({ id, depth, ctx }: { id: string; depth: number; ctx: RowCtx }) {
  const folder = ctx.index.byId.get(id);
  if (!folder) return null;
  if (ctx.visible && !ctx.visible.has(id)) return null;
  const children = sortFolders((ctx.index.childrenOf.get(id) ?? []) as FormaFolder[]);
  const hasChildren = children.length > 0;
  const expanded = ctx.visible ? true : !ctx.collapsed.has(id);
  const eff = resolveEffectiveTier(id, ctx.explicit, ctx.index.byId);

  return (
    <>
      <div
        className="group/row flex items-center gap-1.5 rounded-md py-[3px] pr-2 transition-colors duration-150 hover:bg-muted/60"
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          onClick={() => hasChildren && ctx.toggle(id)}
          className={cn(
            "flex h-4 w-4 items-center justify-center text-muted-foreground/70",
            !hasChildren && "pointer-events-none opacity-0",
          )}
          aria-label={hasChildren ? (expanded ? "collapse" : "expand") : undefined}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-90")} />
        </button>
        {expanded && hasChildren ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500/80" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        )}
        <span
          className="flex-1 truncate text-[13px] leading-6 text-foreground/90"
          title={folder.fullPath ?? folder.name}
        >
          {folder.name}
        </span>
        {eff.inherited && (
          <span className="hidden shrink-0 rounded-full bg-muted px-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/70 md:inline">
            inherited
          </span>
        )}
        <TierPicker value={eff.tier} inherited={eff.inherited} onChange={(tier) => ctx.onSet(id, tier)} />
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/row:opacity-100">
          <button
            type="button"
            title="Apply to this folder and everything inside it"
            onClick={() => ctx.onApplySubtree(id, eff.tier)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="apply to subtree"
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Clear override (revert to inherited)"
            onClick={() => ctx.onClear(id)}
            disabled={eff.inherited || eff.sourceId === null}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
            aria-label="clear override"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {hasChildren && expanded && children.map((c) => (
        <FolderRow key={c.id} id={c.id} depth={depth + 1} ctx={ctx} />
      ))}
    </>
  );
}

export function FolderTreeAssign({
  index, explicit, onSet, onClear, onApplySubtree,
}: {
  index: FolderIndex;
  explicit: ExplicitMap;
  onSet: (folderId: string, tier: FormaTier) => void;
  onClear: (folderId: string) => void;
  onApplySubtree: (folderId: string, tier: FormaTier) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const roots = useMemo(() => sortFolders(index.roots), [index.roots]);

  // Every folder with children — the collapse-all target set.
  const parentIds = useMemo(() => {
    const ids: string[] = [];
    for (const [pid, kids] of index.childrenOf) if (pid !== null && kids.length > 0) ids.push(pid);
    return ids;
  }, [index]);
  const allCollapsed = parentIds.length > 0 && parentIds.every((id) => collapsed.has(id));

  // Search: matched folders (name or full path) stay visible along with their
  // ancestors, force-expanded so a deep hit is never hidden by collapse state.
  const needle = query.trim().toLowerCase();
  const { visible, matchCount } = useMemo(() => {
    if (!needle) return { visible: null as Set<string> | null, matchCount: 0 };
    const vis = new Set<string>();
    let matches = 0;
    for (const f of index.byId.values()) {
      if (!f.name.toLowerCase().includes(needle) && !(f.fullPath ?? "").toLowerCase().includes(needle)) continue;
      matches += 1;
      let cur: string | null = f.id;
      const guard = new Set<string>();
      while (cur !== null && !guard.has(cur)) {
        guard.add(cur);
        vis.add(cur);
        cur = index.byId.get(cur)?.parentId ?? null;
      }
    }
    return { visible: vis, matchCount: matches };
  }, [index, needle]);

  const ctx: RowCtx = { index, explicit, collapsed, toggle, visible, onSet, onClear, onApplySubtree };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 px-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search folders…"
          aria-label="Search folders"
          className="w-full max-w-xs rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground transition placeholder:text-muted-foreground focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
        {needle && (
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
            {matchCount} match{matchCount === 1 ? "" : "es"}
          </span>
        )}
        <button
          type="button"
          disabled={!!needle}
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(parentIds))}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-border/70 bg-card px-2 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:border-border hover:text-foreground disabled:opacity-40"
        >
          {allCollapsed ? (
            <><ChevronsUpDown className="h-3 w-3" aria-hidden /> Expand all</>
          ) : (
            <><ChevronsDownUp className="h-3 w-3" aria-hidden /> Collapse all</>
          )}
        </button>
      </div>
      <div className="space-y-0.5">
        {needle && matchCount === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">No folders match &quot;{query.trim()}&quot;.</p>
        ) : (
          roots.map((r) => <FolderRow key={r.id} id={r.id} depth={0} ctx={ctx} />)
        )}
      </div>
    </div>
  );
}
