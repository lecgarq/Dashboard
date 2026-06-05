"use client";

import dynamic from "next/dynamic";

const loadingBox = (label: string) =>
  function Loading() {
    return (
      <div className="flex h-[720px] items-center justify-center rounded-md border bg-card text-sm text-muted-foreground">
        {label}
      </div>
    );
  };

// 3D embedding projector (static positions + orbit) — the default environment.
const PersonGraph3D = dynamic(() => import("./PersonGraph3D").then((m) => m.PersonGraph3D), {
  ssr: false,
  loading: loadingBox("Loading 3D graph..."),
});

// Legacy 2D/3D physics shell — retained only as an escape hatch (NEXT_PUBLIC_ACC_PERSON_GRAPH="0").
const AccessAnalysisShell = dynamic(() => import("./AccessAnalysisShell").then((m) => m.AccessAnalysisShell), {
  ssr: false,
  loading: loadingBox("Loading access analytics..."),
});

export function AccessAnalysisShellClient(): React.JSX.Element {
  if (process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH === "0") {
    return <AccessAnalysisShell />;
  }
  return <PersonGraph3D />;
}
