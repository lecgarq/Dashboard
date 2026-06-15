"use client";
import { Folder, FolderOpen, FolderRoot } from "lucide-react";
import { cn } from "@/lib/core/utils";

/** Presentational organogram node: a tier-colored disc + folder name + tier pill. */
export function OrgNode({
  color, label, tierShort, inherited, root, open,
}: {
  color: string; // tier color (hex)
  label: string;
  tierShort?: string;
  inherited?: boolean;
  root?: boolean;
  open?: boolean;
}) {
  const Icon = root ? FolderRoot : open ? FolderOpen : Folder;
  return (
    <div className="flex w-[150px] flex-col items-center gap-1.5">
      <div
        className={cn(
          "relative grid place-items-center rounded-full border-2 p-1 transition-transform duration-150 group-hover/node:scale-[1.06]",
          inherited ? "border-dashed" : "border-solid",
        )}
        style={{ borderColor: `${color}aa` }}
      >
        <div
          className="grid h-12 w-12 place-items-center rounded-full"
          style={{ background: `radial-gradient(circle at 35% 28%, ${color}, ${color}cc)`, boxShadow: `0 7px 18px -7px ${color}aa` }}
        >
          <div className="grid h-8 w-8 place-items-center rounded-full bg-white shadow-inner">
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="max-w-[150px] truncate text-[12px] font-semibold leading-tight text-foreground" title={label}>
          {label}
        </div>
        {tierShort && (
          <span
            className={cn(
              "inline-flex max-w-[150px] items-center gap-0.5 truncate rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold leading-none",
              inherited && "opacity-70",
            )}
            style={{ backgroundColor: `${color}22`, color }}
          >
            {inherited && <span className="text-[8px] leading-none">⤴</span>}
            {tierShort}
          </span>
        )}
      </div>
    </div>
  );
}
