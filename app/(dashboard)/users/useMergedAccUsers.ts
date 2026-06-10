"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { ACC_SNAPSHOT_STALE_TIME_MS } from "@/lib/acc/cachePolicy";

export { ACC_SNAPSHOT_STALE_TIME_MS };

export interface OrgPerson {
  resourceName: string;
  displayName: string;
  email: string;
  photoUrl: string | null;
  department: string | null;
  jobTitle: string | null;
  phoneNumber: string | null;
  costCenter: string | null;
}

export interface LocalDirectoryUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  department: string | null;
  jobTitle: string | null;
}

export interface EnrichedAccUserFields {
  email: string;
  aggregatedStatus?: "active" | "pending" | "deleted";
  projectAdmin?: boolean;
  executive?: boolean;
  companyName?: string | null;
  perProjectRoleNames?: string[];
}

export function mapFallbackDirectoryToOrgPeople(users: readonly LocalDirectoryUser[]): OrgPerson[] {
  return users.map((user) => ({
    resourceName: user.id,
    displayName: user.name ?? user.email,
    email: user.email,
    photoUrl: user.image ?? null,
    department: user.department ?? null,
    jobTitle: user.jobTitle ?? null,
    phoneNumber: null,
    costCenter: null,
  }));
}

export function mergeAccSummaryWithEnrichment(
  base: readonly BulkAccUser[],
  enrichedUsers: readonly EnrichedAccUserFields[],
): BulkAccUser[] {
  if (!enrichedUsers.length) return [...base];
  const enrichMap = new Map(enrichedUsers.map((user) => [user.email.toLowerCase(), user]));
  return base.map((user) => {
    const enriched = enrichMap.get(user.email.toLowerCase());
    return enriched
      ? {
          ...user,
          aggregatedStatus: enriched.aggregatedStatus,
          projectAdmin: enriched.projectAdmin,
          executive: enriched.executive,
          companyName: enriched.companyName,
          perProjectRoleNames: enriched.perProjectRoleNames,
        }
      : user;
  });
}

export function selectAccSummarySource(
  dcUsers: readonly BulkAccUser[],
  cacheUsers: readonly BulkAccUser[],
): readonly BulkAccUser[] {
  return dcUsers.length > 0 ? dcUsers : cacheUsers;
}

function createAccUserStub(person: OrgPerson): BulkAccUser {
  return {
    email: person.email,
    name: person.displayName,
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
  };
}

export function mergePeopleWithAccSummary(
  people: readonly OrgPerson[],
  accSummary: readonly BulkAccUser[],
): BulkAccUser[] {
  const byEmail = new Map<string, BulkAccUser>();
  for (const user of accSummary) byEmail.set(user.email.toLowerCase(), user);
  if (!people.length) return [...accSummary];
  const seen = new Set<string>();
  const directoryRows = people.map((person) => {
    const email = person.email.toLowerCase();
    seen.add(email);
    return byEmail.get(email) ?? createAccUserStub(person);
  });
  const accOnlyRows = accSummary
    .filter((user) => !seen.has(user.email.toLowerCase()))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email) || a.email.localeCompare(b.email));
  return [...directoryRows, ...accOnlyRows];
}

export function useMergedAccUsers(options: { refetchInterval?: number | false } = {}): { users: BulkAccUser[]; loading: boolean } {
  const { data: accSummaryRaw = [], isLoading: accLoading } = trpc.users.bulkAccSummary.useQuery(undefined, {
    staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
    retry: false,
    refetchInterval: options.refetchInterval,
  });
  const { data: dcUsersRaw = [], isLoading: dcLoading } = trpc.accDcGraph.bulkUsers.useQuery(undefined, {
    staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
    retry: false,
    refetchInterval: options.refetchInterval,
  });
  const { data: enrichedUsers = [], isLoading: enrichedLoading } = trpc.accMembers.enrichedUsers.useQuery(undefined, {
    staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
    retry: false,
    refetchInterval: options.refetchInterval,
  });
  const { data: directoryData, isLoading: directoryLoading } = trpc.users.getOrgDirectory.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
    refetchInterval: options.refetchInterval,
  });
  const { data: fallbackDirectory = [], isLoading: fallbackLoading } = trpc.users.getDirectory.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
    refetchInterval: options.refetchInterval,
  });

  const accSource = useMemo(
    () => selectAccSummarySource(dcUsersRaw as BulkAccUser[], accSummaryRaw as BulkAccUser[]),
    [dcUsersRaw, accSummaryRaw],
  );
  const accSummary = useMemo(
    () => mergeAccSummaryWithEnrichment(accSource, enrichedUsers),
    [accSource, enrichedUsers],
  );
  const people = useMemo<OrgPerson[]>(() => {
    if (directoryData?.status === "ok") return directoryData.people ?? [];
    return mapFallbackDirectoryToOrgPeople(fallbackDirectory as LocalDirectoryUser[]);
  }, [directoryData, fallbackDirectory]);
  const users = useMemo(() => mergePeopleWithAccSummary(people, accSummary), [people, accSummary]);

  const coreLoading = dcLoading || accLoading || enrichedLoading;
  return { users, loading: coreLoading };
}
