"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/core/utils";
import { useEntrance } from "./animated-list";

/** Accent bar colors: LECG brand chart families only (DESIGN.md §2). */
export type StatAccent = "primary" | "seaweed" | "goldenrod" | "wine" | "naranja";

const ACCENT: Record<StatAccent, string> = {
  primary: "bg-primary",
  seaweed: "bg-chart-3",
  goldenrod: "bg-chart-4",
  wine: "bg-chart-5",
  naranja: "bg-chart-2",
};

export type Stat = {
  label: string;
  value: string | number;
  accent?: StatAccent;
  hint?: string;
};

/**
 * Headline KPI tiles — a row of big tabular numbers in elevated cards. The single
 * highest-impact "this is a real dashboard" cue. Auto-fits any count of tiles.
 */
export function StatStrip({ stats }: { stats: Stat[] }) {
  const entrance = useEntrance();
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
    >
      {stats.map((s, i) => {
        const a = ACCENT[s.accent ?? "primary"];
        return (
          <motion.div
            key={s.label}
            {...entrance(i)}
            className="panel-elevated relative overflow-hidden p-4"
          >
            <span aria-hidden className={cn("mb-2.5 block h-1 w-8 rounded-full", a)} />
            <div className="font-display text-[28px] font-bold leading-none tabular-nums tracking-tight text-foreground">
              {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
            </div>
            <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {s.label}
            </div>
            {s.hint && <div className="mt-0.5 text-[11px] text-muted-foreground/70">{s.hint}</div>}
          </motion.div>
        );
      })}
    </div>
  );
}
