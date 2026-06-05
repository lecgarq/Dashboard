"use client";

import dynamic from "next/dynamic";
import { chooseGraphVariant } from "./graphVariant";

const loadingBox = (label: string) =>
  function Loading() {
    return (
      <div className="flex h-[720px] items-center justify-center rounded-md border bg-card text-sm text-muted-foreground">
        {label}
      </div>
    );
  };

// Default 3D physics shell — the primary graph environment.
const AccessAnalysisShell = dynamic(() => import("./AccessAnalysisShell").then((m) => m.AccessAnalysisShell), {
  ssr: false,
  loading: loadingBox("Loading access analytics..."),
});

// 3D embedding projector (static positions + orbit) — opt-in only (NEXT_PUBLIC_ACC_PERSON_GRAPH=1).
const PersonGraph3D = dynamic(() => import("./PersonGraph3D").then((m) => m.PersonGraph3D), {
  ssr: false,
  loading: loadingBox("Loading 3D graph..."),
});

export function AccessAnalysisShellClient(): React.JSX.Element {
  // Default = the 3D physics shell. The embedding projector is opt-in only.
  if (chooseGraphVariant(process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH) === "projector") {
    return <PersonGraph3D />;
  }
  return <AccessAnalysisShell />;
}
