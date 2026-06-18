"use client";
import { AnimatePresence, motion, useSafeVariants } from "@/components/ui/motion";
import type { SliceFilters } from "../projectFilter";

export interface PillBarProps {
  filters: SliceFilters;
  onRemove: (dim: string) => void;
  onClear: () => void;
  /** Optional dim → human label, e.g. { role: "Role", company: "Company" } */
  labels?: Partial<Record<string, string>>;
}

const pillVariants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.15, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    scale: 0.85,
    transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] },
  },
} as const;

/**
 * PillBar — renders one pill per active slice filter, a per-pill X dismiss button,
 * and a "Clear all" button. Renders null when no filters are active (no layout waste).
 *
 * Security: pill text is rendered as React text nodes, never via dangerouslySetInnerHTML.
 * Filter values come from server-origin DB strings; rendering them as text nodes is safe.
 */
export function PillBar({ filters, onRemove, onClear, labels }: PillBarProps) {
  const entries = Object.entries(filters);
  if (entries.length === 0) return null;

  const safeVariants = useSafeVariants(pillVariants as unknown as Record<string, { transition?: Record<string, unknown>; [k: string]: unknown }>);

  return (
    <div
      data-testid="slice-pill-bar"
      className="flex flex-wrap items-center gap-2"
    >
      <AnimatePresence initial={false}>
        {entries.map(([dim, value]) => {
          const label = labels?.[dim] ?? dim;
          return (
            <motion.span
              key={dim}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={safeVariants as typeof pillVariants}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              {label}
              {": "}
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
      <button
        type="button"
        onClick={onClear}
        className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  );
}
