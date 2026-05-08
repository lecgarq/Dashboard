"use client";

import { useMemo, useState } from "react";
import { differenceInDays, formatDistanceToNow, parseISO } from "date-fns";
import { Download, Info } from "lucide-react";
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
 * Recently-added widget (DASH-06).
 *
 * Lists members whose `addedOn` falls within the selected window (7d / 30d / 90d, default 30d).
 * Per Plan 04-02 SUMMARY: Path A (real ACC `created_at`); legacy cache rows surface as null
 * and are excluded from every window. No fallback caveat tooltip needed.
 */

const WINDOWS = [7, 30, 90] as const;
type Window = (typeof WINDOWS)[number];

export function RecentlyAddedWidget({ users }: { users: BulkAccUser[] }) {
  const [windowDays, setWindowDays] = useState<Window>(30);

  const filtered = useMemo(() => {
    const now = new Date();
    return users
      .filter((u) => {
        if (!u.addedOn) return false;
        try {
          const days = differenceInDays(now, parseISO(u.addedOn));
          return Number.isFinite(days) && days >= 0 && days <= windowDays;
        } catch {
          return false;
        }
      })
      .sort((a, b) => {
        // Newest first
        return (b.addedOn ?? "").localeCompare(a.addedOn ?? "");
      });
  }, [users, windowDays]);

  function handleDownload() {
    downloadCsv(
      `recently-added-${windowDays}d.csv`,
      filtered.map((u) => ({
        Email: u.email,
        Name: u.name,
        CompanyRole: u.companyRole ?? "",
        AddedOn: u.addedOn ?? "",
      })),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground"
          title="Based on ACC member-creation date (HQ v1 created_at). Users without a recorded join date are excluded."
        >
          <Info className="size-3" />
          <span>Based on ACC join date</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border" role="group" aria-label="Window">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={windowDays === w}
                onClick={() => setWindowDays(w)}
                className={
                  "px-3 py-1 text-xs first:rounded-l-md last:rounded-r-md " +
                  (windowDays === w
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted")
                }
              >
                {w}d
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="mr-2 size-4" />
            Download CSV
          </Button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No members added in the last {windowDays} days.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Company Role</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.email}>
                <TableCell className="font-mono text-xs">{u.email}</TableCell>
                <TableCell>{u.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {u.companyRole ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.addedOn
                    ? formatDistanceToNow(parseISO(u.addedOn), { addSuffix: true })
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
