"use client";
import { useMemo } from "react";
import { Plus, Pencil } from "lucide-react";
import { FORMA_GROUPS, type FormaRole } from "@/lib/forma/defaultRoles";
import { countExplicit } from "@/lib/forma/inheritance";
import type { FormaTier } from "@/lib/forma/tiers";

export function RoleRail({
  roles, assignments, activeRoleId, onSelect, onAddRole, onManage,
}: {
  roles: FormaRole[];
  assignments: Record<string, Record<string, FormaTier>>;
  activeRoleId: string;
  onSelect: (roleId: string) => void;
  onAddRole: () => void;
  onManage: (roleId: string) => void;
}) {
  const byGroup = useMemo(() => {
    const m = new Map<string, FormaRole[]>();
    for (const r of roles) {
      const arr = m.get(r.group);
      if (arr) arr.push(r);
      else m.set(r.group, [r]);
    }
    return m;
  }, [roles]);

  // Declared groups first (in canonical order), then any custom groups.
  const declared = FORMA_GROUPS as readonly string[];
  const groupOrder = [
    ...declared.filter((g) => byGroup.has(g)),
    ...[...byGroup.keys()].filter((g) => !declared.includes(g)),
  ];

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Roles
        </span>
        <button
          type="button"
          onClick={onAddRole}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 pb-3">
        {groupOrder.map((group) => (
          <div key={group} className="mb-2">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group}
            </div>
            {(byGroup.get(group) ?? []).map((r) => {
              const count = countExplicit(assignments[r.id] ?? {});
              const active = r.id === activeRoleId;
              return (
                <div
                  key={r.id}
                  className={`group flex items-center gap-1 rounded-md px-2 py-1 text-sm ${
                    active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <button type="button" onClick={() => onSelect(r.id)} className="flex-1 truncate text-left">
                    {r.label}
                  </button>
                  {count > 0 && (
                    <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onManage(r.id)}
                    className="opacity-0 transition group-hover:opacity-100"
                    aria-label="manage role"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
