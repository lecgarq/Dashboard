"use client";

import dynamic from "next/dynamic";
import { PersonGraphView } from "./PersonGraphView";

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
  if (process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH === "1") {
    return <PersonGraphView />;
  }
  return <AccessAnalysisShell />;
}
