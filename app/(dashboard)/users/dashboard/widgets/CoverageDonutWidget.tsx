"use client";

import * as React from "react";
import { ResponsivePie } from "@nivo/pie";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/acc/csvExport";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import {
  useDashboardAccent,
  useSeverityColor,
} from "./_shared/dashboardTokens";

/**
 * Phase 4 Plan 06 — Coverage donut (DASH-01).
 *
 * Three-segment donut comparing the Google Workspace directory (master list) against
 * the ACC member roster:
 *   - "In both"                       — emails present in BOTH sets (green)
 *   - "In Workspace, missing ACC"     — emails in Workspace but NOT in ACC (amber)
 *   - "In ACC, missing Workspace"     — emails in ACC but NOT in Workspace (blue)
 *
 * Empty `workspaceEmails` (non-Workspace tenant or scope-missing) renders an inline
 * empty state instead of the pie — see RESEARCH.md Open Q5 / 04-04-SUMMARY.md.
 *
 * Pitfall 1 (SSR): `"use client"` MANDATORY — Nivo touches `window` at module load.
 * Pitfall 2 (height): explicit container height required so ResponsivePie can size.
 */
export interface CoverageDonutWidgetProps {
  users: BulkAccUser[];
  workspaceEmails: string[];
}

interface CoverageCounts {
  both: number;
  onlyWorkspace: number;
  onlyAcc: number;
}

function computeCoverage(
  users: BulkAccUser[],
  workspaceEmails: string[]
): CoverageCounts {
  const accEmails = new Set(users.map((u) => u.email.toLowerCase()));
  const wsEmails = new Set(workspaceEmails.map((e) => e.toLowerCase()));

  let both = 0;
  let onlyAcc = 0;
  for (const e of accEmails) {
    if (wsEmails.has(e)) both += 1;
    else onlyAcc += 1;
  }
  let onlyWorkspace = 0;
  for (const e of wsEmails) {
    if (!accEmails.has(e)) onlyWorkspace += 1;
  }
  return { both, onlyWorkspace, onlyAcc };
}

export function CoverageDonutWidget({
  users,
  workspaceEmails,
}: CoverageDonutWidgetProps) {
  const counts = React.useMemo(
    () => computeCoverage(users, workspaceEmails),
    [users, workspaceEmails]
  );

  const severity = useSeverityColor();
  const accent = useDashboardAccent();

  const data = React.useMemo(
    () => [
      {
        id: "In both",
        label: "In both",
        value: counts.both,
        color: accent.neutral, // tokens — NEUTRAL: present in both
      },
      {
        id: "In Workspace, missing ACC",
        label: "In Workspace, missing ACC",
        value: counts.onlyWorkspace,
        color: severity.MEDIUM, // tokens — MEDIUM: gap to fix on ACC side
      },
      {
        id: "In ACC, missing Workspace",
        label: "In ACC, missing Workspace",
        value: counts.onlyAcc,
        color: severity.LOW, // tokens — LOW: gap on Workspace side
      },
    ],
    [counts, accent, severity]
  );

  function handleExport() {
    downloadCsv("acc-coverage.csv", [
      { Segment: "In both", Count: counts.both },
      { Segment: "In Workspace, missing ACC", Count: counts.onlyWorkspace },
      { Segment: "In ACC, missing Workspace", Count: counts.onlyAcc },
    ]);
  }

  // Empty Workspace state — non-Workspace tenant / scope missing / not yet loaded.
  if (workspaceEmails.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Sign in with a Workspace account to see coverage.
          </p>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 size-4" />
            CSV
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-2 size-4" />
          CSV
        </Button>
      </div>
      <div style={{ height: 300 }}>
        <ResponsivePie
          data={data}
          colors={{ datum: "data.color" }}
          innerRadius={0.6}
          padAngle={1}
          cornerRadius={3}
          margin={{ top: 16, right: 16, bottom: 16, left: 16 }}
          arcLabel={(d) => String(d.value)}
          arcLabelsSkipAngle={10}
          arcLinkLabelsSkipAngle={10}
          arcLinkLabelsTextColor="currentColor"
          arcLinkLabelsThickness={1}
          tooltip={({ datum }) => (
            <div
              style={{
                background: "white",
                color: "#111",
                padding: "6px 10px",
                borderRadius: 4,
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                fontSize: 12,
              }}
            >
              <strong>{datum.label}</strong>: {datum.value}
            </div>
          )}
          activeOuterRadiusOffset={6}
        />
      </div>
    </div>
  );
}
