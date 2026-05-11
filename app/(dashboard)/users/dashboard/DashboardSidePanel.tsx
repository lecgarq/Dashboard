"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { format, parseISO, formatDistanceToNowStrict } from "date-fns";
import { downloadCsv } from "@/lib/acc/csvExport";
import { trpc } from "@/lib/core/trpc";
import { categorize, type ActivityCategory } from "@/lib/acc/activityCategories";
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
    case "admin":
      return `admin:${s.email}`;
    case "day":
      return `day:${s.dateIso}`;
    case "userActivity":
      return `userActivity:${s.email}`;
    default: {
      const _exhaust: never = s;
      return _exhaust;
    }
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
    case "admin":
      return <AdminBody email={selected.email} users={users} />;
    case "day":
      return <DayBody dateIso={selected.dateIso} emails={selected.emails} users={users} />;
    case "userActivity":
      return <UserActivityBody email={selected.email} users={users} />;
    default: {
      const _exhaust: never = selected;
      return _exhaust;
    }
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

function AdminBody({
  email,
  users,
}: {
  email: string;
  users: BulkAccUser[];
}) {
  const user = useMemo(
    () => users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null,
    [email, users],
  );
  const projects = user?.projects ?? [];
  const lastSignIn = user?.lastSignIn ?? null;
  const headerName = user?.name && user.name.length > 0 ? user.name : email;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="truncate pr-8">Account admin: {headerName}</SheetTitle>
        <SheetDescription>
          {projects.length} project{projects.length === 1 ? "" : "s"}
          {lastSignIn ? ` · Last sign-in ${lastSignIn}` : ""}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 min-h-0 flex-col gap-5 overflow-y-auto px-4 pb-6">
        <Section title="Member">
          <MembersTable
            emails={[email]}
            users={users}
            csvName={`admin-${email}.csv`}
          />
        </Section>

        <Section title="Company role">
          <p className="text-sm">{user?.companyRole || "Unspecified"}</p>
        </Section>

        <Section title="Projects">
          <ChipList items={projects.map((p) => p.name).sort()} />
        </Section>

        {user ? <RawData value={user} /> : (
          <p className="text-sm text-muted-foreground">
            No matching user found for {email} in the current dataset.
          </p>
        )}
      </div>
    </>
  );
}

function DayBody({
  dateIso,
  emails,
  users,
}: {
  dateIso: string;
  emails: string[];
  users: BulkAccUser[];
}) {
  const formatted = useMemo(() => {
    try {
      return format(parseISO(dateIso), "MMM d, yyyy");
    } catch {
      return dateIso;
    }
  }, [dateIso]);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-8">Members added on {formatted}</SheetTitle>
        <SheetDescription>
          {emails.length} member{emails.length === 1 ? "" : "s"} joined this day
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 min-h-0 flex-col gap-5 overflow-y-auto px-4 pb-6">
        <Section title="Members">
          <MembersTable
            emails={emails}
            users={users}
            csvName={`recent-${dateIso}-members.csv`}
          />
        </Section>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- user activity (ACTV-05) */

type DateRangePreset = "all" | "7d" | "30d" | "90d";

const SECTIONS: ReadonlyArray<{
  key: "files" | "memberEvents" | "projectEvents" | "other";
  label: string;
  categories: ActivityCategory[];
}> = [
  { key: "files", label: "Files", categories: ["view", "upload", "edit", "delete"] },
  { key: "memberEvents", label: "Member events", categories: ["memberEvent"] },
  { key: "projectEvents", label: "Project events", categories: ["projectEvent"] },
  { key: "other", label: "Other", categories: ["other"] },
];

function actionLabel(rawAction: string): string {
  const cat = categorize(rawAction);
  switch (cat) {
    case "view":
      return rawAction.startsWith("File Downloaded") ? "Downloaded" : "Viewed";
    case "upload":
      return rawAction === "Document Version Created" ? "Versioned" : "Uploaded";
    case "edit":
      if (rawAction === "Markup Created") return "Marked up";
      if (rawAction === "Comment Added") return "Commented on";
      return "Edited";
    case "delete":
      return rawAction === "File Restored" ? "Restored" : "Deleted";
    case "memberEvent":
      return rawAction;
    case "projectEvent":
      return rawAction;
    default:
      return rawAction;
  }
}

/**
 * Try to pull the target object (file name, user email, project) out of the raw
 * details payload. The Data Connector CSV `details` column is free-form text,
 * so this is a heuristic — fall back to the full string when no clear target.
 */
function deriveTarget(details: string | null): string {
  if (!details) return "—";
  const trimmed = details.trim();
  // Prefer quoted segments ("Foo.dwg" style)
  const quoted = trimmed.match(/"([^"]+)"|'([^']+)'/);
  if (quoted) return quoted[1] ?? quoted[2] ?? trimmed;
  // Otherwise first email-like or first 80 chars
  return trimmed.length > 80 ? trimmed.slice(0, 77) + "…" : trimmed;
}

/**
 * Standalone activity body for a single user. Renders 4 type sections, each
 * independently paginated with a per-section "Load more" button. Filter bar
 * above the sections is a single source of truth — every change refetches all
 * sections.
 *
 * Reused both inside DashboardSidePanel (kind="userActivity") and as a body
 * inside UsersDirectoryClient's local sheet (cell-click drilldown).
 */
export function UserActivityBody({
  email,
  users,
}: {
  email: string;
  users: BulkAccUser[];
}) {
  const emailLower = email.toLowerCase();
  const user = useMemo(
    () => users.find((u) => u.email.toLowerCase() === emailLower) ?? null,
    [users, emailLower],
  );
  const headerName = user?.name && user.name.length > 0 ? user.name : email;

  // Build {projectId → name} map across all loaded users for row decoration.
  const projectNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) {
      for (const p of u.projects ?? []) m.set(p.id, p.name);
    }
    return m;
  }, [users]);

  // Filter bar state
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("all");
  const [projectId, setProjectId] = useState<string | "all">("all");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    files: true,
    memberEvents: true,
    projectEvents: true,
    other: true,
  });

  const dateRange = useMemo(() => {
    if (dateRangePreset === "all") return undefined;
    const days = dateRangePreset === "7d" ? 7 : dateRangePreset === "30d" ? 30 : 90;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return { from, to: new Date() };
  }, [dateRangePreset]);

  const projectChoices = useMemo(
    () => (user?.projects ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [user],
  );

  function clearFilters() {
    setDateRangePreset("all");
    setProjectId("all");
  }

  const filtersActive = dateRangePreset !== "all" || projectId !== "all";

  return (
    <>
      <SheetHeader>
        <SheetTitle className="truncate pr-8">Activity: {headerName}</SheetTitle>
        <SheetDescription className="truncate">{email}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-6">
        {/* Filter bar */}
        <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur">
          <Select
            value={dateRangePreset}
            onValueChange={(v) => setDateRangePreset(v as DateRangePreset)}
          >
            <SelectTrigger className="h-7 w-auto min-w-[120px] text-[11px]">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>

          <Select value={projectId} onValueChange={(v) => setProjectId(v)}>
            <SelectTrigger className="h-7 w-auto min-w-[140px] max-w-[200px] text-[11px]">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projectChoices.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filtersActive && (
            <button
              onClick={clearFilters}
              className="text-[11px] text-primary hover:underline"
            >
              Clear
            </button>
          )}
        </div>

        {SECTIONS.map((section) => (
          <ActivitySection
            key={section.key}
            email={emailLower}
            sectionKey={section.key}
            label={section.label}
            categories={section.categories}
            open={openSections[section.key] ?? true}
            onToggle={() =>
              setOpenSections((prev) => ({
                ...prev,
                [section.key]: !(prev[section.key] ?? true),
              }))
            }
            projectId={projectId === "all" ? undefined : projectId}
            dateRange={dateRange}
            projectNameById={projectNameById}
            filtersActive={filtersActive}
            onClearFilters={clearFilters}
          />
        ))}
      </div>
    </>
  );
}

function ActivitySection({
  email,
  sectionKey,
  label,
  categories,
  open,
  onToggle,
  projectId,
  dateRange,
  projectNameById,
  filtersActive,
  onClearFilters,
}: {
  email: string;
  sectionKey: string;
  label: string;
  categories: ActivityCategory[];
  open: boolean;
  onToggle: () => void;
  projectId: string | undefined;
  dateRange: { from: Date; to: Date } | undefined;
  projectNameById: Map<string, string>;
  filtersActive: boolean;
  onClearFilters: () => void;
}) {
  const query = trpc.accActivity.listForUser.useInfiniteQuery(
    {
      email,
      categories,
      projectId,
      dateRange,
      limit: 25,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 60_000,
    },
  );

  const rows = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.rows),
    [query.data],
  );

  const count = rows.length + (query.hasNextPage ? "+" : "");

  return (
    <section className="flex flex-col gap-2">
      <button
        onClick={onToggle}
        className="group flex items-center gap-2 text-left"
      >
        {open ? (
          <ChevronDown size={14} className="text-primary" />
        ) : (
          <ChevronRight
            size={14}
            className="text-muted-foreground group-hover:text-primary transition-colors"
          />
        )}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {query.isLoading ? "…" : count}
        </Badge>
      </button>

      {open && (
        <div className="ml-5 flex flex-col gap-1.5">
          {query.isLoading && (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
          {!query.isLoading && rows.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>No activity in this range</span>
              {filtersActive && (
                <button
                  onClick={onClearFilters}
                  className="text-primary hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
          {rows.map((row) => {
            const created = row.createdAt instanceof Date
              ? row.createdAt
              : new Date(row.createdAt);
            const projName = row.projectId
              ? projectNameById.get(row.projectId) ?? row.projectId
              : null;
            return (
              <div
                key={row.id}
                className="text-xs leading-snug text-foreground"
                title={created.toISOString()}
              >
                <span className="font-medium">{actionLabel(row.rawAction)}</span>
                <span className="text-muted-foreground"> → </span>
                <span>{deriveTarget(row.details)}</span>
                {projName && (
                  <>
                    <span className="text-muted-foreground"> · </span>
                    <span className="text-muted-foreground">{projName}</span>
                  </>
                )}
                <span className="text-muted-foreground"> · </span>
                <span className="text-muted-foreground">
                  {formatDistanceToNowStrict(created, { addSuffix: true })}
                </span>
              </div>
            );
          })}
          {query.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              className="mt-1 self-start h-7 text-[11px]"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          )}
          {query.error && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertCircle size={11} />
              <span>Failed to load — {query.error.message}</span>
            </div>
          )}
        </div>
      )}
    </section>
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
