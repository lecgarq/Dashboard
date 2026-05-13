"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/core/utils";

interface KpiCardProps {
  label: string;
  value: number;
  delta: number;
  borderColor?: string;
  format?: (n: number) => string;
}

const defaultFmt = (n: number) => n.toLocaleString();

export function KpiCard({ label, value, delta, borderColor, format = defaultFmt }: KpiCardProps) {
  const deltaSign = delta > 0 ? "+" : delta < 0 ? "" : "";
  const deltaClass = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-muted-foreground";
  return (
    <Card
      className="flex flex-col gap-2 px-4 py-3 border-l-4"
      style={borderColor ? { borderLeftColor: borderColor } : undefined}
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-3xl font-semibold tabular-nums">{format(value)}</div>
      <div className={cn("text-sm tabular-nums", deltaClass)}>
        {deltaSign}{format(delta)} <span className="text-muted-foreground">vs prior</span>
      </div>
    </Card>
  );
}
