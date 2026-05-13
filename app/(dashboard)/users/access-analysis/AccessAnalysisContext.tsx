"use client";

import * as React from "react";
import type { TimeWindow, ChangeStreamId } from "@/lib/acc/accessAnalysisTypes";

interface AccessAnalysisState {
  window: TimeWindow;
  setWindow: (w: TimeWindow) => void;
  focusedStream: ChangeStreamId | null;
  setFocusedStream: (s: ChangeStreamId | null) => void;
  directoryFilter: { stream: ChangeStreamId; occurredOn?: string } | null;
  setDirectoryFilter: (f: { stream: ChangeStreamId; occurredOn?: string } | null) => void;
  isDirectoryOpen: boolean;
  setDirectoryOpen: (open: boolean) => void;
}

const AccessAnalysisCtx = React.createContext<AccessAnalysisState | null>(null);

export function AccessAnalysisProvider({ children }: { children: React.ReactNode }) {
  const [window, setWindow] = React.useState<TimeWindow>("30d");
  const [focusedStream, setFocusedStream] = React.useState<ChangeStreamId | null>(null);
  const [directoryFilter, setDirectoryFilter] = React.useState<AccessAnalysisState["directoryFilter"]>(null);
  const [isDirectoryOpen, setDirectoryOpen] = React.useState(false);
  return (
    <AccessAnalysisCtx.Provider
      value={{
        window,
        setWindow,
        focusedStream,
        setFocusedStream,
        directoryFilter,
        setDirectoryFilter,
        isDirectoryOpen,
        setDirectoryOpen,
      }}
    >
      {children}
    </AccessAnalysisCtx.Provider>
  );
}

export function useAccessAnalysis() {
  const v = React.useContext(AccessAnalysisCtx);
  if (!v) throw new Error("useAccessAnalysis must be used inside AccessAnalysisProvider");
  return v;
}
