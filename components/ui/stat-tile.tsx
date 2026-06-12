"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/core/utils";
import { useEntrance } from "./animated-list";

export type StatAccent = "primary" | "emerald" | "amber" | "violet" | "orange";

const ACCENT: Record<StatAccent, { bar: string; glow: string }> = {
  primary: { bar: "from-primary to-chart-1", glow: "bg-primary/20" },
  emerald: { bar: "from-emerald-500 to-teal-500", glow: "bg-emerald-500/20" },
  amber: { bar: "from-amber-500 to-orange-500", glow: "bg-amber-500/20" },
  violet: { bar: "from-violet-500 to-fuchsia-500", glow: "bg-violet-500/20" },
  orange: { bar: "from-orange-500 to-rose-500", glow: "bg-orange-500/20" },
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
            className="panel-elevated group relative overflow-hidden p-4"
          >
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute -right-5 -top-7 h-16 w-16 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-90",
                a.glow,
              )}
            />
            <span aria-hidden className={cn("mb-2.5 block h-1 w-8 rounded-full bg-gradient-to-r", a.bar)} />
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
