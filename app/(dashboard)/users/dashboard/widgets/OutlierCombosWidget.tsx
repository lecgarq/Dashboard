"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv } from "@/lib/acc/csvExport";
import { useFindings } from "../findingsContext";
import { useSelection } from "../selectionContext";

/**
 * Outlier module-combinations widget (DASH-05).
 *
 * Lists module sets held by < 5% of members. Pattern 3: findings come from useFindings().
 */
export function OutlierCombosWidget(_props: {
  users?: unknown;
  workspaceEmails?: unknown;
}) {
  const findings = useFindings();
  const { setSelected } = useSelection();
  const rows = findings.outlierCombos;

  function handleDownload() {
    downloadCsv(
      "outlier-combos.csv",
      rows.map((r) => ({
        ModuleSet: r.moduleSet.join(", "),
        MemberCount: r.memberCount,
        TotalMembers: r.totalMembers,
        Percent: (r.pct * 100).toFixed(2),
      })),
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-end">
          <Button variant="outline" size="sm" disabled>
            <Download className="mr-2 size-4" />
            Download CSV
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          No unusual access patterns detected.
        </p>
      </div>
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Module Set</TableHead>
            <TableHead className="text-right">Members</TableHead>
            <TableHead className="text-right">% of Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, idx) => (
            <TableRow
              key={idx}
              className="cursor-pointer"
              onClick={() => setSelected({ kind: "outlier", finding: r })}
            >
              <TableCell className="max-w-[28ch] truncate font-medium">
                {r.moduleSet.length === 0 ? "(no modules)" : r.moduleSet.join(", ")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.memberCount}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {(r.pct * 100).toFixed(1)}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
