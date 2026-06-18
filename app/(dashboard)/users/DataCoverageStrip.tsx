"use client";

// ---------------------------------------------------------------------------
// DataCoverageStrip.tsx — data coverage indicator strip for /users directory
//
// Extracted from UsersDirectoryClient.tsx (USR-01 decomposition, Wave 2).
// No logic changes — this is a pure move.
// ---------------------------------------------------------------------------

import { AlertCircle, CheckCircle2, CircleDashed, Database } from "lucide-react";
import { cn } from "@/lib/core/utils";

function CoveragePill({
  label,
  available,
  loading,
  detail,
}: {
  label: string;
  available: boolean;
  loading?: boolean;
  detail?: string;
}) {
  const Icon = loading ? CircleDashed : available ? CheckCircle2 : AlertCircle;
  return (
    <span
      title={detail}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium",
        loading
          ? "border-border bg-card text-muted-foreground"
          : available
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
            : "border-amber-500/25 bg-amber-500/10 text-amber-500",
      )}
    >
      <Icon size={12} className={cn("shrink-0", loading && "animate-spin")} />
      {label}
    </span>
  );
}

export function DataCoverageStrip({
  coverage,
}: {
  coverage: Array<{ label: string; available: boolean; loading?: boolean; detail?: string }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Database size={12} />
        Data Coverage
      </span>
      <div className="h-4 w-px bg-border/60" />
      {coverage.map((item) => (
        <CoveragePill key={item.label} {...item} />
      ))}
    </div>
  );
}
