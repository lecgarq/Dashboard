"use client";

import { useMemo } from "react";
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
import type { BulkAccUser } from "@/lib/acc/acc-types";

/**
 * Admin-access widget (DASH-07).
 *
 * Filters strictly on `isAccountAdmin === true` per CONTEXT.md decision — project admins
 * and shadow admins are excluded. Strict equality: legacy cache rows where the field is
 * undefined are filtered out (Pitfall in 04-01: default-false fallback in bulkAccSummary
 * makes this safe — but keeping `=== true` defensive against any future drift).
 */
export function AdminAccessWidget({ users }: { users: BulkAccUser[] }) {
  const admins = useMemo(
    () =>
      users
        .filter((u) => u.isAccountAdmin === true)
        .sort((a, b) => a.email.localeCompare(b.email)),
    [users],
  );

  function handleDownload() {
    downloadCsv(
      "account-admins.csv",
      admins.map((u) => ({
        Email: u.email,
        Name: u.name,
        CompanyRole: u.companyRole ?? "",
      })),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Account-level only — project admins and shadow admins excluded.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={admins.length === 0}
        >
          <Download className="mr-2 size-4" />
          Download CSV
        </Button>
      </div>
      {admins.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No account-level admins found.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Company Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((u) => (
              <TableRow key={u.email}>
                <TableCell className="font-mono text-xs">{u.email}</TableCell>
                <TableCell>{u.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {u.companyRole ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
