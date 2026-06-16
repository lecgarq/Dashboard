/**
 * Pure account-wide "dormant companies" diff for the Access Analysis page. A
 * company is dormant when it never shows up in the donuts: either it has no
 * users at all, or it has users but no recorded activity. Computed from the full
 * roster (every AccDcCompany name) against the account-wide membership and
 * activity sets — so it does NOT react to the project picker. No React/DOM/IO.
 */
import { UNKNOWN_COMPANY } from "./companyCounts";

export interface DormantSummary {
  /** Roster names with zero memberships, tombstones removed, sorted alphabetically. */
  noUsers: string[];
  /** Companies that have users but zero attributed activity, sorted by user count desc then name. */
  noActivity: Array<{ company: string; userCount: number }>;
}

/** Autodesk soft-deletes companies as `"removed at <date> <uuid>"`; these are not real roster entries. */
const TOMBSTONE_PREFIX = "removed at ";
const isTombstone = (name: string) => name.startsWith(TOMBSTONE_PREFIX);

export function summarizeDormantCompanies(
  roster: ReadonlyArray<string>,
  /** Account-wide: company label -> its members. From summarizeCompanies(all rows). */
  usersByCompany: ReadonlyMap<string, ReadonlyArray<{ email: string }>>,
  /** Account-wide: companies with ≥1 attributed activity. From summarizeActivityByCompany(all). */
  companiesWithActivity: ReadonlySet<string>,
): DormantSummary {
  const companiesWithUsers = new Set([...usersByCompany.keys()].filter((c) => c !== UNKNOWN_COMPANY));

  const noUsers = [...new Set(roster)]
    .filter((name) => !companiesWithUsers.has(name) && !isTombstone(name))
    .sort((a, b) => a.localeCompare(b));

  const noActivity = [...companiesWithUsers]
    .filter((company) => !companiesWithActivity.has(company))
    .map((company) => ({ company, userCount: usersByCompany.get(company)!.length }))
    .sort((a, b) => b.userCount - a.userCount || a.company.localeCompare(b.company));

  return { noUsers, noActivity };
}
