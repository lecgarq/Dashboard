"use client";

// Shared presentational primitives extracted verbatim from HybridAnalyticsSurface.tsx (SPLIT-04).
import { ChartPanel } from "./ChartPanel";
import type { FallbackBarDatum } from "./hybridAnalyticsTransforms";

export function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mt-2 flex items-baseline gap-3">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

export function FallbackBarPanel({
  title,
  subtitle,
  rows,
  accent,
  emptyText = "No data",
  finding,
  onRowClick,
}: {
  title: string;
  subtitle?: string;
  rows: readonly FallbackBarDatum[];
  accent: string;
  emptyText?: string;
  finding?: string;
  onRowClick?: (row: FallbackBarDatum) => void;
}) {
  const max = rows.reduce((largest, row) => Math.max(largest, row.value), 0);
  return (
    <ChartPanel
      title={title}
      subtitle={subtitle}
      insight={finding ? { text: finding } : undefined}
      affordance={onRowClick ? "click-to-filter" : undefined}
    >
      {rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-1">
          {rows.map((row) => (
            <div
              key={row.label}
              onClick={() => onRowClick?.(row)}
              className={`grid grid-cols-[minmax(0,1fr)_minmax(7rem,45%)] items-center gap-3 text-xs p-1 rounded transition-colors ${
                onRowClick ? "cursor-pointer hover:bg-muted/70" : ""
              }`}
            >
              <span className="truncate font-medium text-foreground/90" title={row.label}>{row.label}</span>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full animate-in slide-in-from-left duration-500 ease-out"
                    style={{
                      backgroundColor: accent,
                      width: `${max ? Math.max(4, (row.value / max) * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className="w-10 text-right tabular-nums font-semibold">{row.value.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartPanel>
  );
}
