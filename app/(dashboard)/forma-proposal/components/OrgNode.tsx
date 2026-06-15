"use client";
import { Folder, FolderOpen, FolderRoot } from "lucide-react";
import { cn } from "@/lib/core/utils";

/** Presentational organogram node: a colored disc + label + sublabel. */
export function OrgNode({
  color, label, sublabel, inherited, root, open, selected,
}: {
  color: string; // tier color (hex)
  label: string;
  sublabel?: string;
  inherited?: boolean;
  root?: boolean;
  open?: boolean; // children currently visible
  selected?: boolean;
}) {
  const Icon = root ? FolderRoot : open ? FolderOpen : Folder;
  return (
    <div className="flex w-[140px] cursor-pointer flex-col items-center gap-1">
      <div
        className={cn(
          "relative grid place-items-center rounded-full border-2 p-1 transition-all duration-150",
          inherited ? "border-dashed" : "border-solid",
          selected && "ring-4 ring-primary/40",
        )}
        style={{ borderColor: `${color}99` }}
      >
        <div
          className="grid h-12 w-12 place-items-center rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 28%, ${color}, ${color}cc)`,
            boxShadow: `0 6px 16px -6px ${color}aa`,
          }}
        >
          <div className="grid h-8 w-8 place-items-center rounded-full bg-white shadow-inner">
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
        </div>
      </div>
      <div className="text-center">
        <div className="max-w-[140px] truncate text-[11px] font-semibold leading-tight text-foreground" title={label}>
          {label}
        </div>
        {sublabel && (
          <div className={cn("text-[9px] leading-tight", inherited ? "italic text-muted-foreground/70" : "text-muted-foreground")}>
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}
