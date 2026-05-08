import { Suspense } from "react";
import { DashboardClient } from "./DashboardClient";

export const metadata = { title: "ACC Access Analysis Dashboard" };

/**
 * Phase 4 Plan 5 — Dashboard route shell (server component).
 *
 * Auth is enforced by the parent (dashboard) layout (mirrors app/(dashboard)/users/page.tsx).
 * No chart library is imported here (Pitfall 1 — Nivo/ECharts crash during SSR if pulled
 * into a server component). Everything chart-related lives behind the DashboardClient
 * boundary.
 */
export default function AccAnalysisDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="loading-spinner" />
        </div>
      }
    >
      <DashboardClient />
    </Suspense>
  );
}
