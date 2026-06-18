"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/core/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, AlertCircle, LayoutGrid, List, UserCircle } from "lucide-react";
import { cn } from "@/lib/core/utils";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { type AggregatedStatus } from "@/lib/acc/accStatusReduction";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useShallow } from "zustand/shallow";
import type { OrgPerson, GroupByField } from "./directoryUtils";
import { useUsersDirectoryData } from "./useUsersDirectoryData";
import { PersonDetailModal } from "./PersonDetailModal";
import { PersonRowList } from "./PersonRowList";
import { useUsersDirectoryStore } from "./useUsersDirectoryStore";
import { DataCoverageStrip } from "./DataCoverageStrip";
import { CollapsibleGroup } from "./CollapsibleGroup";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DirectoryFilterBar } from "./DirectoryFilterBar";
import { PersonCard } from "./PersonCard";
import { DirectoryListHeader } from "./DirectoryListHeader";
import { useDirectoryRows } from "./useDirectoryRows";

// Re-export MODULE_BADGE_COLORS and ModuleBadge for backward-compat consumers.
export { MODULE_BADGE_COLORS, ModuleBadge } from "./ModuleBadge";

const UserActivityBody = dynamic<{ email: string; users: BulkAccUser[] }>(
  () => import("./dashboard/DashboardSidePanel").then((m) => m.UserActivityBody),
  { ssr: false, loading: () => <div className="h-80 rounded-xl bg-muted/20 animate-pulse" /> },
);

const DIRECTORY_RENDER_BATCH = 160;

const DirectorySkeleton = (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
    {Array.from({ length: 12 }).map((_, i) => (
      <div key={i} className="p-4 rounded-2xl border border-border bg-card animate-pulse">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-muted/50 shrink-0" />
          <div className="flex-1 space-y-2 pt-1"><div className="h-3 bg-muted/50 rounded w-3/4" /><div className="h-2.5 bg-muted/30 rounded w-1/2" /></div>
        </div>
        <div className="mt-3 space-y-1.5"><div className="h-2 bg-muted/20 rounded w-2/3" /><div className="h-2 bg-muted/20 rounded w-1/2" /></div>
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// UsersDirectoryClient — ~200-line orchestrator shell (USR-01 Wave 6)
// ---------------------------------------------------------------------------
export function UsersDirectoryClient() {
  // ---- Store state (batched reads via useShallow) -------------------------
  // Store state: values needed directly by shell (not delegated to useDirectoryRows)
  const { search, viewMode, groupBy, activitySort, selectedEmail, activityEmail, activatedEmails,
    debouncedSearch, filterDept, filterJobTitle, filterCostCenter, filterNoProjects,
    filterAccProject, filterAccRole, filterAccModule, statusFilter, projectAdminFilter,
  } = useUsersDirectoryStore(useShallow((s) => ({
    search: s.search, viewMode: s.viewMode, groupBy: s.groupBy, activitySort: s.activitySort,
    selectedEmail: s.selectedEmail, activityEmail: s.activityEmail, activatedEmails: s.activatedEmails,
    debouncedSearch: s.debouncedSearch, filterDept: s.filterDept, filterJobTitle: s.filterJobTitle,
    filterCostCenter: s.filterCostCenter, filterNoProjects: s.filterNoProjects,
    filterAccProject: s.filterAccProject, filterAccRole: s.filterAccRole, filterAccModule: s.filterAccModule,
    statusFilter: s.statusFilter, projectAdminFilter: s.projectAdminFilter,
  })));

  // ---- Store actions -------------------------------------------------------
  const {
    setSearch, setDebouncedSearch, setViewMode, setGroupBy,
    setStatusFilter, setProjectAdminFilter, setActivityEmail, setSelectedEmail,
    clearAllFilters, cycleActivitySort, activateEmail: storeActivateEmail,
  } = useUsersDirectoryStore(useShallow((s) => ({
    setSearch: s.setSearch, setDebouncedSearch: s.setDebouncedSearch, setViewMode: s.setViewMode, setGroupBy: s.setGroupBy,
    setStatusFilter: s.setStatusFilter, setProjectAdminFilter: s.setProjectAdminFilter,
    setActivityEmail: s.setActivityEmail, setSelectedEmail: s.setSelectedEmail,
    clearAllFilters: s.clearAllFilters, cycleActivitySort: s.cycleActivitySort, activateEmail: s.activateEmail,
  })));

  // ---- Shell-only state / refs --------------------------------------------
  const [directoryRenderLimit, setDirectoryRenderLimit] = useState(DIRECTORY_RENDER_BATCH);
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
  const handleActivitySortClick = useCallback(() => { cycleActivitySort(); scrollToTop(); }, [cycleActivitySort, scrollToTop]);

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
  } = useUsersDirectoryData();

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(value), 150);
  }, [setSearch, setDebouncedSearch]);
  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  // ---- Derived rows (filtering / sorting / grouping / windowing) ----------
  const { filtered, visibleFiltered, visibleGroups, renderedDirectoryCount, hasMoreDirectoryRows, hasActiveFilters } =
    useDirectoryRows({ people, accSummaryMap, orderedActivityEmails, activitySortActive: activitySort.active, directoryRenderLimit });

  // Reset render window on any filter/view change
  useEffect(() => { setDirectoryRenderLimit(DIRECTORY_RENDER_BATCH); }, [debouncedSearch, filterDept, filterJobTitle, filterCostCenter, filterNoProjects, filterAccProject, filterAccRole, filterAccModule, statusFilter, projectAdminFilter, groupBy, viewMode]);

  useEffect(() => {
    if (!perfLoggingEnabled) return;
    const frame = requestAnimationFrame(() => {
      const mem = "memory" in performance ? (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory : undefined;
      console.debug("[UsersPerf]", { people: people.length, filtered: filtered.length, renderedDirectoryCount, directoryRenderLimit, accUsers: mergedAccUsers.length, heapMB: mem?.usedJSHeapSize ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : null });
      performance.mark(`users-directory-render:${renderedDirectoryCount}`);
    });
    return () => cancelAnimationFrame(frame);
  }, [directoryRenderLimit, filtered.length, mergedAccUsers.length, people.length, perfLoggingEnabled, renderedDirectoryCount]);

  const stats = useMemo(() => ({ total: people.length, shown: filtered.length, depts: departments.length, costCenters: costCenters.length }), [people, filtered, departments, costCenters]);

  // ---- renderPeople -------------------------------------------------------
  function renderPeople(list: OrgPerson[]) {
    if (viewMode === "list") {
      return (
        <div className="space-y-1.5">
          <DirectoryListHeader
            activitySortActive={activitySort.active}
            activitySortDirection={activitySort.direction}
            activitySortFetching={sortInfiniteQuery.isFetching}
            onActivitySortClick={handleActivitySortClick}
          />
          <PersonRowList list={list} accSummaryMap={accSummaryMap} activatedEmails={activatedEmails}
            onPersonClick={(p) => setSelectedEmail(p.email)}
            onHoverEnter={handleRowHoverEnter} onHoverLeave={handleRowHoverLeave}
            onActivityCellClick={openActivitySheet}
            onStatusPillClick={handleStatusPillClick} onAdminPillClick={handleAdminPillClick}
          />
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {list.map((person) => (
          <PersonCard key={person.resourceName} person={person} accSummary={accSummaryMap.get(person.email)} onClick={() => setSelectedEmail(person.email)} />
        ))}
      </div>
    );
  }

  // ---- Layout -------------------------------------------------------------
  return (
    <TooltipProvider delayDuration={150}>
    <div className="mx-auto max-w-[1600px] p-6 space-y-4 animate-fade-up">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <Users size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Users</h1>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Loading..." : stats.shown === stats.total
                ? `${stats.total} ${usingFallbackDirectory ? "registered users" : "people"}`
                : `${stats.shown} of ${stats.total} ${usingFallbackDirectory ? "registered users" : "people"}`}
              {stats.depts > 0 && !isLoading && <span className="text-muted-foreground/50"> &middot; {stats.depts} departments</span>}
              {stats.costCenters > 0 && !isLoading && <span className="text-muted-foreground/50"> &middot; {stats.costCenters} cost centers</span>}
            </p>
          </div>
        </div>
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
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode("grid")} className={cn("p-1.5 transition-colors", viewMode === "grid" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}><LayoutGrid size={14} /></button>
            <button onClick={() => setViewMode("list")} className={cn("p-1.5 transition-colors", viewMode === "list" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}><List size={14} /></button>
          </div>
        </div>
      </div>

      <div className="shrink-0"><DataCoverageStrip coverage={coverage} /></div>

      <>
      <DirectoryFilterBar search={search} onSearchChange={handleSearchChange}
        departments={departments} jobTitles={jobTitles} costCenters={costCenters}
        accProjects={accProjects} accRoles={accRoles} accModules={accModules}
        noProjectsCount={noProjectsCount}
      />
      {error && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <div>
            <p className="font-medium">Could not load organization directory</p>
            <p className="text-xs text-amber-400/70 mt-0.5">Refresh the page and try again. If the problem persists, check the server logs.</p>
          </div>
        </div>
      )}
      {directoryBanner && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <div><p className="font-medium">{directoryBanner.title}</p><p className="text-xs text-amber-400/70 mt-0.5">{directoryBanner.description}</p></div>
        </div>
      )}
      {isLoading && DirectorySkeleton}
      {!isLoading && (
        <>
          {visibleGroups ? (
            <div className="space-y-6">
              {visibleGroups.map(([label, members]) => (
                <CollapsibleGroup key={label} label={label} count={members.length} defaultOpen={visibleGroups.length <= 8}>
                  {renderPeople(members)}
                </CollapsibleGroup>
              ))}
            </div>
          ) : renderPeople(visibleFiltered)}
          {hasMoreDirectoryRows && (
            <div className="flex items-center justify-center pt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setDirectoryRenderLimit((limit) => limit + DIRECTORY_RENDER_BATCH)}>
                Show {Math.min(DIRECTORY_RENDER_BATCH, filtered.length - renderedDirectoryCount).toLocaleString()} more
              </Button>
            </div>
          )}
          {filtered.length === 0 && !error && (
            <div className="text-center py-16 space-y-2">
              <UserCircle size={40} className="mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {search || hasActiveFilters ? "No people match your search or filters" : usingFallbackDirectory ? "No registered users found." : "No people found in your organization directory."}
              </p>
              {(search || hasActiveFilters) && <button onClick={clearAllFilters} className="text-xs text-primary hover:underline">Clear all filters</button>}
            </div>
          )}
        </>
      )}
      <PersonDetailModal
        person={selectedEmail ? people.find((p) => p.email.toLowerCase() === selectedEmail.toLowerCase()) ?? null : null}
        accUser={selectedEmail ? mergedAccUsers.find((u) => u.email.toLowerCase() === selectedEmail.toLowerCase()) ?? null : null}
        open={!!selectedEmail} onOpenChange={(v) => { if (!v) setSelectedEmail(null); }}
      />
      <Sheet open={!!activityEmail} onOpenChange={(v) => { if (!v) setActivityEmail(null); }}>
        <SheetContent side="right" className="sm:max-w-lg">
          {activityEmail && <UserActivityBody email={activityEmail} users={mergedAccUsers} />}
        </SheetContent>
      </Sheet>
      </>
    </div>
    </TooltipProvider>
  );
}
