"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  DuplicateRoleFinding,
  JunkRoleFinding,
  OutlierFinding,
  Severity,
} from "@/lib/acc/dashboardAnalytics";

/**
 * Phase 4 Plan 8 — Selection state for the right-side drill-down panel (DASH-10).
 *
 * Discriminated union covering the four "kinds" of clickable findings on the dashboard.
 * Click handlers (in widgets) call `setSelected({ kind, ... })`; the panel reads via
 * `useSelection()` and renders a body per kind. Closing clears state — no navigation.
 */
export type SelectedFinding =
  | { kind: "junk"; finding: JunkRoleFinding }
  | { kind: "duplicate"; finding: DuplicateRoleFinding }
  | { kind: "outlier"; finding: OutlierFinding }
  | { kind: "role"; role: string; severity: Severity | undefined }
  | null;

interface SelectionContextValue {
  selected: SelectedFinding;
  setSelected: (s: SelectedFinding) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<SelectedFinding>(null);
  const clear = useCallback(() => setSelected(null), []);
  const value = useMemo<SelectionContextValue>(
    () => ({ selected, setSelected, clear }),
    [selected, clear],
  );
  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (ctx === null) {
    throw new Error(
      "useSelection() must be called inside a <SelectionProvider> — see app/(dashboard)/users/dashboard/selectionContext.tsx",
    );
  }
  return ctx;
}
