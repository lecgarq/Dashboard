"use client";

import { useMemo } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/acc/csvExport";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { useFindings } from "../findingsContext";

/**
 * KPI strip — six tiles summarizing dashboard findings (DASH-09 totals surface).
 *
 * Tiles:
 *   - Members          : users.length
 *   - Roles            : distinct count across users[].allRoles
 *   - Modules          : distinct count across users[].allModules
 *   - HIGH findings    : count of HIGH-severity junk roles + duplicate pairs counted as HIGH if either flagged role is HIGH (here we count distinct findings flagged HIGH — duplicates contribute MEDIUM by 04-03 design)
 *   - MEDIUM findings  : count of MEDIUM
 *   - LOW findings     : count of LOW
 *
 * Per 04-03 SUMMARY decision: duplicate-flagged roles contribute MEDIUM. So HIGH/MEDIUM/LOW
 * tile counts are: junk-role findings tiered by severity + duplicate pairs counted as MEDIUM.
 */
export function KpiStripWidget({ users }: { users: BulkAccUser[] }) {
  const findings = useFindings();

  const tiles = useMemo(() => {
    const roleSet = new Set<string>();
    const moduleSet = new Set<string>();
    for (const u of users) {
      for (const r of u.allRoles) roleSet.add(r);
      for (const m of u.allModules) moduleSet.add(m);
    }

    const junkHigh = findings.junkRoles.filter((j) => j.severity === "HIGH").length;
    const junkMedium = findings.junkRoles.filter((j) => j.severity === "MEDIUM").length;
    const junkLow = findings.junkRoles.filter((j) => j.severity === "LOW").length;
    const dupCount = findings.duplicateRoles.length;

    return [
      { label: "Members", value: users.length, severity: "info" as const },
      { label: "Roles", value: roleSet.size, severity: "info" as const },
      { label: "Modules", value: moduleSet.size, severity: "info" as const },
      { label: "HIGH findings", value: junkHigh, severity: "high" as const },
      { label: "MEDIUM findings", value: junkMedium + dupCount, severity: "medium" as const },
      { label: "LOW findings", value: junkLow, severity: "low" as const },
    ];
  }, [users, findings]);

  function handleDownload() {
    downloadCsv(
      "kpi-summary.csv",
      tiles.map((t) => ({ Metric: t.label, Value: t.value })),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="mr-2 size-4" />
          Download CSV
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="flex flex-col gap-1 rounded-md border p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className={
                  "inline-block size-2 rounded-full " +
                  (t.severity === "high"
                    ? "bg-red-500"
                    : t.severity === "medium"
                      ? "bg-amber-500"
                      : t.severity === "low"
                        ? "bg-gray-400"
                        : "bg-blue-500")
                }
                aria-hidden
              />
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {t.label}
              </span>
            </div>
            <span className="text-2xl font-semibold tabular-nums">{t.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
