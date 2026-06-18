"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/core/trpc";
import { Input } from "@/components/ui/input";
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
  Search,
  Users,
  Building2,
  Briefcase,
  Phone,
  AlertCircle,
  LayoutGrid,
  List,
  X,
  DollarSign,
  Filter,
  UserCircle,
  Activity,
  UserPlus,
  CheckCircle2,
  ShieldCheck,
  ArrowUp,
  ArrowDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/core/utils";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import {
  reduceMemberStatus,
  type AggregatedStatus,
} from "@/lib/acc/accStatusReduction";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ACC_SNAPSHOT_STALE_TIME_MS,
  mapFallbackDirectoryToOrgPeople,
  mergeAccSummaryWithEnrichment,
  mergePeopleWithAccSummary,
  selectAccSummarySource,
} from "./useMergedAccUsers";
import type { OrgPerson, LocalDirectoryUser, GroupByField, ViewMode } from "./directoryUtils";
import { normalize, uniqueSorted, parseSearchTokens, matchesPerson } from "./directoryUtils";
import { PersonDetailModal, PersonAvatar } from "./PersonDetailModal";
import { STATUS_PILL_LABEL, StatusPill, AdminPill, AccBadge } from "./DirectoryPills";
import { PersonRowList } from "./PersonRowList";
import { useUsersDirectoryStore } from "./useUsersDirectoryStore";
import { DataCoverageStrip } from "./DataCoverageStrip";
import { CollapsibleGroup } from "./CollapsibleGroup";
import { countGroupedItems, limitGroupedItems } from "./directoryRenderWindow";
import { moduleLabel } from "@/lib/acc/modules";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";

const UserActivityBody = dynamic<{ email: string; users: BulkAccUser[] }>(
  () => import("./dashboard/DashboardSidePanel").then((m) => m.UserActivityBody),
  { ssr: false, loading: () => <div className="h-80 rounded-xl bg-muted/20 animate-pulse" /> },
);

const DIRECTORY_RENDER_BATCH = 160;

// Types and helpers moved to ./directoryUtils (USR-01 decomposition, Wave 2).
// OrgPerson, LocalDirectoryUser, GroupByField, ViewMode, normalize,
// uniqueSorted, parseSearchTokens, matchesPerson are imported above.

// ---------------------------------------------------------------------------
// File-activity column helpers + PersonRow + both activity cells moved to
// ./PersonRow (USR-01 decomposition, Wave 3).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Module badge (Phase 08-07 / DC8-16)
// NOTE: FileActivityCell, LastFileActivityCell, PersonRow moved to ./PersonRow
// ---------------------------------------------------------------------------
//
// Every File Activity row carries `service` once Phase 8 ingest has run (one
// of the 9 KNOWN_MODULES from lib/acc/dcActivityCsvIngest.ts). The badge is a
// tiny inline chip rendered at the start of each activity row so the user can
// see at a glance which ACC module produced the event (Docs / Issues / RFIs /
// etc.) without reading the action label.
//
// Color hint mirrors the 6-step tier ramp from Phase 4 06 — distinct hue per
// module, low-saturation backgrounds with high-contrast text.
//
// Exported for reuse by DashboardSidePanel.UserActivityBody (the actual row
// rendering site).
export const MODULE_BADGE_COLORS: Record<string, string> = {
  docs: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  issues: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  submittals: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  rfis: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  sheets: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
  admin: "bg-muted text-foreground/80",
  cost: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
  assets: "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
  bridge: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
};

export function ModuleBadge({ service }: { service: string | null | undefined }) {
  if (!service) return null;
  // Lookup keyed by row.service (DC8-16) — falls back to neutral slate for
  // any future / unmapped module name so we never crash on novel surfaces.
  const className =
    MODULE_BADGE_COLORS[service.toLowerCase()] ?? "bg-muted text-foreground/80";
  return (
    <span
      className={cn(
        "inline-block px-1.5 py-0.5 text-[10px] font-medium rounded uppercase tracking-wide shrink-0",
        className
      )}
      title={`Source module: ${service}`}
    >
      {service}
    </span>
  );
}

// FileActivityCell moved to ./PersonRow (USR-01 decomposition, Wave 3).

// LastFileActivityCell moved to ./PersonRow (USR-01 decomposition, Wave 3).

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
// PersonAvatar, CopyButton, InfoRow, PersonDetailModal moved to
// ./PersonDetailModal (USR-01 decomposition, Wave 2).

// ---------------------------------------------------------------------------
// Phase 09 LIST-01 / LIST-02 — Status + Admin pills
// ---------------------------------------------------------------------------
// STATUS_PILL_LABEL, STATUS_PILL_CLASS, StatusPill, AdminPill, AccBadge moved
// to ./DirectoryPills (USR-01 decomposition, Wave 2).

// PersonRow + FileActivityCell + LastFileActivityCell moved to
// ./PersonRow (USR-01 decomposition, Wave 3).

function PersonCard({
  person,
  accSummary,
  onClick,
}: {
  person: OrgPerson;
  accSummary?: BulkAccUser;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left p-4 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start gap-3">
        <PersonAvatar person={person} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate leading-tight">
            {person.displayName}
          </p>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {person.email}
          </p>
        </div>
      </div>

      <div className="mt-2.5 space-y-1">
        {person.department && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Building2 size={10} className="shrink-0" />
            <span className="truncate">{person.department}</span>
          </div>
        )}
        {person.jobTitle && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Briefcase size={10} className="shrink-0" />
            <span className="truncate">{person.jobTitle}</span>
          </div>
        )}
        {person.costCenter && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <DollarSign size={10} className="shrink-0" />
            <span className="truncate">{person.costCenter}</span>
          </div>
        )}
        {person.phoneNumber && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Phone size={10} className="shrink-0" />
            <span className="truncate">{person.phoneNumber}</span>
          </div>
        )}
      </div>

      {/* ACC badge */}
      <div className="mt-2.5">
        <AccBadge summary={accSummary} />
      </div>
    </button>
  );
}

// PersonRow moved to ./PersonRow (USR-01 decomposition, Wave 3).

// PersonRowList moved to ./PersonRowList (USR-01 decomposition, Wave 3).

// CollapsibleGroup moved to ./CollapsibleGroup (USR-01 decomposition, Wave 2).

function ActiveFilterPill({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full pl-2.5 pr-1.5 py-0.5">
      <span className="font-medium">{label}:</span>
      <span className="truncate max-w-[120px]">{value}</span>
      <button
        onClick={onClear}
        className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
      >
        <X size={10} />
      </button>
    </span>
  );
}

// CoveragePill, DataCoverageStrip moved to ./DataCoverageStrip (USR-01 decomposition, Wave 2).

function ActivityAuditPanel({
  users,
  invitations,
  invitationsLoading,
  selectedEmail,
  onSelectEmail,
}: {
  users: BulkAccUser[];
  invitations: Array<{
    inviteeEmail: string | null;
    inviteeName: string | null;
    primary: {
      createdAt: Date | string;
      inviterName: string | null;
      inviterEmail: string | null;
      inviteeEmail: string | null;
    };
    others: unknown[];
  }>;
  invitationsLoading: boolean;
  selectedEmail: string | null;
  onSelectEmail: (email: string) => void;
}) {
  const [query, setQuery] = useState("");
  const searchableUsers = useMemo(() => {
    const q = normalize(query);
    return users
      .filter((user) => user.found)
      .filter((user) => {
        if (!q) return true;
        return normalize(`${user.name ?? ""} ${user.email}`).includes(q);
      })
      .slice(0, 80);
  }, [users, query]);

  const recentUsers = useMemo(
    () => users
      .filter((user) => user.addedOn)
      .sort((a, b) => String(b.addedOn).localeCompare(String(a.addedOn)))
      .slice(0, 12),
    [users],
  );

  const activeEmail = selectedEmail ?? searchableUsers[0]?.email ?? recentUsers[0]?.email ?? null;

  return (
    <div className="grid min-h-[620px] grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity size={15} className="text-primary" />
            <h2 className="text-sm font-semibold">Activity Audit</h2>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Find a user"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
            {searchableUsers.map((user) => (
              <button
                key={user.email}
                onClick={() => onSelectEmail(user.email)}
                className={cn(
                  "w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                  activeEmail === user.email ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <p className="truncate text-xs font-semibold">{user.name || user.email}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <UserPlus size={15} className="text-primary" />
            <h2 className="text-sm font-semibold">Who Added Whom</h2>
          </div>
          {invitationsLoading ? (
            <p className="text-xs text-muted-foreground">Loading invitations...</p>
          ) : invitations.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent invitation activity found.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {invitations.slice(0, 20).map((item) => {
                const created = item.primary.createdAt instanceof Date
                  ? item.primary.createdAt
                  : new Date(item.primary.createdAt);
                const invitee = item.inviteeName || item.inviteeEmail || "Unknown invitee";
                const inviter = item.primary.inviterName || item.primary.inviterEmail || "Unknown inviter";
                return (
                  <div key={`${item.primary.inviteeEmail ?? invitee}:${created.toISOString()}`} className="rounded-lg bg-muted/40 p-2">
                    <p className="text-xs font-medium">{invitee}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Added by {inviter} · {formatDistanceToNowStrict(created, { addSuffix: true })}
                      {item.others.length > 0 ? ` · +${item.others.length} others` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {recentUsers.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Recently Added</h2>
            <div className="space-y-1">
              {recentUsers.map((user) => (
                <button
                  key={user.email}
                  onClick={() => onSelectEmail(user.email)}
                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                >
                  <p className="truncate text-xs font-medium">{user.name || user.email}</p>
                  <p className="text-[11px] text-muted-foreground">{String(user.addedOn).slice(0, 10)}</p>
                </button>
              ))}
            </div>
          </section>
        )}
      </aside>

      <section className="min-h-0 rounded-xl border border-border bg-card">
        {activeEmail ? (
          <UserActivityBody email={activeEmail} users={users} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            Select a user to inspect activity.
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function UsersDirectoryClient() {
  // ---------------------------------------------------------------------------
  // Store: filter / search / sort / viewMode / selection state (USR-01 Wave 4)
  // ---------------------------------------------------------------------------
  const search = useUsersDirectoryStore((s) => s.search);
  const debouncedSearch = useUsersDirectoryStore((s) => s.debouncedSearch);
  const viewMode = useUsersDirectoryStore((s) => s.viewMode);
  const groupBy = useUsersDirectoryStore((s) => s.groupBy);
  const filterDept = useUsersDirectoryStore((s) => s.filterDept);
  const filterJobTitle = useUsersDirectoryStore((s) => s.filterJobTitle);
  const filterCostCenter = useUsersDirectoryStore((s) => s.filterCostCenter);
  const filterNoProjects = useUsersDirectoryStore((s) => s.filterNoProjects);
  const filterAccProject = useUsersDirectoryStore((s) => s.filterAccProject);
  const filterAccRole = useUsersDirectoryStore((s) => s.filterAccRole);
  const filterAccModule = useUsersDirectoryStore((s) => s.filterAccModule);
  const filterAccModuleTier = useUsersDirectoryStore((s) => s.filterAccModuleTier);
  const statusFilter = useUsersDirectoryStore((s) => s.statusFilter);
  const projectAdminFilter = useUsersDirectoryStore((s) => s.projectAdminFilter);
  const activitySort = useUsersDirectoryStore((s) => s.activitySort);
  const selectedEmail = useUsersDirectoryStore((s) => s.selectedEmail);
  const activityEmail = useUsersDirectoryStore((s) => s.activityEmail);
  const activatedEmails = useUsersDirectoryStore((s) => s.activatedEmails);

  // Store actions
  const setSearch = useUsersDirectoryStore((s) => s.setSearch);
  const setDebouncedSearch = useUsersDirectoryStore((s) => s.setDebouncedSearch);
  const setViewMode = useUsersDirectoryStore((s) => s.setViewMode);
  const setGroupBy = useUsersDirectoryStore((s) => s.setGroupBy);
  const setFilterDept = useUsersDirectoryStore((s) => s.setFilterDept);
  const setFilterJobTitle = useUsersDirectoryStore((s) => s.setFilterJobTitle);
  const setFilterCostCenter = useUsersDirectoryStore((s) => s.setFilterCostCenter);
  const setFilterNoProjects = useUsersDirectoryStore((s) => s.setFilterNoProjects);
  const setFilterAccProject = useUsersDirectoryStore((s) => s.setFilterAccProject);
  const setFilterAccRole = useUsersDirectoryStore((s) => s.setFilterAccRole);
  const setFilterAccModule = useUsersDirectoryStore((s) => s.setFilterAccModule);
  const setFilterAccModuleTier = useUsersDirectoryStore((s) => s.setFilterAccModuleTier);
  const setStatusFilter = useUsersDirectoryStore((s) => s.setStatusFilter);
  const setProjectAdminFilter = useUsersDirectoryStore((s) => s.setProjectAdminFilter);
  const setActivityEmail = useUsersDirectoryStore((s) => s.setActivityEmail);
  const setSelectedEmail = useUsersDirectoryStore((s) => s.setSelectedEmail);
  const clearAllFilters = useUsersDirectoryStore((s) => s.clearAllFilters);
  const cycleActivitySort = useUsersDirectoryStore((s) => s.cycleActivitySort);
  const storeActivateEmail = useUsersDirectoryStore((s) => s.activateEmail);
  const applyModuleFilterFromSidePanel = useUsersDirectoryStore(
    (s) => s.applyModuleFilterFromSidePanel,
  );

  // ---------------------------------------------------------------------------
  // Shell-only state: directoryRenderLimit + perfLoggingEnabled stay as useState
  // (not serializable store candidates; perf flag is read once at mount)
  // ---------------------------------------------------------------------------
  const [directoryRenderLimit, setDirectoryRenderLimit] = useState(DIRECTORY_RENDER_BATCH);
  const [perfLoggingEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.has("usersPerf") || localStorage.getItem("users-perf") === "1";
  });

  // ---------------------------------------------------------------------------
  // Shell-only refs / tRPC utils / hover-prefetch (MUST NOT move to store)
  // ---------------------------------------------------------------------------
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ACTV-03: per-row hover-prefetch state. activatedEmails lives in the store
  // for sharing, but trpc.useUtils() MUST stay in the shell (React hook).
  const utils = trpc.useUtils();
  const hoverTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const activateEmail = useCallback((email: string) => {
    storeActivateEmail(email);
  }, [storeActivateEmail]);

  const handleRowHoverEnter = useCallback(
    (email: string) => {
      // Already active? Skip — no double prefetch.
      if (activatedEmails.has(email)) return;
      // Existing timer? Skip — debounce already in flight.
      if (hoverTimers.current.has(email)) return;
      const timer = setTimeout(() => {
        hoverTimers.current.delete(email);
        utils.accActivity.getFileActivityForUser
          .prefetch({ email }, { staleTime: 5 * 60_000 })
          .catch(() => {
            // Silent — query.error will surface in the side panel if needed.
          });
        activateEmail(email);
      }, 250);
      hoverTimers.current.set(email, timer);
    },
    [activatedEmails, utils, activateEmail],
  );

  const handleRowHoverLeave = useCallback((email: string) => {
    const timer = hoverTimers.current.get(email);
    if (timer) {
      clearTimeout(timer);
      hoverTimers.current.delete(email);
    }
  }, []);

  const openActivitySheet = useCallback(
    (email: string) => {
      activateEmail(email); // also flips the cell from "—" to populated
      setActivityEmail(email);
    },
    [activateEmail, setActivityEmail],
  );

  // Phase 09 LIST-01 / LIST-02 — pill click handlers (Task 3).
  //
  // Status pill: replace selection — clicking a single status sets the filter
  // to ONLY that status; clicking the same pill again clears the status
  // filter entirely. Facet-reduction IS the spotlight (CONTEXT lock).
  //
  // Admin pill: toggle the projectAdmin binary facet on/off (CONTEXT
  // discretion recommendation).
  //
  // Both handlers scroll the (window-virtualized) directory list back to
  // the top so the user sees the reduced result set from row 0.
  const scrollDirectoryToTop = useCallback(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);
  const handleStatusPillClick = useCallback(
    (status: AggregatedStatus) => {
      setStatusFilter((prev) =>
        prev.length === 1 && prev[0] === status ? [] : [status],
      );
      scrollDirectoryToTop();
    },
    [setStatusFilter, scrollDirectoryToTop],
  );
  const handleAdminPillClick = useCallback(() => {
    setProjectAdminFilter((prev) => !prev);
    scrollDirectoryToTop();
  }, [setProjectAdminFilter, scrollDirectoryToTop]);

  // Phase 09-04 LIST-03 (sort path): three-state header click cycle.
  // off -> desc -> asc -> off. Decoupled from display-path batch query.
  // Delegates the cycle logic to cycleActivitySort in the store; shell still
  // owns the scrollDirectoryToTop side-effect.
  const handleActivitySortClick = useCallback(() => {
    cycleActivitySort();
    scrollDirectoryToTop();
  }, [cycleActivitySort, scrollDirectoryToTop]);

  // Phase 09-04 LIST-03 (sort path): paginated server-side sort. KEPT
  // INTENTIONALLY SEPARATE from the batch display query (Pitfall 6 — sharing
  // would double server load on every sort toggle).
  const sortInfiniteQuery =
    trpc.accActivity.usersOrderedByLastFileActivity.useInfiniteQuery(
      { order: activitySort.direction, limit: 200 },
      {
        enabled: activitySort.active,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        staleTime: 60_000,
      },
    );

  // Auto-fetch all pages while sort is active. Defensive cap: 50 pages
  // (200 * 50 = 10k users) — directory user count is far below this in
  // practice but the ceiling prevents runaway recursion on a bad cursor.
  const sortPageCountRef = useRef(0);
  useEffect(() => {
    if (!activitySort.active) {
      sortPageCountRef.current = 0;
      return;
    }
    if (sortInfiniteQuery.isFetching) return;
    if (!sortInfiniteQuery.hasNextPage) return;
    if (sortPageCountRef.current >= 50) return;
    sortPageCountRef.current += 1;
    void sortInfiniteQuery.fetchNextPage();
  }, [
    activitySort.active,
    sortInfiniteQuery.isFetching,
    sortInfiniteQuery.hasNextPage,
    sortInfiniteQuery,
  ]);

  const orderedActivityEmails = useMemo<string[]>(() => {
    if (!activitySort.active) return [];
    return (
      sortInfiniteQuery.data?.pages.flatMap((p) =>
        p.rows.map((r) => r.email.toLowerCase()),
      ) ?? []
    );
  }, [activitySort.active, sortInfiniteQuery.data]);

  // Cleanup all hover timers on unmount
  useEffect(() => {
    const timers = hoverTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // Primary user snapshot (DC). Drives the directory rows, badges, filters and
  // the ACC Analysis panel. bulkAccSummary below is only a fallback for when
  // this is empty.
  //
  // leanProjects: the directory + its filters never read per-project
  // roles[]/modules[] (role/module filters use the top-level allRoles/allModules),
  // so we request the variant that empties them — trimming ~15 MB from the
  // dehydrated page payload. The input MUST match the prefetch + prewarm key.
  const { data: dcUsersRaw = [], isLoading: dcLoading } = trpc.accDcGraph.bulkUsers.useQuery(
    { leanProjects: true },
    {
      staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
      retry: false,
    },
  );
  // Fallback ACC summary (~7 MB) — consumed only when the DC snapshot is empty
  // (selectAccSummarySource prefers dcUsersRaw). Gated so it never loads while DC
  // data is present, which is always in production; this keeps it out of both the
  // dehydrated page payload and the post-mount fetch path.
  const { data: accSummaryRaw = [] } = trpc.users.bulkAccSummary.useQuery(undefined, {
    staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
    retry: false,
    enabled: !dcLoading && dcUsersRaw.length === 0,
  });
  const { data: enrichedUsers = [], isLoading: enrichedLoading } = trpc.accMembers.enrichedUsers.useQuery(undefined, {
    staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
    retry: false,
  });
  const invitationsQuery = trpc.accActivity.listInvitations.useQuery(
    { windowDays: 90, limit: 100 },
    { staleTime: 300_000, retry: false, enabled: false },
  );
  const activityCoverageQuery = trpc.accActivity.getCoverage.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });
  const folderCoverageQuery = trpc.accFolders.getCoverage.useQuery(undefined, {
    staleTime: 600_000,
    retry: false,
  });
  const accSource = useMemo(
    () => selectAccSummarySource(dcUsersRaw as BulkAccUser[], accSummaryRaw as BulkAccUser[]),
    [dcUsersRaw, accSummaryRaw],
  );
  const accSummary = useMemo<BulkAccUser[]>(() => {
    return mergeAccSummaryWithEnrichment(accSource, enrichedUsers);
  }, [accSource, enrichedUsers]);

  const {
    data: directoryData,
    isLoading: isDirectoryLoading,
    error,
  } = trpc.users.getOrgDirectory.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });

  const {
    data: fallbackDirectory = [],
    isLoading: isFallbackLoading,
  } = trpc.users.getDirectory.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });

  const people = useMemo<OrgPerson[]>(() => {
    if (directoryData?.status === "ok") {
      return directoryData.people ?? [];
    }

    return mapFallbackDirectoryToOrgPeople(fallbackDirectory as LocalDirectoryUser[]);
  }, [directoryData, fallbackDirectory]);

  const isLoading = !people.length && isDirectoryLoading && isFallbackLoading;

  // Map of email -> BulkAccUser for O(1) lookup in render
  const accSummaryMap = useMemo<Map<string, BulkAccUser>>(() => {
    const map = new Map<string, BulkAccUser>();
    for (const item of accSummary) {
      map.set(item.email, item);
    }
    return map;
  }, [accSummary]);

  // All 1197 directory people merged with ACC cache data — unregistered people get found:false stubs
  const mergedAccUsers = useMemo<BulkAccUser[]>(() => {
    const byEmail = new Map<string, BulkAccUser>();
    for (const u of accSummary) byEmail.set(u.email.toLowerCase(), u);
    return people.map((p) => byEmail.get(p.email.toLowerCase()) ?? {
      email: p.email,
      name: p.displayName,
      found: false,
      projectCount: 0,
      activeCount: 0,
      adminCount: 0,
      hasNoProjects: true,
      syncedAt: "",
      allRoles: [],
      allModules: [],
      projects: [],
      isAccountAdmin: false,
      addedOn: null,
    });
  }, [people, accSummary]);

  // Count of people in the directory who have hasNoProjects === true
  const noProjectsCount = useMemo(
    () => people.filter((p) => accSummaryMap.get(p.email)?.hasNoProjects === true).length,
    [people, accSummaryMap]
  );

  const usingFallbackDirectory =
    !error && (directoryData?.status !== "ok" || (isDirectoryLoading && fallbackDirectory.length > 0));

  const directoryBanner = useMemo(() => {
    if (error || directoryData?.status === "ok") {
      return null;
    }

    if (isDirectoryLoading && fallbackDirectory.length > 0) {
      return {
        title: "Loading organization directory",
        description:
          "Google directory is still loading. Showing registered app users for now.",
      };
    }

    if (directoryData?.status === "not_linked") {
      return {
        title: "Google directory not linked",
        description:
          "Google is not linked for organization lookup. Showing registered app users only.",
      };
    }

    return {
      title: "Organization directory unavailable",
      description: `${
        directoryData?.message ?? "Reconnect your Google account to restore Directory access."
      } Showing registered app users only.`,
    };
  }, [directoryData, error, fallbackDirectory.length, isDirectoryLoading]);

  // Debounced search for real-time feel without excessive re-renders.
  // The debounce timer (ref) and this handler stay in the shell;
  // setSearch / setDebouncedSearch are store actions.
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(value), 150);
  }, [setSearch, setDebouncedSearch]);

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  // Derived data
  const departments = useMemo(() => uniqueSorted(people.map((p) => p.department)), [people]);
  const jobTitles = useMemo(() => uniqueSorted(people.map((p) => p.jobTitle)), [people]);
  const costCenters = useMemo(() => uniqueSorted(people.map((p) => p.costCenter)), [people]);

  const accProjects = useMemo(() => {
    const set = new Set<string>();
    for (const u of accSummary) {
      for (const p of u.projects) set.add(p.name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accSummary]);

  const accRoles = useMemo(() => {
    const set = new Set<string>();
    for (const u of accSummary) {
      for (const r of u.allRoles) set.add(r);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accSummary]);

  const accModules = useMemo(() => {
    const set = new Set<string>();
    for (const u of accSummary) {
      for (const m of u.allModules) set.add(m);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accSummary]);

  const coverage = useMemo(() => {
    const hasProjectMembers = accSummary.some((user) => user.found);
    const hasRoles = accSummary.some((user) => (user.allRoles?.length ?? 0) > 0);
    const hasLastSignIn = accSummary.some((user) => !!user.lastSignIn);
    const activityRows = activityCoverageQuery.data?.totalRows ?? 0;
    const attributedActivityRows = activityCoverageQuery.data?.attributedRows ?? 0;
    const attributionRate = activityCoverageQuery.data?.attributionRate ?? (
      activityRows > 0 ? attributedActivityRows / activityRows : 0
    );
    const unattributedActivityRows = activityCoverageQuery.data?.unattributedRows ?? Math.max(0, activityRows - attributedActivityRows);
    const folderCount = folderCoverageQuery.data?.folderCount ?? 0;
    const permissionCount = folderCoverageQuery.data?.permissionCount ?? 0;
    const hasRecentAdditions =
      accSummary.some((user) => !!user.addedOn) ||
      (invitationsQuery.data?.invitations.length ?? 0) > 0;
    return [
      { label: "Project Members", available: hasProjectMembers, loading: !accSource.length && isLoading },
      { label: "Roles", available: hasRoles, loading: enrichedLoading },
      { label: "Last Sign-In", available: hasLastSignIn, loading: !accSource.length && isLoading },
      {
        label: "Activity Logs",
        available: activityRows > 0,
        loading: activityCoverageQuery.isLoading,
        detail: `${activityRows.toLocaleString()} activity rows, ${Math.round(attributionRate * 100)}% attributed, ${unattributedActivityRows.toLocaleString()} classified residuals`,
      },
      {
        label: "Folder Permissions",
        available: permissionCount > 0,
        loading: folderCoverageQuery.isLoading,
        detail: `${permissionCount.toLocaleString()} permission rows across ${folderCount.toLocaleString()} folders`,
      },
      { label: "Recent Additions", available: hasRecentAdditions, loading: invitationsQuery.isLoading },
    ];
  }, [
    activityCoverageQuery.data,
    activityCoverageQuery.isLoading,
    accSummary,
    accSource.length,
    enrichedLoading,
    folderCoverageQuery.data,
    folderCoverageQuery.isLoading,
    invitationsQuery.data,
    invitationsQuery.isLoading,
    isLoading,
  ]);

  const hasActiveFilters = !!(
    filterDept || filterJobTitle || filterCostCenter || filterNoProjects ||
    filterAccProject || filterAccRole || filterAccModule ||
    statusFilter.length > 0 || projectAdminFilter
  );

  // Filter + search
  const filtered = useMemo(() => {
    const { fieldFilters, freeText } = parseSearchTokens(debouncedSearch);

    return people.filter((p) => {
      // Dropdown filters
      if (filterDept && p.department !== filterDept) return false;
      if (filterJobTitle && p.jobTitle !== filterJobTitle) return false;
      if (filterCostCenter && p.costCenter !== filterCostCenter) return false;
      // ACC "No Projects" filter — only show users with cache entry AND hasNoProjects true
      if (filterNoProjects) {
        const summary = accSummaryMap.get(p.email);
        if (!summary || !summary.hasNoProjects) return false;
      }
      // ACC filters
      if (filterAccProject || filterAccRole || filterAccModule) {
        const summary = accSummaryMap.get(p.email);
        if (!summary) return false;
        if (filterAccProject && !summary.projects?.some((proj) => proj.name === filterAccProject)) return false;
        if (filterAccRole && !summary.allRoles?.includes(filterAccRole)) return false;
        if (filterAccModule && !summary.allModules?.includes(filterAccModule)) return false;
      }

      // Phase 09 LIST-01: status multi-select facet
      if (statusFilter.length > 0) {
        const summary = accSummaryMap.get(p.email);
        const rowStatus: AggregatedStatus =
          summary?.aggregatedStatus ??
          reduceMemberStatus(summary?.projects?.map((proj) => proj.status) ?? []);
        if (!statusFilter.includes(rowStatus)) return false;
      }

      // Phase 09 LIST-02: project-admin binary facet
      if (projectAdminFilter) {
        const summary = accSummaryMap.get(p.email);
        if (summary?.projectAdmin !== true) return false;
      }

      // Search bar (free text + field scoped)
      return matchesPerson(p, freeText, fieldFilters);
    });
  }, [
    people, debouncedSearch, filterDept, filterJobTitle, filterCostCenter,
    filterNoProjects, filterAccProject, filterAccRole, filterAccModule,
    statusFilter, projectAdminFilter, accSummaryMap
  ]);

  // Phase 09-04 LIST-03 (sort path): reorder rows by server-supplied sequence.
  // Users with no file activity at all (not present in orderedActivityEmails)
  // are appended alphabetically by email — RESEARCH Open Q3 / CONTEXT lock
  // "empty rows always last regardless of asc/desc".
  const displayRows = useMemo<OrgPerson[]>(() => {
    if (!activitySort.active) return filtered;
    const orderMap = new Map<string, number>();
    orderedActivityEmails.forEach((e, i) => orderMap.set(e, i));
    const inSort: OrgPerson[] = [];
    const remainder: OrgPerson[] = [];
    for (const row of filtered) {
      if (orderMap.has(row.email.toLowerCase())) inSort.push(row);
      else remainder.push(row);
    }
    inSort.sort(
      (a, b) =>
        (orderMap.get(a.email.toLowerCase()) ?? 0) -
        (orderMap.get(b.email.toLowerCase()) ?? 0),
    );
    remainder.sort((a, b) => a.email.localeCompare(b.email));
    return [...inSort, ...remainder];
  }, [activitySort.active, orderedActivityEmails, filtered]);

  // Grouped data
  const groups = useMemo(() => {
    if (groupBy === "none") return null;

    const map = new Map<string, OrgPerson[]>();
    for (const person of displayRows) {
      const key = (person[groupBy] as string | null) || "Not specified";
      const arr = map.get(key) ?? [];
      arr.push(person);
      map.set(key, arr);
    }

    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "Not specified") return 1;
      if (b === "Not specified") return -1;
      return a.localeCompare(b);
    });
  }, [displayRows, groupBy]);

  useEffect(() => {
    setDirectoryRenderLimit(DIRECTORY_RENDER_BATCH);
  }, [
    debouncedSearch,
    filterDept,
    filterJobTitle,
    filterCostCenter,
    filterNoProjects,
    filterAccProject,
    filterAccRole,
    filterAccModule,
    statusFilter,
    projectAdminFilter,
    groupBy,
    viewMode,
  ]);

  const visibleFiltered = useMemo(
    () => displayRows.slice(0, directoryRenderLimit),
    [displayRows, directoryRenderLimit],
  );

  const visibleGroups = useMemo(
    () => groups ? limitGroupedItems(groups, directoryRenderLimit) : null,
    [groups, directoryRenderLimit],
  );

  const renderedDirectoryCount = visibleGroups ? countGroupedItems(visibleGroups) : visibleFiltered.length;
  const hasMoreDirectoryRows = renderedDirectoryCount < filtered.length;

  useEffect(() => {
    if (!perfLoggingEnabled) return;
    const frame = requestAnimationFrame(() => {
      const memory = "memory" in performance
        ? (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
        : undefined;
      console.debug("[UsersPerf]", {
        people: people.length,
        filtered: filtered.length,
        renderedDirectoryCount,
        directoryRenderLimit,
        accUsers: mergedAccUsers.length,
        heapMB: memory?.usedJSHeapSize ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : null,
      });
      performance.mark(`users-directory-render:${renderedDirectoryCount}`);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    directoryRenderLimit,
    filtered.length,
    mergedAccUsers.length,
    people.length,
    perfLoggingEnabled,
    renderedDirectoryCount,
  ]);

  // Stats
  const stats = useMemo(() => ({
    total: people.length,
    shown: filtered.length,
    depts: departments.length,
    costCenters: costCenters.length,
  }), [people, filtered, departments, costCenters]);

  // clearAllFilters and handleApplyModuleFilterFromSidePanel delegate to the
  // store's composite actions (USR-01 Wave 4). The store's clearAllFilters also
  // resets search + debouncedSearch (matching the monolith's behaviour where
  // clearAllFilters called handleSearchChange("")).

  // LIST-04: side-panel Module Access click-through → narrow the directory by module.
  // Tier is captured as informational chip metadata (per-tier predicate not feasible without
  // per-project tier on the row; documented trade-off in 09-03 SUMMARY).
  const handleApplyModuleFilterFromSidePanel = useCallback(
    (moduleKey: string, tier: string) => {
      applyModuleFilterFromSidePanel(moduleKey, tier);
      // Side panel stays open intentionally so the user can see the directory facet take effect
      // behind it. Closing it would obscure the cause-and-effect signal.
    },
    [applyModuleFilterFromSidePanel],
  );

  function renderPeople(list: OrgPerson[]) {
    if (viewMode === "list") {
      return (
        <div className="space-y-1.5">
          {/* Two-row grouped header — top row spans "File Activity" across 4 sub-columns */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_0.8fr_2.8fr_1fr_auto] gap-3 px-4 pt-2 pl-[68px] text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              <span>Name</span>
              <span>Department</span>
              <span>Job Title</span>
              <span>Cost Center</span>
              <span>Phone</span>
              <span>Status</span>
              <span className="text-center border-b border-border/30 pb-0.5">
                File Activity
              </span>
              <button
                type="button"
                onClick={handleActivitySortClick}
                aria-label={
                  "Sort by last file activity, " +
                  (activitySort.active ? activitySort.direction : "inactive")
                }
                className={cn(
                  "inline-flex items-center gap-1 text-left uppercase tracking-wider font-medium transition-colors hover:text-foreground",
                  activitySort.active && "text-foreground",
                )}
              >
                Last File Activity
                {activitySort.active && activitySort.direction === "desc" && (
                  <ArrowDown size={11} aria-hidden />
                )}
                {activitySort.active && activitySort.direction === "asc" && (
                  <ArrowUp size={11} aria-hidden />
                )}
                {activitySort.active && sortInfiniteQuery.isFetching && (
                  <Loader2
                    className="size-3 animate-spin shrink-0"
                    aria-hidden
                  />
                )}
              </button>
              <span>ACC</span>
            </div>
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_0.7fr_1fr_auto] gap-3 px-4 py-1 pl-[68px] text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span className="text-muted-foreground/80">View</span>
              <span className="text-muted-foreground/80">Upload</span>
              <span className="text-muted-foreground/80">Edit</span>
              <span className="text-muted-foreground/80">Delete</span>
              <span />
              <span />
            </div>
          </div>
          <PersonRowList
            list={list}
            accSummaryMap={accSummaryMap}
            activatedEmails={activatedEmails}
            onPersonClick={(p) => setSelectedEmail(p.email)}
            onHoverEnter={handleRowHoverEnter}
            onHoverLeave={handleRowHoverLeave}
            onActivityCellClick={openActivitySheet}
            onStatusPillClick={handleStatusPillClick}
            onAdminPillClick={handleAdminPillClick}
          />
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {list.map((person) => (
          <PersonCard
            key={person.resourceName}
            person={person}
            accSummary={accSummaryMap.get(person.email)}
            onClick={() => setSelectedEmail(person.email)}
          />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
    <div className="mx-auto max-w-[1600px] p-6 space-y-4 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <Users size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              Users
            </h1>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? "Loading..."
                : stats.shown === stats.total
                  ? `${stats.total} ${usingFallbackDirectory ? "registered users" : "people"}`
                  : `${stats.shown} of ${stats.total} ${usingFallbackDirectory ? "registered users" : "people"}`}
              {stats.depts > 0 && !isLoading && (
                <span className="text-muted-foreground/50">
                  {" "}&middot; {stats.depts} departments
                </span>
              )}
              {stats.costCenters > 0 && !isLoading && (
                <span className="text-muted-foreground/50">
                  {" "}&middot; {stats.costCenters} cost centers
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Directory view controls */}
        <div className="flex items-center gap-2">
          <Select
            value={groupBy}
            onValueChange={(v) => setGroupBy(v as GroupByField)}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs bg-card border-border">
              <SelectValue placeholder="Group by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              <SelectItem value="department">Department</SelectItem>
              <SelectItem value="jobTitle">Job Title</SelectItem>
              <SelectItem value="costCenter">Cost Center</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "grid"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "list"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="shrink-0">
        <DataCoverageStrip coverage={coverage} />
      </div>

      {/* General tab content: search bar, filters, directory listing */}
      <>
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search anything... or use dept:, job:, cc:, phone:, email:"
            className="pl-8 pr-10 bg-card border-border"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={12} className="text-muted-foreground/50" />

          {departments.length > 0 && (
            <Select
              value={filterDept ?? "__all__"}
              onValueChange={(v) => setFilterDept(v === "__all__" ? null : v)}
            >
              <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-card border-border gap-1">
                <Building2 size={11} className="shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {jobTitles.length > 0 && (
            <Select
              value={filterJobTitle ?? "__all__"}
              onValueChange={(v) => setFilterJobTitle(v === "__all__" ? null : v)}
            >
              <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-card border-border gap-1">
                <Briefcase size={11} className="shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Job Title" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Job Titles</SelectItem>
                {jobTitles.map((j) => (
                  <SelectItem key={j} value={j}>
                    {j}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {costCenters.length > 0 && (
            <Select
              value={filterCostCenter ?? "__all__"}
              onValueChange={(v) => setFilterCostCenter(v === "__all__" ? null : v)}
            >
              <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-card border-border gap-1">
                <DollarSign size={11} className="shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Cost Center" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Cost Centers</SelectItem>
                {costCenters.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {accProjects.length > 0 && (
            <Select
              value={filterAccProject ?? "__all__"}
              onValueChange={(v) => setFilterAccProject(v === "__all__" ? null : v)}
            >
              <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-card border-border gap-1">
                <Building2 size={11} className="shrink-0 text-muted-foreground" />
                <SelectValue placeholder="ACC Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All ACC Projects</SelectItem>
                {accProjects.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {accRoles.length > 0 && (
            <Select
              value={filterAccRole ?? "__all__"}
              onValueChange={(v) => setFilterAccRole(v === "__all__" ? null : v)}
            >
              <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-card border-border gap-1">
                <UserCircle size={11} className="shrink-0 text-muted-foreground" />
                <SelectValue placeholder="ACC Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All ACC Roles</SelectItem>
                {accRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {accModules.length > 0 && (
            <Select
              value={filterAccModule ?? "__all__"}
              onValueChange={(v) => {
                setFilterAccModule(v === "__all__" ? null : v);
                setFilterAccModuleTier(null);
              }}
            >
              <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-card border-border gap-1">
                <LayoutGrid size={11} className="shrink-0 text-muted-foreground" />
                <SelectValue placeholder="ACC Module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All ACC Modules</SelectItem>
                {accModules.map((m) => (
                  <SelectItem key={m} value={m}>
                    {moduleLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Phase 09 LIST-01 — Status multi-select facet */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[11px] gap-1 bg-card border-border"
              >
                <CheckCircle2 size={11} className="shrink-0 text-muted-foreground" />
                Status
                {statusFilter.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                    {statusFilter.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel className="text-[11px]">User status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(["active", "pending", "deleted"] as AggregatedStatus[]).map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={statusFilter.includes(s)}
                  onCheckedChange={(checked) => {
                    setStatusFilter((prev) =>
                      checked ? [...prev, s] : prev.filter((x) => x !== s),
                    );
                  }}
                  onSelect={(e) => e.preventDefault()}
                >
                  {STATUS_PILL_LABEL[s]}
                </DropdownMenuCheckboxItem>
              ))}
              {statusFilter.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <button
                    onClick={() => setStatusFilter([])}
                    className="w-full text-left px-2 py-1.5 text-[11px] text-primary hover:bg-accent rounded-sm"
                  >
                    Clear status filter
                  </button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Phase 09 LIST-02 — Project Admin binary facet */}
          <button
            onClick={() => setProjectAdminFilter((prev) => !prev)}
            className={cn(
              "inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all",
              projectAdminFilter
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-primary",
            )}
          >
            <ShieldCheck size={11} className="shrink-0" />
            Project Admin only
          </button>

          {/* ACC "No Projects" filter chip — only visible when there is cache data */}
          {noProjectsCount > 0 && (
            <button
              onClick={() => setFilterNoProjects(!filterNoProjects)}
              className={cn(
                "inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all",
                filterNoProjects
                  ? "border-amber-500/60 bg-amber-500/15 text-amber-400"
                  : "border-amber-500/25 bg-transparent text-amber-500/70 hover:border-amber-500/50 hover:text-amber-400"
              )}
            >
              <AlertCircle size={11} className="shrink-0" />
              No ACC Projects ({noProjectsCount})
            </button>
          )}

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="text-[11px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
            >
              <X size={10} />
              Clear all
            </button>
          )}
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1.5">
            {filterDept && (
              <ActiveFilterPill
                label="Dept"
                value={filterDept}
                onClear={() => setFilterDept(null)}
              />
            )}
            {filterJobTitle && (
              <ActiveFilterPill
                label="Job"
                value={filterJobTitle}
                onClear={() => setFilterJobTitle(null)}
              />
            )}
            {filterCostCenter && (
              <ActiveFilterPill
                label="CC"
                value={filterCostCenter}
                onClear={() => setFilterCostCenter(null)}
              />
            )}
            {filterAccProject && (
              <ActiveFilterPill
                label="Project"
                value={filterAccProject}
                onClear={() => setFilterAccProject(null)}
              />
            )}
            {filterAccRole && (
              <ActiveFilterPill
                label="Role"
                value={filterAccRole}
                onClear={() => setFilterAccRole(null)}
              />
            )}
            {filterAccModule && (
              <ActiveFilterPill
                label="Module"
                value={
                  filterAccModuleTier
                    ? `${moduleLabel(filterAccModule)} (Tier: ${
                        filterAccModuleTier.charAt(0).toUpperCase() + filterAccModuleTier.slice(1)
                      })`
                    : moduleLabel(filterAccModule)
                }
                onClear={() => {
                  setFilterAccModule(null);
                  setFilterAccModuleTier(null);
                }}
              />
            )}
            {statusFilter.map((s) => (
              <ActiveFilterPill
                key={s}
                label="Status"
                value={STATUS_PILL_LABEL[s]}
                onClear={() =>
                  setStatusFilter((prev) => prev.filter((x) => x !== s))
                }
              />
            ))}
            {projectAdminFilter && (
              <ActiveFilterPill
                label="Admin"
                value="Project Admin only"
                onClear={() => setProjectAdminFilter(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <div>
            <p className="font-medium">Could not load organization directory</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Refresh the page and try again. If the problem persists, check the server logs.
            </p>
          </div>
        </div>
      )}

      {directoryBanner && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <div>
            <p className="font-medium">{directoryBanner.title}</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              {directoryBanner.description}
            </p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-2xl border border-border bg-card animate-pulse"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-muted/50 shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 bg-muted/50 rounded w-3/4" />
                  <div className="h-2.5 bg-muted/30 rounded w-1/2" />
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="h-2 bg-muted/20 rounded w-2/3" />
                <div className="h-2 bg-muted/20 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!isLoading && (
        <>
          {visibleGroups ? (
            <div className="space-y-6">
              {visibleGroups.map(([label, members]) => (
                <CollapsibleGroup
                  key={label}
                  label={label}
                  count={members.length}
                  defaultOpen={visibleGroups.length <= 8}
                >
                  {renderPeople(members)}
                </CollapsibleGroup>
              ))}
            </div>
          ) : (
            renderPeople(visibleFiltered)
          )}

          {hasMoreDirectoryRows && (
            <div className="flex items-center justify-center pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDirectoryRenderLimit((limit) => limit + DIRECTORY_RENDER_BATCH)}
              >
                Show {Math.min(DIRECTORY_RENDER_BATCH, filtered.length - renderedDirectoryCount).toLocaleString()} more
              </Button>
            </div>
          )}

          {filtered.length === 0 && !error && (
            <div className="text-center py-16 space-y-2">
              <UserCircle
                size={40}
                className="mx-auto text-muted-foreground/30"
              />
              <p className="text-sm text-muted-foreground">
                {search || hasActiveFilters
                  ? "No people match your search or filters"
                  : usingFallbackDirectory
                    ? "No registered users found."
                    : "No people found in your organization directory."}
              </p>
              {(search || hasActiveFilters) && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-primary hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* PersonDetailModal: selectedEmail (string) drives open/close;
          object is resolved here so the store stays serializable (USR-01). */}
      <PersonDetailModal
        person={
          selectedEmail
            ? people.find((p) => p.email.toLowerCase() === selectedEmail.toLowerCase()) ?? null
            : null
        }
        accUser={
          selectedEmail
            ? mergedAccUsers.find(
                (u) => u.email.toLowerCase() === selectedEmail.toLowerCase(),
              ) ?? null
            : null
        }
        open={!!selectedEmail}
        onOpenChange={(v) => {
          if (!v) setSelectedEmail(null);
        }}
      />

      {/* File Activity drill-down sheet (ACTV-05) — opens when a row's
          file-activity cell is clicked. Reuses UserActivityBody from the
          dashboard side panel so the experience matches. */}
      <Sheet
        open={!!activityEmail}
        onOpenChange={(v) => {
          if (!v) setActivityEmail(null);
        }}
      >
        <SheetContent side="right" className="sm:max-w-lg">
          {activityEmail && (
            <UserActivityBody email={activityEmail} users={mergedAccUsers} />
          )}
        </SheetContent>
      </Sheet>
      </>
    </div>
    </TooltipProvider>
  );
}
