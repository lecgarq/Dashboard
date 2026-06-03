"use client";

import dynamic from "next/dynamic";

const AccessAnalysisShell = dynamic(
  () => import("./AccessAnalysisShell").then((m) => m.AccessAnalysisShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[720px] items-center justify-center rounded-md border bg-card text-sm text-muted-foreground">
        Loading access analytics...
      </div>
    ),
  },
);

export function AccessAnalysisShellClient(): React.JSX.Element {
  return <AccessAnalysisShell />;
}
