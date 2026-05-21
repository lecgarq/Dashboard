// ChartPanel.tsx
"use client";

import type { ReactNode } from "react";
import { chartColor } from "./chartColors";

export type InsightSeverity = "good" | "watch" | "risk" | "info";

export interface ChartPanelProps {
  title: string;
  subtitle?: string;
  insight?: { text: string; severity?: InsightSeverity };
  affordance?: "drag-to-filter" | "click-to-filter";
  className?: string;
  children: ReactNode;
}

const AFFORDANCE_LABEL: Record<NonNullable<ChartPanelProps["affordance"]>, string> = {
  "drag-to-filter": "drag to filter",
  "click-to-filter": "click to filter",
};

export function ChartPanel({
  title,
  subtitle,
  insight,
  affordance,
  className,
  children,
}: ChartPanelProps) {
  return (
    <section
      className={`rounded-lg border bg-card p-5 shadow-[var(--shadow-soft-sm)] ${className ?? ""}`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
          {insight ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-foreground/80">
              {insight.severity ? (
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: chartColor(insight.severity) }}
                />
              ) : null}
              <span className="min-w-0">{insight.text}</span>
            </p>
          ) : null}
        </div>
        {affordance ? (
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
            {AFFORDANCE_LABEL[affordance]}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}
