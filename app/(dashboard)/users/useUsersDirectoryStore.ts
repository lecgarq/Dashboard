// ---------------------------------------------------------------------------
// useUsersDirectoryStore.ts — Zustand store for /users directory UI state
//
// Created as part of USR-01 decomposition (Phase 2, Plan 4).
// Owns all filter / search / sort / viewMode / selection state that was
// previously scattered across ~15 useState calls in UsersDirectoryClient.tsx.
//
// NEVER placed in this store:
//   - trpc.useUtils() or any tRPC hooks (created at component render time)
//   - useRef / debounce timers (refs are DOM-lifecycle bound)
//   - hover-prefetch logic (calls tRPC utils which can't be stored here)
//
// selectedEmail is a plain string key, NOT the OrgPerson object.
//   - Keeps the store serializable
//   - The setter is referentially stable → closing the modal does NOT trigger
//     the directoryRenderLimit reset effect (RESEARCH Pitfall 2)
//   - The shell resolves the full OrgPerson immediately before passing to
//     PersonDetailModal (pattern: people.find(p => p.email === selectedEmail))
// ---------------------------------------------------------------------------

import { create } from "zustand";
import type { AggregatedStatus } from "@/lib/acc/accStatusReduction";
import type { GroupByField, ViewMode } from "./directoryUtils";

// ---------------------------------------------------------------------------
// State + actions interface
// ---------------------------------------------------------------------------

export interface UsersDirectoryState {
  // Search
  search: string;
  debouncedSearch: string;
  setSearch: (v: string) => void;
  setDebouncedSearch: (v: string) => void;

  // View
  viewMode: ViewMode;
  groupBy: GroupByField;
  setViewMode: (v: ViewMode) => void;
  setGroupBy: (v: GroupByField) => void;

  // Dropdown filters
  filterDept: string | null;
  filterJobTitle: string | null;
  filterCostCenter: string | null;
  filterAccProject: string | null;
  filterAccRole: string | null;
  filterAccModule: string | null;
  filterAccModuleTier: string | null;
  setFilterDept: (v: string | null) => void;
  setFilterJobTitle: (v: string | null) => void;
  setFilterCostCenter: (v: string | null) => void;
  setFilterAccProject: (v: string | null) => void;
  setFilterAccRole: (v: string | null) => void;
  setFilterAccModule: (v: string | null) => void;
  setFilterAccModuleTier: (v: string | null) => void;

  // Boolean/array filters
  filterNoProjects: boolean;
  statusFilter: AggregatedStatus[];
  projectAdminFilter: boolean;
  affiliationFilter: "internal" | "external" | null;
  setAffiliationFilter: (v: "internal" | "external" | null) => void;
  setFilterNoProjects: (v: boolean) => void;
  setStatusFilter: (v: AggregatedStatus[] | ((prev: AggregatedStatus[]) => AggregatedStatus[])) => void;
  setProjectAdminFilter: (v: boolean | ((prev: boolean) => boolean)) => void;

  // Sort
  activitySort: { active: boolean; direction: "asc" | "desc" };
  setActivitySort: (v: { active: boolean; direction: "asc" | "desc" } | ((prev: { active: boolean; direction: "asc" | "desc" }) => { active: boolean; direction: "asc" | "desc" })) => void;

  // Selection / activity sheet
  selectedEmail: string | null;
  activityEmail: string | null;
  activatedEmails: Set<string>;
  setSelectedEmail: (v: string | null) => void;
  setActivityEmail: (v: string | null) => void;

  // Composite actions
  clearAllFilters: () => void;
  cycleActivitySort: () => void;
  activateEmail: (email: string) => void;
  applyModuleFilterFromSidePanel: (moduleKey: string, tier: string) => void;
}

// ---------------------------------------------------------------------------
// Initial values — must match the monolith's useState defaults byte-for-byte
// ---------------------------------------------------------------------------

const INITIAL_ACTIVITY_SORT = { active: false, direction: "desc" as const };

export const useUsersDirectoryStore = create<UsersDirectoryState>((set, get) => ({
  // Search
  search: "",
  debouncedSearch: "",
  setSearch: (v) => set({ search: v }),
  setDebouncedSearch: (v) => set({ debouncedSearch: v }),

  // View
  viewMode: "grid",
  groupBy: "none",
  setViewMode: (v) => set({ viewMode: v }),
  setGroupBy: (v) => set({ groupBy: v }),

  // Dropdown filters
  filterDept: null,
  filterJobTitle: null,
  filterCostCenter: null,
  filterAccProject: null,
  filterAccRole: null,
  filterAccModule: null,
  filterAccModuleTier: null,
  setFilterDept: (v) => set({ filterDept: v }),
  setFilterJobTitle: (v) => set({ filterJobTitle: v }),
  setFilterCostCenter: (v) => set({ filterCostCenter: v }),
  setFilterAccProject: (v) => set({ filterAccProject: v }),
  setFilterAccRole: (v) => set({ filterAccRole: v }),
  setFilterAccModule: (v) => set({ filterAccModule: v }),
  setFilterAccModuleTier: (v) => set({ filterAccModuleTier: v }),

  // Boolean/array filters
  filterNoProjects: false,
  statusFilter: [],
  projectAdminFilter: false,
  affiliationFilter: null,
  setAffiliationFilter: (v) => set({ affiliationFilter: v }),
  setFilterNoProjects: (v) => set({ filterNoProjects: v }),
  setStatusFilter: (v) =>
    set((state) => ({
      statusFilter: typeof v === "function" ? v(state.statusFilter) : v,
    })),
  setProjectAdminFilter: (v) =>
    set((state) => ({
      projectAdminFilter: typeof v === "function" ? v(state.projectAdminFilter) : v,
    })),

  // Sort
  activitySort: { ...INITIAL_ACTIVITY_SORT },
  setActivitySort: (v) =>
    set((state) => ({
      activitySort: typeof v === "function" ? v(state.activitySort) : v,
    })),

  // Selection / activity sheet
  selectedEmail: null,
  activityEmail: null,
  activatedEmails: new Set<string>(),
  setSelectedEmail: (v) => set({ selectedEmail: v }),
  setActivityEmail: (v) => set({ activityEmail: v }),

  // ---------------------------------------------------------------------------
  // Composite actions
  // ---------------------------------------------------------------------------

  // clearAllFilters — resets all 10 dropdown filters + statusFilter +
  // projectAdminFilter + filterNoProjects + search + debouncedSearch.
  // Mirrors the monolith's clearAllFilters which also calls handleSearchChange("").
  clearAllFilters: () =>
    set({
      filterDept: null,
      filterJobTitle: null,
      filterCostCenter: null,
      filterNoProjects: false,
      filterAccProject: null,
      filterAccRole: null,
      filterAccModule: null,
      filterAccModuleTier: null,
      statusFilter: [],
      projectAdminFilter: false,
      affiliationFilter: null,
      search: "",
      debouncedSearch: "",
    }),

  // cycleActivitySort — three-state cycle: off -> desc -> asc -> off.
  // Mirrors the monolith's handleActivitySortClick state machine exactly.
  cycleActivitySort: () =>
    set((state) => {
      const prev = state.activitySort;
      if (!prev.active) return { activitySort: { active: true, direction: "desc" as const } };
      if (prev.direction === "desc") return { activitySort: { active: true, direction: "asc" as const } };
      return { activitySort: { active: false, direction: "desc" as const } };
    }),

  // activateEmail — adds email to activatedEmails idempotently.
  // Returns the same Set reference when email is already present (no-op).
  activateEmail: (email) =>
    set((state) => {
      if (state.activatedEmails.has(email)) return state; // same reference — no re-render
      const next = new Set(state.activatedEmails);
      next.add(email);
      return { activatedEmails: next };
    }),

  // applyModuleFilterFromSidePanel — sets filterAccModule + filterAccModuleTier.
  // Matches the monolith's handleApplyModuleFilterFromSidePanel callback.
  applyModuleFilterFromSidePanel: (moduleKey, tier) =>
    set({ filterAccModule: moduleKey, filterAccModuleTier: tier || null }),
}));
