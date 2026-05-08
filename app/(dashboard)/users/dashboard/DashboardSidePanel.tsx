"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  OutlierFinding,
  Severity,
} from "@/lib/acc/dashboardAnalytics";
import { useSelection, type SelectedFinding } from "./selectionContext";

/**
 * Phase 4 Plan 8 — Right-side drill-down panel (DASH-10).
 *
 * Reuses Pattern 4 from `AccUserSidePanel.tsx` but adapted to the discriminated
 * SelectedFinding union. Renders four bodies (junk / duplicate / outlier / role).
 * Closing the sheet clears state via `useSelection().clear()` — no router push,
 * no URL change.
 *
 * Width is `sm:max-w-lg` so the dashboard stays visible at 1280px (CONTEXT.md
 * density requirement: don't cover the grid).
 */
export function DashboardSidePanel({ users }: { users: BulkAccUser[] }) {
  const { selected, clear } = useSelection();
  const open = selected !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) clear();
      }}
    >
      <SheetContent side="right" className="sm:max-w-lg">
        <AnimatePresence mode="wait">
          {selected && (
            <motion.div
              key={selectedKey(selected)}
              initial={{ x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 30, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex h-full min-h-0 flex-col"
            >
              <PanelBody selected={selected} users={users} />
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}

function selectedKey(s: NonNullable<SelectedFinding>): string {
  switch (s.kind) {
    case "junk":
      return `junk:${s.finding.role}`;
    case "duplicate":
      return `dup:${s.finding.roleA}|${s.finding.roleB}`;
    case "outlier":
      return `out:${s.finding.moduleSet.join(",")}`;
    case "role":
      return `role:${s.role}`;
  }
}

function severityVariant(
  sev: Severity | undefined,
): "destructive" | "default" | "secondary" {
  if (sev === "HIGH") return "destructive";
  if (sev === "MEDIUM") return "default";
  return "secondary";
}

function PanelBody({
  selected,
  users,
}: {
  selected: NonNullable<SelectedFinding>;
  users: BulkAccUser[];
}) {
  switch (selected.kind) {
    case "junk":
      return <JunkBody finding={selected.finding} users={users} />;
    case "duplicate":
      return <DuplicateBody finding={selected.finding} users={users} />;
    case "outlier":
      return <OutlierBody finding={selected.finding} users={users} />;
    case "role":
      return <RoleBody role={selected.role} severity={selected.severity} users={users} />;
  }
}

/* ------------------------------------------------------------------ helpers */

function MembersTable({
  emails,
  users,
  csvName,
}: {
  emails: string[];
  users: BulkAccUser[];
  csvName: string;
}) {
  const rows = useMemo(() => {
    const lookup = new Map<string, BulkAccUser>();
    for (const u of users) lookup.set(u.email.toLowerCase(), u);
    return emails.map((email) => {
      const u = lookup.get(email.toLowerCase());
      return {
        email,
        name: u?.name ?? "",
        companyRole: u?.companyRole ?? "",
        lastSignIn: u?.lastSignIn ?? null,
      };
    });
  }, [emails, users]);

  function handleExport() {
    downloadCsv(
      csvName,
      rows.map((r) => ({
        Email: r.email,
        Name: r.name,
        CompanyRole: r.companyRole,
        LastSignIn: r.lastSignIn ?? "",
      })),
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No members.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {rows.length} member{rows.length === 1 ? "" : "s"}
        </p>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-2 size-3.5" />
          CSV
        </Button>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.email}>
                <TableCell className="font-mono text-xs">{r.email}</TableCell>
                <TableCell className="text-sm">{r.name || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">None</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <Badge key={it} variant="secondary" className="font-normal">
          {it}
        </Badge>
      ))}
    </div>
  );
}

function RawData({ value }: { value: unknown }) {
  return (
    <details className="rounded-md border bg-muted/30 p-2">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        Raw data
      </summary>
      <pre className="mt-2 max-h-60 overflow-auto text-[11px]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

/* ----------------------------------------------------------------- bodies */

function JunkBody({
  finding,
  users,
}: {
  finding: JunkRoleFinding;
  users: BulkAccUser[];
}) {
  const signals = [
    { key: "zeroMembers", label: "Zero members", fired: finding.signals.zeroMembers },
    { key: "zeroModules", label: "Zero modules", fired: finding.signals.zeroModules },
    { key: "allInactive90d", label: "All members inactive >90d", fired: finding.signals.allInactive90d },
  ];

  const action =
    finding.severity === "HIGH"
      ? "Delete role — zero members, zero modules, all-inactive >90d"
      : finding.severity === "MEDIUM"
        ? "Review for deletion — multiple cleanup signals fired"
        : "Investigate — single cleanup signal fired";

  // Modules union across affected members
  const modules = useMemo(() => {
    const out = new Set<string>();
    const lookup = new Map<string, BulkAccUser>();
    for (const u of users) lookup.set(u.email.toLowerCase(), u);
    for (const email of finding.affectedMembers) {
      const u = lookup.get(email.toLowerCase());
      if (u) for (const m of u.allModules) out.add(m);
    }
    return [...out].sort();
  }, [finding, users]);

  return (
    <>
      <SheetHeader>
        <div className="flex items-center justify-between gap-3 pr-8">
          <SheetTitle className="truncate">Junk role: {finding.role}</SheetTitle>
          <Badge variant={severityVariant(finding.severity)}>{finding.severity}</Badge>
        </div>
        <SheetDescription>
          Cleanup candidate — {signals.filter((s) => s.fired).length} of 3 signals fired.
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 min-h-0 flex-col gap-5 overflow-y-auto px-4 pb-6">
        <Section title="Signals fired">
          <div className="flex flex-col gap-1.5">
            {signals.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-sm">
                <Badge variant={s.fired ? "destructive" : "secondary"} className="w-20 justify-center">
                  {s.fired ? "Fired" : "Clear"}
                </Badge>
                <span className={s.fired ? "text-foreground" : "text-muted-foreground"}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Affected members">
          <MembersTable
            emails={finding.affectedMembers}
            users={users}
            csvName={`junk-${finding.role}-members.csv`}
          />
        </Section>

        <Section title="Affected projects">
          <ChipList items={finding.affectedProjects} />
        </Section>

        <Section title="Modules">
          <ChipList items={modules} />
        </Section>

        <Section title="Suggested action">
          <p className="text-sm">{action}</p>
        </Section>

        <RawData value={finding} />
      </div>
    </>
  );
}

function DuplicateBody({
  finding,
  users,
}: {
  finding: DuplicateRoleFinding;
  users: BulkAccUser[];
}) {
  const pct = Math.round(finding.nameOverlap * 100);
  const longer = finding.roleA.length >= finding.roleB.length ? finding.roleA : finding.roleB;
  const action = `Consider merging — keep '${longer}' (modules identical, name overlap ${pct}%)`;

  const modules = useMemo(() => {
    const out = new Set<string>();
    const lookup = new Map<string, BulkAccUser>();
    for (const u of users) lookup.set(u.email.toLowerCase(), u);
    for (const email of finding.affectedMembers) {
      const u = lookup.get(email.toLowerCase());
      if (u) for (const m of u.allModules) out.add(m);
    }
    return [...out].sort();
  }, [finding, users]);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-8">
          Duplicate roles: {finding.roleA} ↔ {finding.roleB}
        </SheetTitle>
        <SheetDescription>
          Name overlap {pct}% · modules identical
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 min-h-0 flex-col gap-5 overflow-y-auto px-4 pb-6">
        <Section title="Modules (union)">
          <ChipList items={modules} />
        </Section>

        <Section title="Affected members">
          <MembersTable
            emails={finding.affectedMembers}
            users={users}
            csvName={`duplicate-${finding.roleA}-${finding.roleB}-members.csv`}
          />
        </Section>

        <Section title="Affected projects">
          <ChipList items={finding.affectedProjects} />
        </Section>

        <Section title="Suggested action">
          <p className="text-sm">{action}</p>
        </Section>

        <RawData value={finding} />
      </div>
    </>
  );
}

function OutlierBody({
  finding,
  users,
}: {
  finding: OutlierFinding;
  users: BulkAccUser[];
}) {
  const action = "Review whether this combination is intentional";
  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-8">Unusual access pattern</SheetTitle>
        <SheetDescription>
          Held by {finding.memberCount} of {finding.totalMembers} members (
          {(finding.pct * 100).toFixed(1)}%)
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 min-h-0 flex-col gap-5 overflow-y-auto px-4 pb-6">
        <Section title="Module set">
          <ChipList items={finding.moduleSet.length === 0 ? ["(no modules)"] : finding.moduleSet} />
        </Section>

        <Section title="Affected members">
          <MembersTable
            emails={finding.affectedMembers}
            users={users}
            csvName={`outlier-${finding.moduleSet.join("-") || "empty"}-members.csv`}
          />
        </Section>

        <Section title="Suggested action">
          <p className="text-sm">{action}</p>
        </Section>

        <RawData value={finding} />
      </div>
    </>
  );
}

function RoleBody({
  role,
  severity,
  users,
}: {
  role: string;
  severity: Severity | undefined;
  users: BulkAccUser[];
}) {
  const { members, modules, projects } = useMemo(() => {
    const memberEmails: string[] = [];
    const moduleSet = new Set<string>();
    const projectSet = new Set<string>();
    for (const u of users) {
      const has = (u.allRoles ?? []).includes(role);
      if (!has) continue;
      memberEmails.push(u.email);
      for (const p of u.projects ?? []) {
        if ((p.roles ?? []).includes(role)) {
          projectSet.add(p.name);
          for (const m of p.modules ?? []) moduleSet.add(m);
        }
      }
    }
    return {
      members: memberEmails,
      modules: [...moduleSet].sort(),
      projects: [...projectSet].sort(),
    };
  }, [role, users]);

  return (
    <>
      <SheetHeader>
        <div className="flex items-center justify-between gap-3 pr-8">
          <SheetTitle className="truncate">Role: {role}</SheetTitle>
          {severity && <Badge variant={severityVariant(severity)}>{severity}</Badge>}
        </div>
        <SheetDescription>
          {members.length} member{members.length === 1 ? "" : "s"} · {projects.length} project
          {projects.length === 1 ? "" : "s"}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 min-h-0 flex-col gap-5 overflow-y-auto px-4 pb-6">
        <Section title="Members holding this role">
          <MembersTable
            emails={members}
            users={users}
            csvName={`role-${role}-members.csv`}
          />
        </Section>

        <Section title="Modules typically associated">
          <ChipList items={modules} />
        </Section>

        <Section title="Projects">
          <ChipList items={projects} />
        </Section>
      </div>
    </>
  );
}
