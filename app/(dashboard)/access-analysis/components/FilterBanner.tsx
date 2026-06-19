"use client";
import { AnimatePresence, motion, useSafeVariants } from "@/components/ui/motion";
import type { SliceFilters } from "../projectFilter";

export interface FilterBannerProps {
  filters: SliceFilters;
  /** Projects in view AFTER the active slice filter (N). */
  shown: number;
  /** Projects in the current Project-Picker view, before slice filtering (M). */
  total: number;
  onRemove: (dim: string) => void;
  onClear: () => void;
  /** Optional dim → human label, e.g. { role: "Role", company: "Company" } */
  labels?: Partial<Record<string, string>>;
}

const chipVariants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.15, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, scale: 0.85, transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] } },
} as const;

/**
 * FilterBanner — the primary "you are cross-filtering" surface for /access-analysis.
 * Supersedes the old tiny PillBar row: names every active slice filter, shows the
 * "N of M projects" scope, and offers ONE prominent Clear filters. Renders null when
 * no filter is active (the parent shows the idle tip in that slot instead).
 *
 * Presentational only — no engine logic. Values are server-origin DB strings rendered
 * as React text nodes (never dangerouslySetInnerHTML).
 */
export function FilterBanner({ filters, shown, total, onRemove, onClear, labels }: FilterBannerProps) {
  // Hook called unconditionally (before the early return) to satisfy rules-of-hooks.
  const safeVariants = useSafeVariants(
    chipVariants as unknown as Record<string, { transition?: Record<string, unknown>; [k: string]: unknown }>,
  );
  const entries = Object.entries(filters);
  if (entries.length === 0) return null;

  return (
    <div
      data-testid="filter-banner"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="text-base">🔍</span>
        <span className="text-sm font-semibold text-foreground">Filtered:</span>
        <AnimatePresence initial={false}>
          {entries.map(([dim, value]) => {
            const label = labels?.[dim] ?? dim;
            return (
              <motion.span
                key={dim}
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={safeVariants as typeof chipVariants}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                {label}
                {" = "}
                {value}
                <button
                  type="button"
                  aria-label={`Remove ${label} filter`}
                  onClick={() => onRemove(dim)}
                  className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100"
                >
                  ×
                </button>
              </motion.span>
            );
          })}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-3">
        <span data-testid="filter-scope" className="text-sm tabular-nums text-muted-foreground">
          Showing {shown.toLocaleString()} of {total.toLocaleString()} projects
        </span>
        <button
          type="button"
          data-testid="filter-clear"
          onClick={onClear}
          className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}
