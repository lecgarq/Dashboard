"use client";

/**
 * Phase 4-02 page entry — composes AccessAnalysisShell.
 *
 * AccessAnalysisShell loads DuckDB + cosmos.gl on mount; both require the
 * browser runtime. Dynamic import + ssr:false is the standard pattern used by
 * AccessAnalysisPage for the same reason.
 */

import dynamic from "next/dynamic";

const AccessAnalysisShell = dynamic(
  () => import("./AccessAnalysisShell").then((m) => m.AccessAnalysisShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[720px] items-center justify-center rounded-md border bg-card text-sm text-muted-foreground">
        Loading access analytics…
      </div>
    ),
  },
);

export default function Page(): React.JSX.Element {
  return (
    <div className="h-screen">
      <AccessAnalysisShell />
    </div>
  );
}
