"use client";
import { ListTree, Network } from "lucide-react";
import { cn } from "@/lib/core/utils";

export type FormaMode = "permissions" | "hierarchy";

const OPTIONS: { key: FormaMode; label: string; Icon: typeof ListTree }[] = [
  { key: "permissions", label: "Permissions", Icon: ListTree },
  { key: "hierarchy", label: "Hierarchy", Icon: Network },
];

export function ModeSwitch({ mode, onChange }: { mode: FormaMode; onChange: (m: FormaMode) => void }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border/70 bg-muted/40 p-0.5">
      {OPTIONS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150",
            mode === key
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
