"use client";
import { useCallback, useMemo, useState } from "react";
import { ChevronRight, ChevronDown, CornerLeftUp, Layers } from "lucide-react";
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
  onSet: (folderId: string, tier: FormaTier) => void;
  onClear: (folderId: string) => void;
  onApplySubtree: (folderId: string, tier: FormaTier) => void;
}

// Module-level recursive row (kept out of the parent to stay lint-clean and stable).
function FolderRow({ id, depth, ctx }: { id: string; depth: number; ctx: RowCtx }) {
  const folder = ctx.index.byId.get(id);
  if (!folder) return null;
  const children = sortFolders((ctx.index.childrenOf.get(id) ?? []) as FormaFolder[]);
  const hasChildren = children.length > 0;
  const isCollapsed = ctx.collapsed.has(id);
  const eff = resolveEffectiveTier(id, ctx.explicit, ctx.index.byId);

  return (
    <>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/40"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <button
          type="button"
          onClick={() => hasChildren && ctx.toggle(id)}
          className="text-muted-foreground"
          aria-label={hasChildren ? (isCollapsed ? "expand" : "collapse") : "leaf"}
        >
          {hasChildren ? (
            isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />
          ) : (
            <span className="inline-block w-[14px]" />
          )}
        </button>
        <span className="flex-1 truncate text-sm" title={folder.fullPath ?? folder.name}>
          {folder.name}
        </span>
        {eff.inherited && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            inherits ⤴
          </span>
        )}
        <TierPicker
          value={eff.tier}
          inherited={eff.inherited}
          onChange={(tier) => ctx.onSet(id, tier)}
        />
        <button
          type="button"
          title="Apply this tier to this folder and everything inside it"
          onClick={() => ctx.onApplySubtree(id, eff.tier)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="apply to subtree"
        >
          <Layers size={14} />
        </button>
        <button
          type="button"
          title="Clear override (revert to inherited)"
          onClick={() => ctx.onClear(id)}
          disabled={eff.inherited || eff.sourceId === null}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          aria-label="clear override"
        >
          <CornerLeftUp size={14} />
        </button>
      </div>
      {hasChildren && !isCollapsed && children.map((c) => (
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
  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const roots = useMemo(() => sortFolders(index.roots), [index.roots]);
  const ctx: RowCtx = { index, explicit, collapsed, toggle, onSet, onClear, onApplySubtree };

  return (
    <div className="divide-y divide-border/40">
      {roots.map((r) => <FolderRow key={r.id} id={r.id} depth={0} ctx={ctx} />)}
    </div>
  );
}
