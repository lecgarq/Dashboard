"use client";

/**
 * ActivitySelectionPanel.tsx — lasso → live analytics overlay.
 *
 * Left-side rail that appears the instant a lasso closes, breaking the selected
 * activity events down across every resident dimension (verb, module, object
 * type, month, author role, company, project, author) as ranked count bars.
 * Fed by the pure `buildSelectionBreakdown` off the payload the graph already
 * holds — no fetch, no async. Each dimension carries one LECG brand chart
 * family (theme-resolved CSS var), bars animate in under the 200ms motion
 * budget, and reduced motion collapses everything to static.
 */

import { motion, useReducedMotion } from "framer-motion";
import { EASE, useEntrance } from "@/components/ui/animated-list";
import type { DimensionBreakdown } from "./activitySelectionBreakdown";

const fmt = (n: number): string => n.toLocaleString("en-US");

/** Dimension → LECG brand chart family (8 dims, 8 CVD-validated families). */
const DIM_ACCENT: Record<string, string> = {
  verb: "var(--chart-1)",
  module: "var(--chart-2)",
  objectType: "var(--chart-3)",
  month: "var(--chart-7)",
  role: "var(--chart-5)",
  company: "var(--chart-4)",
  project: "var(--chart-6)",
  author: "var(--chart-8)",
};

export function ActivitySelectionPanel({
  selectedCount,
  renderedCount,
  breakdown,
  onClear,
}: {
  selectedCount: number;
  renderedCount: number;
  breakdown: DimensionBreakdown[];
  onClear: () => void;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const entrance = useEntrance();
  const sharePct = renderedCount > 0 ? (selectedCount / renderedCount) * 100 : 0;

  return (
    <motion.aside
      data-testid="activity-selection-panel"
      initial={reduce ? false : { opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, ease: EASE }}
      className="absolute left-4 top-3 z-20 flex max-h-[calc(100%-7rem)] w-[320px] flex-col overflow-hidden rounded-xl border border-surface-border bg-card/90 shadow-elevated backdrop-blur-xl"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
      />

      <header className="border-b px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-semibold tabular-nums tracking-tight text-foreground">
              <span data-testid="activity-selection-count">{fmt(selectedCount)}</span>{" "}
              <span className="text-xs font-medium text-muted-foreground">selected</span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {sharePct >= 0.1 ? `${sharePct.toFixed(1)}% ` : ""}of {fmt(renderedCount)} rendered
              events
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            data-testid="activity-selection-clear"
            className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Clear
          </button>
        </div>
        {/* Selection share of the rendered set — same mark language as the pickers. */}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            style={{ width: `${Math.max(sharePct, 1)}%`, transformOrigin: "left" }}
            transition={{ duration: 0.2, ease: EASE }}
          />
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-3">
        {breakdown.map((dim, sectionIdx) => {
          const accent = DIM_ACCENT[dim.id] ?? "var(--chart-1)";
          const max = dim.top.length > 0 ? dim.top[0].count : 0;
          const unknown = dim.total - dim.covered;
          return (
            <motion.section
              key={dim.id}
              {...entrance(sectionIdx)}
              data-testid={`activity-selection-dim-${dim.id}`}
              className="flex flex-col gap-1"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-semibold uppercase tracking-wide text-foreground">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
                  />
                  {dim.label}
                </h3>
                <span
                  className="shrink-0 rounded-md px-1.5 py-px font-mono text-[10px] tabular-nums"
                  style={{
                    background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                    color: accent,
                  }}
                >
                  {fmt(dim.distinct)} distinct
                </span>
              </div>
              <ul className="flex flex-col gap-0.5">
                {dim.top.map((cat, rowIdx) => {
                  const barPct = max > 0 ? (cat.count / max) * 100 : 0;
                  const share = dim.total > 0 ? (cat.count / dim.total) * 100 : 0;
                  return (
                    <li
                      key={cat.label}
                      className="relative flex items-center justify-between gap-2 overflow-hidden rounded px-1.5 py-0.5 text-[11px] transition-colors hover:bg-accent/60"
                    >
                      <motion.span
                        aria-hidden
                        className="absolute inset-y-0 left-0 rounded"
                        style={{
                          width: `${barPct}%`,
                          transformOrigin: "left",
                          background: `color-mix(in srgb, ${accent} ${rowIdx === 0 ? 26 : 15}%, transparent)`,
                        }}
                        initial={reduce ? false : { scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{
                          duration: 0.18,
                          ease: EASE,
                          delay: reduce ? 0 : Math.min(rowIdx, 8) * 0.02,
                        }}
                      />
                      <span className="relative z-10 min-w-0 flex-1 truncate text-foreground">
                        {cat.label}
                      </span>
                      <span
                        className="relative z-10 shrink-0 font-mono text-[10px] tabular-nums"
                        style={rowIdx === 0 ? { color: accent } : undefined}
                        aria-hidden={share < 0.05}
                      >
                        {share >= 0.05 ? `${share.toFixed(share < 10 ? 1 : 0)}%` : ""}
                      </span>
                      <span className="relative z-10 shrink-0 font-mono tabular-nums text-muted-foreground">
                        {fmt(cat.count)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {unknown > 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  {fmt(unknown)} unknown / unattributed
                </p>
              ) : null}
            </motion.section>
          );
        })}
      </div>
    </motion.aside>
  );
}
