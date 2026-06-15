"use client";
import { Crown, UserRound } from "lucide-react";
import { cn } from "@/lib/core/utils";

// Color by depth, matching the reference organogram: root rose, level-1 amber, deeper teal.
const LEVEL = [
  { ring: "border-rose-400/70", disc: "from-rose-400 to-rose-600", glow: "shadow-rose-500/30" },
  { ring: "border-amber-400/70", disc: "from-amber-400 to-amber-500", glow: "shadow-amber-500/30" },
  { ring: "border-teal-400/70", disc: "from-teal-400 to-teal-500", glow: "shadow-teal-500/30" },
];

export function OrgNode({
  depth, label, coverage, total, selected, dropTarget, dimmed, root,
}: {
  depth: number;
  label: string;
  coverage?: number;
  total: number;
  selected?: boolean;
  dropTarget?: boolean;
  dimmed?: boolean;
  root?: boolean;
}) {
  const lv = LEVEL[Math.min(depth, LEVEL.length - 1)];
  const Icon = root ? Crown : UserRound;
  return (
    <div
      className={cn(
        "flex w-[150px] cursor-pointer flex-col items-center gap-1.5 transition-opacity duration-150",
        dimmed && "opacity-35",
      )}
    >
      <div
        className={cn(
          "relative grid place-items-center rounded-full border-2 border-dashed p-1 transition-all duration-150",
          lv.ring,
          dropTarget && "scale-110 border-solid ring-4 ring-primary/40",
          selected && "ring-4 ring-primary/50",
        )}
      >
        <div className={cn("grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br shadow-lg", lv.disc, lv.glow)}>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-inner">
            <Icon className="h-4 w-4 text-zinc-700" />
          </div>
        </div>
      </div>
      <div className="text-center">
        <div className="max-w-[150px] truncate text-[12px] font-semibold leading-tight text-foreground" title={label}>
          {label}
        </div>
        {!root && (
          <div className="text-[10px] tabular-nums text-muted-foreground">
            {coverage ?? 0}/{total} set
          </div>
        )}
      </div>
    </div>
  );
}
