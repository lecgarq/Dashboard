"use client";

import { createContext, useContext } from "react";
import type {
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
  // Phase 5.1 — Wave 5.1 additions
  /** GRAPH-04 + DASH matrix fallback: folder node clicked or folder row selected */
  | { kind: "folder"; folderUrn: string }
  /** GRAPH-03: toolbar/legend admin-tier clicked — spotlights matching users */
  | { kind: "adminTier"; tier: "hub" | "project" | "executive" }
  // Phase 4 Plan 6 — folder permission matrix cell drilldown
  | {
      kind: "folderPermission";
      folderId: string;
      folderPath: string;
      roleId: string;
      roleName: string;
      projectId: string;
      projectName: string;
      permType: string;
      actions: string[];
      orphanReasons: string[];
    }
  | null;

interface SelectionContextValue {
  selected: SelectedFinding;
  setSelected: (s: SelectedFinding) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (ctx === null) {
    throw new Error(
      "useSelection() must be called inside a <SelectionProvider> — see app/(dashboard)/users/dashboard/selectionContext.tsx",
    );
  }
  return ctx;
}
