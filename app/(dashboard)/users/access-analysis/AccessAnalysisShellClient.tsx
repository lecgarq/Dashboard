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

// Default — the activity universe (v2.7): one node per extracted activity
// event at rung L2. Replaces the retired user×project instance shell (ACT-03).
const ActivityUniverseShell = dynamic(
  () => import("./activity/ActivityUniverseShell").then((m) => m.ActivityUniverseShell),
  {
    ssr: false,
    loading: loadingBox("Loading activity universe..."),
  },
);

// 3D embedding projector (static positions + orbit) — opt-in only (NEXT_PUBLIC_ACC_PERSON_GRAPH=1).
const PersonGraph3D = dynamic(() => import("./PersonGraph3D").then((m) => m.PersonGraph3D), {
  ssr: false,
  loading: loadingBox("Loading 3D graph..."),
});

export function AccessAnalysisShellClient(): React.JSX.Element {
  // Default = the activity universe. The person-graph projector stays opt-in
  // (separate product surface — survives the instance-path retirement).
  if (chooseGraphVariant(process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH) === "projector") {
    return <PersonGraph3D />;
  }
  return <ActivityUniverseShell />;
}
