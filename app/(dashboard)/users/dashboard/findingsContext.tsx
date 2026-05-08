"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DashboardFindings } from "@/lib/acc/dashboardAnalytics";

/**
 * Phase 4 Plan 7 — Pattern 3 single-source-of-truth for findings.
 *
 * Findings are computed ONCE in DashboardClient via `computeAllFindings(users)` and
 * passed through this context to every consuming widget. Computing inside individual
 * widgets is an anti-pattern (Pitfall 10 — drift + redundant work over a 25k-user hub).
 */
const FindingsContext = createContext<DashboardFindings | null>(null);

export function FindingsProvider({
  findings,
  children,
}: {
  findings: DashboardFindings;
  children: ReactNode;
}) {
  return (
    <FindingsContext.Provider value={findings}>
      {children}
    </FindingsContext.Provider>
  );
}

export function useFindings(): DashboardFindings {
  const ctx = useContext(FindingsContext);
  if (ctx === null) {
    throw new Error(
      "useFindings() must be called inside a <FindingsProvider> — see app/(dashboard)/users/dashboard/findingsContext.tsx",
    );
  }
  return ctx;
}
