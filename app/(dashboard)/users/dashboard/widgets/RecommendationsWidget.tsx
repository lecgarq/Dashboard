"use client";

import { useMemo } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type {
  DuplicateRoleFinding,
  JunkRoleFinding,
  Severity,
} from "@/lib/acc/dashboardAnalytics";
import { useFindings } from "../findingsContext";

/**
 * Recommendations widget — DASH-03 + DASH-04 surfaced as a single actionable list (DASH-09).
 *
 * Each row is either a Junk-role finding or a Duplicate-role pair. CSV column order is
 * LOCKED by DASH-13: `Type,Severity,Roles,Members,Modules,SuggestedAction`.
 *
 * Pattern 3: findings come from `useFindings()` — never recomputed locally.
 */

type RowFinding =
  | { kind: "junk"; data: JunkRoleFinding }
  | { kind: "duplicate"; data: DuplicateRoleFinding };

function severityForRow(row: RowFinding): Severity {
  // Per 04-03 SUMMARY decision: duplicate-flagged roles contribute MEDIUM.
  return row.kind === "junk" ? row.data.severity : "MEDIUM";
}

function severityVariant(sev: Severity): "destructive" | "default" | "secondary" {
  if (sev === "HIGH") return "destructive";
  if (sev === "MEDIUM") return "default";
  return "secondary";
}

function junkSuggestedAction(j: JunkRoleFinding): string {
  if (j.severity === "HIGH") {
    return "Delete role — zero members, zero modules, all-inactive >90d";
  }
  const fired: string[] = [];
  if (j.signals.zeroMembers) fired.push("zero members");
  if (j.signals.zeroModules) fired.push("zero modules");
  if (j.signals.allInactive90d) fired.push("all members inactive >90d");
  if (j.severity === "MEDIUM") {
    return `Review for deletion — ${fired.length} signals fired (${fired.join(", ")})`;
  }
  return `Investigate — ${fired.length} signal fired (${fired.join(", ")})`;
}

function duplicateSuggestedAction(d: DuplicateRoleFinding): string {
  const pct = Math.round(d.nameOverlap * 100);
  return `Consider merging '${d.roleA}' and '${d.roleB}' (modules identical, name overlap ${pct}%)`;
}

function rolesLabel(row: RowFinding): string {
  return row.kind === "junk"
    ? row.data.role
    : `${row.data.roleA}, ${row.data.roleB}`;
}

function memberCount(row: RowFinding): number {
  return row.data.affectedMembers.length;
}

function modulesLabel(row: RowFinding, users: Map<string, Set<string>>): string {
  if (row.kind === "junk") {
    // Junk findings don't carry modules directly; HIGH cases have zero modules.
    // Consult the per-role module union (precomputed by analytics) by deriving it
    // from affected projects — but the simpler/correct answer is: junk roles surface
    // either zero modules (HIGH) or whatever was aggregated; we expose empty string
    // when zeroModules signal fired.
    if (row.data.signals.zeroModules) return "";
    // Fallback: union of modules across affected members for this role.
    const mods = new Set<string>();
    for (const email of row.data.affectedMembers) {
      const set = users.get(email);
      if (set) for (const m of set) mods.add(m);
    }
    return [...mods].sort().join(", ");
  }
  // Duplicate: union of modules across affected members.
  const mods = new Set<string>();
  for (const email of row.data.affectedMembers) {
    const set = users.get(email);
    if (set) for (const m of set) mods.add(m);
  }
  return [...mods].sort().join(", ");
}

export function RecommendationsWidget({
  users,
  onSelect,
}: {
  users: BulkAccUser[];
  workspaceEmails?: string[];
  onSelect?: (finding: JunkRoleFinding | DuplicateRoleFinding) => void;
}) {
  const findings = useFindings();

  const rows = useMemo<RowFinding[]>(() => {
    return [
      ...findings.junkRoles.map<RowFinding>((j) => ({ kind: "junk", data: j })),
      ...findings.duplicateRoles.map<RowFinding>((d) => ({ kind: "duplicate", data: d })),
    ];
  }, [findings]);

  // Build email → user.allModules lookup so the Modules column reflects each finding's
  // affected members. Done here (not in widget body) so it's memoized per `users` change.
  const moduleLookup = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const u of users) m.set(u.email, new Set(u.allModules));
    return m;
  }, [users]);

  function handleDownload() {
    // LOCKED column order — DASH-13.
    const csvRows = rows.map((row) => {
      const sev = severityForRow(row);
      const action =
        row.kind === "junk"
          ? junkSuggestedAction(row.data)
          : duplicateSuggestedAction(row.data);
      return {
        Type: row.kind === "junk" ? "Junk" : "Duplicate",
        Severity: sev,
        Roles: rolesLabel(row),
        Members: memberCount(row),
        Modules: modulesLabel(row, moduleLookup),
        SuggestedAction: action,
      };
    });
    downloadCsv("recommendations.csv", csvRows);
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
          No recommendations — nothing to clean up right now.
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
            <TableHead>Type</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead className="text-right">Members</TableHead>
            <TableHead>Modules</TableHead>
            <TableHead>Suggested Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => {
            const sev = severityForRow(row);
            const action =
              row.kind === "junk"
                ? junkSuggestedAction(row.data)
                : duplicateSuggestedAction(row.data);
            return (
              <TableRow
                key={`${row.kind}-${idx}`}
                className={onSelect ? "cursor-pointer" : undefined}
                onClick={() => onSelect?.(row.data)}
              >
                <TableCell className="capitalize">{row.kind}</TableCell>
                <TableCell>
                  <Badge variant={severityVariant(sev)}>{sev}</Badge>
                </TableCell>
                <TableCell className="font-medium">{rolesLabel(row)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {memberCount(row)}
                </TableCell>
                <TableCell className="max-w-[20ch] truncate text-muted-foreground">
                  {modulesLabel(row, moduleLookup) || "—"}
                </TableCell>
                <TableCell className="whitespace-normal text-sm">{action}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
