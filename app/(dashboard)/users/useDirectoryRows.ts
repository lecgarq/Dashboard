"use client";

// ---------------------------------------------------------------------------
// useDirectoryRows — filtering + sorting + grouping memos extracted from
// UsersDirectoryClient (USR-01 decomposition, Wave 6).
//
// Inputs come from the Zustand store (filter values) and the data hook
// (people, accSummaryMap), plus the activity-sort state from the shell.
//
// Outputs: filtered, displayRows, groups, hasActiveFilters.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { reduceMemberStatus, type AggregatedStatus } from "@/lib/acc/accStatusReduction";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { useShallow } from "zustand/shallow";
import type { OrgPerson } from "./directoryUtils";
import { parseSearchTokens, matchesPerson } from "./directoryUtils";
import { useUsersDirectoryStore } from "./useUsersDirectoryStore";
import { classifyAffiliation } from "./access-analysis/internalDomains";
export interface DirectoryRowsResult {
  filtered: OrgPerson[];
  displayRows: OrgPerson[];
  groups: [string, OrgPerson[]][] | null;
  hasActiveFilters: boolean;
}

export function useDirectoryRows({
  people,
  accSummaryMap,
  orderedActivityEmails,
  activitySortActive,
}: {
  people: OrgPerson[];
  accSummaryMap: Map<string, BulkAccUser>;
  orderedActivityEmails: string[];
  activitySortActive: boolean;
}): DirectoryRowsResult {
  const {
    debouncedSearch, groupBy,
    filterDept, filterJobTitle, filterCostCenter, filterNoProjects,
    filterAccProject, filterAccRole, filterAccModule,
    statusFilter, projectAdminFilter, affiliationFilter,
  } = useUsersDirectoryStore(useShallow((s) => ({
    debouncedSearch: s.debouncedSearch, groupBy: s.groupBy,
    filterDept: s.filterDept, filterJobTitle: s.filterJobTitle, filterCostCenter: s.filterCostCenter,
    filterNoProjects: s.filterNoProjects, filterAccProject: s.filterAccProject,
    filterAccRole: s.filterAccRole, filterAccModule: s.filterAccModule,
    statusFilter: s.statusFilter, projectAdminFilter: s.projectAdminFilter,
    affiliationFilter: s.affiliationFilter,
  })));

  const hasActiveFilters = !!(filterDept || filterJobTitle || filterCostCenter || filterNoProjects ||
    filterAccProject || filterAccRole || filterAccModule || statusFilter.length > 0 || projectAdminFilter ||
    affiliationFilter);

  const filtered = useMemo(() => {
    const { fieldFilters, freeText } = parseSearchTokens(debouncedSearch);
    return people.filter((p) => {
      if (affiliationFilter && classifyAffiliation(p.email) !== affiliationFilter) return false;
      if (filterDept && p.department !== filterDept) return false;
      if (filterJobTitle && p.jobTitle !== filterJobTitle) return false;
      if (filterCostCenter && p.costCenter !== filterCostCenter) return false;
      if (filterNoProjects) { const s = accSummaryMap.get(p.email); if (!s || !s.hasNoProjects) return false; }
      if (filterAccProject || filterAccRole || filterAccModule) {
        const s = accSummaryMap.get(p.email);
        if (!s) return false;
        if (filterAccProject && !s.projects?.some((proj) => proj.name === filterAccProject)) return false;
        if (filterAccRole && !s.allRoles?.includes(filterAccRole)) return false;
        if (filterAccModule && !s.allModules?.includes(filterAccModule)) return false;
      }
      if (statusFilter.length > 0) {
        const s = accSummaryMap.get(p.email);
        const rowStatus: AggregatedStatus = s?.aggregatedStatus ?? reduceMemberStatus(s?.projects?.map((proj) => proj.status) ?? []);
        if (!statusFilter.includes(rowStatus)) return false;
      }
      if (projectAdminFilter) { const s = accSummaryMap.get(p.email); if (s?.projectAdmin !== true) return false; }
      return matchesPerson(p, freeText, fieldFilters);
    });
  }, [people, debouncedSearch, filterDept, filterJobTitle, filterCostCenter, filterNoProjects, filterAccProject, filterAccRole, filterAccModule, statusFilter, projectAdminFilter, affiliationFilter, accSummaryMap]);

  const displayRows = useMemo<OrgPerson[]>(() => {
    if (!activitySortActive) return filtered;
    const orderMap = new Map<string, number>();
    orderedActivityEmails.forEach((e, i) => orderMap.set(e, i));
    const inSort: OrgPerson[] = [], remainder: OrgPerson[] = [];
    for (const row of filtered) (orderMap.has(row.email.toLowerCase()) ? inSort : remainder).push(row);
    inSort.sort((a, b) => (orderMap.get(a.email.toLowerCase()) ?? 0) - (orderMap.get(b.email.toLowerCase()) ?? 0));
    remainder.sort((a, b) => a.email.localeCompare(b.email));
    return [...inSort, ...remainder];
  }, [activitySortActive, orderedActivityEmails, filtered]);

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, OrgPerson[]>();
    for (const person of displayRows) { const key = (person[groupBy] as string | null) || "Not specified"; map.set(key, [...(map.get(key) ?? []), person]); }
    return Array.from(map.entries()).sort(([a], [b]) => a === "Not specified" ? 1 : b === "Not specified" ? -1 : a.localeCompare(b));
  }, [displayRows, groupBy]);

  return { filtered, displayRows, groups, hasActiveFilters };
}
