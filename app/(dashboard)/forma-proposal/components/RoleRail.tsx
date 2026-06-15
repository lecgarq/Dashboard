"use client";
import { useMemo } from "react";
import { Plus, Pencil } from "lucide-react";
import { cn } from "@/lib/core/utils";
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

  const declared = FORMA_GROUPS as readonly string[];
  const groupOrder = [
    ...declared.filter((g) => byGroup.has(g)),
    ...[...byGroup.keys()].filter((g) => !declared.includes(g)),
  ];

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-muted/20">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Roles
        </span>
        <button
          type="button"
          onClick={onAddRole}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {groupOrder.map((group) => (
          <div key={group} className="mb-3">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
              {group}
            </div>
            <div className="space-y-0.5">
              {(byGroup.get(group) ?? []).map((r) => {
                const count = countExplicit(assignments[r.id] ?? {});
                const active = r.id === activeRoleId;
                return (
                  <div
                    key={r.id}
                    className={cn(
                      "group/role relative flex items-center gap-1 rounded-md py-1.5 pl-2.5 pr-1.5 text-[13px] transition-colors duration-150",
                      active
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
                    )}
                    <button
                      type="button"
                      onClick={() => onSelect(r.id)}
                      className="flex-1 truncate text-left outline-none"
                    >
                      {r.label}
                    </button>
                    {count > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[10px] font-medium tabular-nums",
                          active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground/80",
                        )}
                      >
                        {count}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onManage(r.id)}
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/70 opacity-0 transition-opacity hover:text-foreground group-hover/role:opacity-100"
                      aria-label="manage role"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
