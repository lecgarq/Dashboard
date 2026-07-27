"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/core/trpc";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, RefreshCw } from "lucide-react";
import { motion, fadeUp, useSafeVariants } from "@/components/ui/motion";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { type AggregatedStatus } from "@/lib/acc/accStatusReduction";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useShallow } from "zustand/shallow";
import type { GroupByField } from "./directoryUtils";
import { useUsersDirectoryData } from "./useUsersDirectoryData";
import { useUsersDirectoryStore } from "./useUsersDirectoryStore";
import { DataCoverageStrip } from "./DataCoverageStrip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DirectoryFilterBar } from "./DirectoryFilterBar";
import { useDirectoryRows } from "./useDirectoryRows";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/DataTable";
import { DrillSheet } from "@/components/ui/DrillSheet";
import { USERS_COLUMNS } from "./DirectoryTableColumns";
import { buildDirectoryRows, type DirectoryRow } from "./directoryTableRow";
import { classifyAffiliation } from "./access-analysis/internalDomains";
import { PeekPanel } from "./PeekPanel";
import { UsersTableSkeleton } from "./UsersTableSkeleton";
import { UsersTableHeader } from "./UsersTableHeader";

const UserActivityBody = dynamic<{ email: string; users: BulkAccUser[] }>(
  () => import("./dashboard/DashboardSidePanel").then((m) => m.UserActivityBody),
  { ssr: false, loading: () => <div className="h-80 rounded-xl bg-muted/20 animate-pulse" /> },
);

const UserProfilePanel = dynamic(
  () => import("./UserProfilePanel").then((m) => m.UserProfilePanel),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// UsersDirectoryClient — DataTable-driven /users directory shell (Plan 04-03)
// ---------------------------------------------------------------------------
export function UsersDirectoryClient() {
  // ---- Motion facade — called ONCE at component scope (Rules of Hooks) ------
  // fadeUp (opacity + gentle upward drift, 0.35s) gives a perceptible calm
  // entrance; plain opacity-only fadeIn at 0.25s was imperceptible (G3).
  const safeFade = useSafeVariants(fadeUp);

  // ---- Store state (batched reads via useShallow) -------------------------
  const { search, groupBy, activitySort, selectedEmail, activityEmail, activatedEmails,
    debouncedSearch, filterDept, filterJobTitle, filterCostCenter, filterNoProjects,
    filterAccProject, filterAccRole, filterAccModule, statusFilter, projectAdminFilter,
  } = useUsersDirectoryStore(useShallow((s) => ({
    search: s.search, groupBy: s.groupBy, activitySort: s.activitySort,
    selectedEmail: s.selectedEmail, activityEmail: s.activityEmail, activatedEmails: s.activatedEmails,
    debouncedSearch: s.debouncedSearch, filterDept: s.filterDept, filterJobTitle: s.filterJobTitle,
    filterCostCenter: s.filterCostCenter, filterNoProjects: s.filterNoProjects,
    filterAccProject: s.filterAccProject, filterAccRole: s.filterAccRole, filterAccModule: s.filterAccModule,
    statusFilter: s.statusFilter, projectAdminFilter: s.projectAdminFilter,
  })));

  // ---- Store actions -------------------------------------------------------
  const {
    setSearch, setDebouncedSearch, setGroupBy,
    setStatusFilter, setProjectAdminFilter, setActivityEmail, setSelectedEmail,
    clearAllFilters, activateEmail: storeActivateEmail,
  } = useUsersDirectoryStore(useShallow((s) => ({
    setSearch: s.setSearch, setDebouncedSearch: s.setDebouncedSearch, setGroupBy: s.setGroupBy,
    setStatusFilter: s.setStatusFilter, setProjectAdminFilter: s.setProjectAdminFilter,
    setActivityEmail: s.setActivityEmail, setSelectedEmail: s.setSelectedEmail,
    clearAllFilters: s.clearAllFilters, activateEmail: s.activateEmail,
  })));

  // ---- Shell-only state / refs --------------------------------------------
  const [perfLoggingEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    return p.has("usersPerf") || localStorage.getItem("users-perf") === "1";
  });
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const utils = trpc.useUtils();
  const hoverTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ---- Handlers -----------------------------------------------------------
  const activateEmail = useCallback((email: string) => storeActivateEmail(email), [storeActivateEmail]);

  const handleRowHoverEnter = useCallback((email: string) => {
    if (activatedEmails.has(email) || hoverTimers.current.has(email)) return;
    const timer = setTimeout(() => {
      hoverTimers.current.delete(email);
      // Warm the DrillSheet profile panel's queries on hover so it opens
      // instantly instead of cold-loading on click (G4 perf): the full-user
      // snapshot (roles/modules), the activity panel, and the folder-access
      // panel. staleTimes match the panel's own useQuery calls for cache parity.
      utils.accDcGraph.bulkUser.prefetch({ email }, { staleTime: 5 * 60_000 }).catch(() => {});
      utils.users.getAccUserActivity.prefetch({ email }, { staleTime: 60_000 }).catch(() => {});
      utils.users.getAccUserFolderAccess.prefetch({ email }, { staleTime: 5 * 60_000 }).catch(() => {});
      // Activity side-panel path (existing behavior).
      utils.accActivity.getFileActivityForUser.prefetch({ email }, { staleTime: 5 * 60_000 }).catch(() => {});
      activateEmail(email);
    }, 250);
    hoverTimers.current.set(email, timer);
  }, [activatedEmails, utils, activateEmail]);

  const handleRowHoverLeave = useCallback((email: string) => {
    const timer = hoverTimers.current.get(email);
    if (timer) { clearTimeout(timer); hoverTimers.current.delete(email); }
  }, []);

  const openActivitySheet = useCallback((email: string) => {
    activateEmail(email); setActivityEmail(email);
  }, [activateEmail, setActivityEmail]);

  const scrollToTop = useCallback(() => { if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }, []);

  const handleStatusPillClick = useCallback((status: AggregatedStatus) => {
    setStatusFilter((prev) => prev.length === 1 && prev[0] === status ? [] : [status]);
    scrollToTop();
  }, [setStatusFilter, scrollToTop]);

  const handleAdminPillClick = useCallback(() => { setProjectAdminFilter((prev) => !prev); scrollToTop(); }, [setProjectAdminFilter, scrollToTop]);

  // ---- Activity-sort infinite query ---------------------------------------
  const sortInfiniteQuery = trpc.accActivity.usersOrderedByLastFileActivity.useInfiniteQuery(
    { order: activitySort.direction, limit: 200 },
    { enabled: activitySort.active, getNextPageParam: (p) => p.nextCursor ?? undefined, staleTime: 60_000 },
  );
  const sortPageCountRef = useRef(0);
  useEffect(() => {
    if (!activitySort.active) { sortPageCountRef.current = 0; return; }
    if (sortInfiniteQuery.isFetching || !sortInfiniteQuery.hasNextPage || sortPageCountRef.current >= 50) return;
    sortPageCountRef.current += 1;
    void sortInfiniteQuery.fetchNextPage();
  }, [activitySort.active, sortInfiniteQuery.isFetching, sortInfiniteQuery.hasNextPage, sortInfiniteQuery]);

  const orderedActivityEmails = useMemo<string[]>(() => {
    if (!activitySort.active) return [];
    return sortInfiniteQuery.data?.pages.flatMap((p) => p.rows.map((r) => r.email.toLowerCase())) ?? [];
  }, [activitySort.active, sortInfiniteQuery.data]);

  useEffect(() => {
    const timers = hoverTimers.current;
    return () => { for (const t of timers.values()) clearTimeout(t); timers.clear(); };
  }, []);

  // ---- Data hook ----------------------------------------------------------
  const {
    people, accSummaryMap, mergedAccUsers, noProjectsCount,
    usingFallbackDirectory, directoryBanner, isLoading, error,
    coverage, departments, jobTitles, costCenters, accProjects, accRoles, accModules,
    lastActivityByEmail,
  } = useUsersDirectoryData();

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(value), 150);
  }, [setSearch, setDebouncedSearch]);
  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  // ---- Derived rows (filtering / sorting) --------------------------------
  const { filtered, displayRows, hasActiveFilters } =
    useDirectoryRows({ people, accSummaryMap, orderedActivityEmails, activitySortActive: activitySort.active });

  useEffect(() => {
    if (!perfLoggingEnabled) return;
    const frame = requestAnimationFrame(() => {
      const mem = "memory" in performance ? (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory : undefined;
      console.debug("[UsersPerf]", { people: people.length, filtered: filtered.length, accUsers: mergedAccUsers.length, heapMB: mem?.usedJSHeapSize ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : null });
      performance.mark(`users-directory-render:${filtered.length}`);
    });
    return () => cancelAnimationFrame(frame);
  }, [filtered.length, mergedAccUsers.length, people.length, perfLoggingEnabled]);

  const stats = useMemo(() => ({ total: people.length, shown: filtered.length, depts: departments.length, costCenters: costCenters.length }), [people, filtered, departments, costCenters]);

  // ---- KPI derivations for header (no new fetch — in-memory only) ----------
  const ACTIVE_30D_MS = 30 * 24 * 60 * 60 * 1000;
  const kpiValues = useMemo(() => {
    const now = Date.now();
    let active30d = 0;
    let admins = 0;
    let inAcc = 0;
    let externals = 0;
    let internals = 0;
    for (const person of people) {
      const affiliation = classifyAffiliation(person.email);
      if (affiliation === "external") externals += 1;
      else if (affiliation === "internal") internals += 1;
      const accUser = accSummaryMap.get(person.email.toLowerCase());
      if (accUser) {
        if (accUser.found) inAcc += 1;
        // active30d: use lastActivityByEmail map (G1 fix) when available.
        // project.lastActivity is never populated by the /users feed (always null),
        // so falling back to it gives 0. While the map is still undefined this
        // counter stays at 0 and is DISCARDED below — reporting 0 as if it were
        // measured is a wrong operational number, and the tile animates it.
        if (lastActivityByEmail !== undefined) {
          const ts = lastActivityByEmail.get(person.email.toLowerCase());
          if (!!ts && now - new Date(ts).getTime() <= ACTIVE_30D_MS) active30d += 1;
        }
        // admins: project admin on any project or has adminCount > 0 or isAccountAdmin
        if (accUser.adminCount > 0 || accUser.projectAdmin === true || accUser.isAccountAdmin) {
          admins += 1;
        }
      }
    }
    return {
      totalUsers: people.length,
      inAcc,
      notInAcc: people.length - inAcc,
      internals,
      externals,
      // null = not measured yet. The activity map is a separate query; until it
      // lands there is no honest count, and "0" is a claim we cannot make.
      active30d: lastActivityByEmail === undefined ? null : active30d,
      admins,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, accSummaryMap, lastActivityByEmail]); // ACTIVE_30D_MS is a constant, no dep needed

  // ---- DataTable rows (pre-sorted/filtered list) -------------------------
  // Pass the full filtered+sorted list from useDirectoryRows — DataTable already
  // virtualizes via @tanstack/react-virtual so only visible rows hit the DOM.
  // G1 fix: pass lastActivityByEmail so rows show real "Last active" times.
  const rows = useMemo(
    () => buildDirectoryRows(displayRows, accSummaryMap, lastActivityByEmail),
    [displayRows, accSummaryMap, lastActivityByEmail],
  );

  // ---- Group-by banding (makes the Group-by select real) ------------------
  // Stable per-field lambdas so DataTable's displayItems memo doesn't rebuild
  // every render. "none" passes undefined — no bands, plain sorted list.
  const getGroupLabel = useMemo(() => {
    if (groupBy === "none") return undefined;
    return (r: DirectoryRow) => r[groupBy];
  }, [groupBy]);

  // ---- Retry handler for error state -------------------------------------
  const handleRetry = useCallback(() => {
    utils.users.getOrgDirectory.invalidate().catch(() => {});
    utils.accDcGraph.bulkUsers.invalidate().catch(() => {});
  }, [utils]);

  // ---- Layout -------------------------------------------------------------
  return (
    <TooltipProvider delayDuration={150}>
    <motion.div
      initial={safeFade.hidden}
      animate={safeFade.visible}
      className="mx-auto max-w-[1600px] p-6 space-y-4"
    >
      {/* Page header — KPI glass strip + particle accent (Plan 04-04) */}
      <UsersTableHeader
        totalUsers={kpiValues.totalUsers}
        inAcc={kpiValues.inAcc}
        notInAcc={kpiValues.notInAcc}
        internals={kpiValues.internals}
        externals={kpiValues.externals}
        active30d={kpiValues.active30d}
        admins={kpiValues.admins}
      />

      {/* Sub-header: counts + group-by control */}
      <div className="flex items-center justify-between shrink-0">
        <p className="text-xs text-muted-foreground">
          {isLoading ? "Loading..." : stats.shown === stats.total
            ? `${stats.total} ${usingFallbackDirectory ? "registered users" : "people"}`
            : `${stats.shown} of ${stats.total} ${usingFallbackDirectory ? "registered users" : "people"}`}
          {stats.depts > 0 && !isLoading && <span className="text-muted-foreground/50"> &middot; {stats.depts} departments</span>}
          {stats.costCenters > 0 && !isLoading && <span className="text-muted-foreground/50"> &middot; {stats.costCenters} cost centers</span>}
        </p>
        <div className="flex items-center gap-2">
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByField)}>
            <SelectTrigger className="h-8 w-[140px] text-xs bg-card border-border"><SelectValue placeholder="Group by..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              <SelectItem value="department">Department</SelectItem>
              <SelectItem value="jobTitle">Job Title</SelectItem>
              <SelectItem value="costCenter">Cost Center</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="shrink-0"><DataCoverageStrip coverage={coverage} /></div>

      <DirectoryFilterBar search={search} onSearchChange={handleSearchChange}
        departments={departments} jobTitles={jobTitles} costCenters={costCenters}
        accProjects={accProjects} accRoles={accRoles} accModules={accModules}
        noProjectsCount={noProjectsCount}
      />

      {!!error && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Couldn&apos;t load the directory</p>
            <p className="text-xs text-destructive/70 mt-0.5">Check your connection and try again.</p>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="flex items-center gap-1.5 shrink-0 text-xs font-medium text-destructive hover:text-destructive/80 transition-colors px-2 py-1 rounded border border-destructive/30 hover:bg-destructive/10"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}

      {directoryBanner && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <div><p className="font-medium">{directoryBanner.title}</p><p className="text-xs text-amber-400/70 mt-0.5">{directoryBanner.description}</p></div>
        </div>
      )}

      {isLoading && <UsersTableSkeleton />}

      {!isLoading && (
        <div className="flex-1 min-h-0 h-[calc(100vh-280px)]">
          <DataTable
            // Remount on sort-mode switch: activity sort is SERVER-ordered
            // (displayRows), so TanStack's internal name sort must be cleared
            // — otherwise it silently re-sorts the server order away.
            key={activitySort.active ? "activity-sort" : "client-sort"}
            data={rows}
            columns={USERS_COLUMNS as ColumnDef<DirectoryRow>[]}
            label="ACC users directory"
            getRowLabel={(r) => r.displayName || r.email}
            pinnedColumn="name"
            defaultSort={activitySort.active ? [] : [{ id: "name", desc: false }]}
            renderExpanded={(r) => (
              <PeekPanel
                row={r.original}
                onOpenProfile={() => setSelectedEmail(r.original.email)}
              />
            )}
            onRowClick={(r) => setSelectedEmail(r.original.email)}
            onRowHover={(r) => handleRowHoverEnter(r.original.email)}
            onRowHoverEnd={(r) => handleRowHoverLeave(r.original.email)}
            hasActiveFilter={hasActiveFilters || !!search}
            onClearFilters={clearAllFilters}
            filteredEmptyMessage="No one matches those filters"
            emptyMessage="No people found in your organization directory."
            getGroupLabel={getGroupLabel}
          />
        </div>
      )}

      {/* DrillSheet — replaces PersonDetailModal (no two-panel overlap) */}
      <DrillSheet open={!!selectedEmail} onClose={() => setSelectedEmail(null)}>
        {selectedEmail && (
          <UserProfilePanel
            person={people.find((p) => p.email.toLowerCase() === selectedEmail.toLowerCase()) ?? undefined}
            user={mergedAccUsers.find((u) => u.email.toLowerCase() === selectedEmail.toLowerCase()) ?? null}
            email={selectedEmail}
            variant="dialog"
          />
        )}
      </DrillSheet>

      {/* Activity-sort side panel (unchanged) */}
      <Sheet open={!!activityEmail} onOpenChange={(v) => { if (!v) setActivityEmail(null); }}>
        <SheetContent side="right" className="sm:max-w-lg">
          {activityEmail && <UserActivityBody email={activityEmail} users={mergedAccUsers} />}
        </SheetContent>
      </Sheet>
    </motion.div>
    </TooltipProvider>
  );
}
