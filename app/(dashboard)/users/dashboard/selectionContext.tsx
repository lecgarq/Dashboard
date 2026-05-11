"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  DashboardFindings,
  DuplicateRoleFinding,
  JunkRoleFinding,
  OutlierFinding,
  Severity,
} from "@/lib/acc/dashboardAnalytics";

/**
 * Phase 4 Plan 8 — Selection state for the right-side drill-down panel (DASH-10).
 * Phase 4.1 Plan 1 — Extended with `admin` and `day` kinds for the constellation
 * and calendar-heatmap widget rewrites (Wave 2). Reconciliation effect lives here
 * so widgets can stay dumb (Pitfall 4 in 04.1-RESEARCH.md — single place to clear
 * stale selections when findings refresh).
 *
 * Discriminated union covering the six "kinds" of clickable findings on the
 * dashboard. Click handlers (in widgets) call `setSelected({ kind, ... })`; the
 * panel reads via `useSelection()` and renders a body per kind. Closing clears
 * state — no navigation.
 */
export type SelectedFinding =
  | { kind: "junk"; finding: JunkRoleFinding }
  | { kind: "duplicate"; finding: DuplicateRoleFinding }
  | { kind: "outlier"; finding: OutlierFinding }
  | { kind: "role"; role: string; severity: Severity | undefined }
  | { kind: "admin"; email: string }
  | { kind: "day"; dateIso: string; emails: string[] }
  | { kind: "userActivity"; email: string }
  | null;

interface SelectionContextValue {
  selected: SelectedFinding;
  setSelected: (s: SelectedFinding) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

/**
 * Returns true when the current selection still references something present
 * in the latest `findings`. junk/duplicate/outlier are validated against the
 * findings index; role/admin/day always survive within Phase 4.1's scope
 * (those don't depend on findings going stale — they reference users, which
 * reconcile via the parent query).
 */
function isSelectionValid(
  selected: NonNullable<SelectedFinding>,
  findings: DashboardFindings,
): boolean {
  switch (selected.kind) {
    case "junk":
      return findings.junkRoles.some(
        (f) => f.role === selected.finding.role,
      );
    case "duplicate":
      return findings.duplicateRoles.some(
        (f) =>
          f.roleA === selected.finding.roleA &&
          f.roleB === selected.finding.roleB,
      );
    case "outlier": {
      const key = selected.finding.moduleSet.join(",");
      return findings.outlierCombos.some(
        (f) => f.moduleSet.join(",") === key,
      );
    }
    case "role":
    case "admin":
    case "day":
    case "userActivity":
      return true;
  }
}

export function SelectionProvider({
  children,
  findings,
}: {
  children: ReactNode;
  findings?: DashboardFindings;
}) {
  const [selected, setSelected] = useState<SelectedFinding>(null);
  const clear = useCallback(() => setSelected(null), []);

  // Pitfall 4 (04.1-RESEARCH.md): selection reconciliation centralized here so
  // widgets stay dumb. When `findings` reference changes (Refresh, query
  // invalidate), drop selections that no longer correspond to a finding in the
  // new dataset.
  useEffect(() => {
    if (!findings || !selected) return;
    if (!isSelectionValid(selected, findings)) {
      setSelected(null);
    }
  }, [findings, selected]);

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
