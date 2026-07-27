"use client";

import dynamic from "next/dynamic";

// The activity universe (v2.7): one node per extracted activity event at rung
// L2. Replaces the retired user×project instance shell (ACT-03).
const ActivityUniverseShell = dynamic(
  () => import("./activity/ActivityUniverseShell").then((m) => m.ActivityUniverseShell),
  {
    ssr: false,
    loading: function Loading() {
      return (
        <div className="flex h-[720px] items-center justify-center rounded-md border bg-card text-sm text-muted-foreground">
          Loading activity universe...
        </div>
      );
    },
  },
);

export function AccessAnalysisShellClient(): React.JSX.Element {
  return <ActivityUniverseShell />;
}
