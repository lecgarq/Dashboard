"use client";
import { useState } from "react";
import { TIER_COLORS } from "@/app/(dashboard)/access-analysis/folderTerrain";
import type { RoleTreeNode } from "@/lib/server/templateRoleTree";

export function RolePermissionTree({ nodes }: { nodes: RoleTreeNode[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (nodes.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No folder permissions found for this template.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft-xl">
      {nodes.map((role) => {
        const isOpen = open.has(role.roleId);
        return (
          <div key={role.roleId}>
            <button
              type="button"
              onClick={() => toggle(role.roleId)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-accent/40"
            >
              <span className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden>▸</span>
              <span className="font-medium text-foreground">{role.roleName}</span>
              <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                {role.folderCount} {role.folderCount === 1 ? "folder" : "folders"}
              </span>
            </button>

            {isOpen && (
              <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/20 px-4 py-3">
                {role.tiers.map((tier) => (
                  <div key={tier.rank} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: TIER_COLORS[tier.rank] }} aria-hidden />
                      <span className="font-medium text-foreground">{tier.label}</span>
                      <span className="text-muted-foreground">({tier.folders.length})</span>
                    </div>
                    <div
                      className={`flex flex-wrap gap-1.5 ${tier.folders.length > 30 ? "max-h-40 overflow-y-auto rounded-md border border-border/60 p-1.5" : ""}`}
                    >
                      {tier.folders.map((f) => (
                        <span
                          key={f.id}
                          title={f.path ?? f.name}
                          className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-foreground/85"
                        >
                          {f.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
