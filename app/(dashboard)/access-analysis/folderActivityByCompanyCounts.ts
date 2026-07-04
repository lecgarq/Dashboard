/**
 * Pure transform for the "Folder activity by company" panel (UAT-6). Reuses
 * `summarizeActivityByCompany` (the existing (email::projectId) -> company
 * join) rather than re-deriving it, then collapses to top-N companies + a
 * single "Other (N companies)" bucket. `UNKNOWN_COMPANY` is ranked like any
 * other slice (by count desc, not pinned) — it is never filtered out, and
 * even when it lands beyond `topN` its count still contributes to the
 * aggregated "Other" total, so `sum(bars.count) === total` always holds. No
 * React/DOM/IO — safe on both server and client.
 */
import {
  summarizeActivityByCompany,
  type ActivityActorInput,
  type MembershipCompanyInput,
  type CompanyActivityUser,
} from "./companyActivityCounts";

/** Default top-N cutoff before companies fold into "Other (N companies)". Exported so
 * the chart component can pass it back explicitly when the owner collapses an
 * expanded view (UAT gap-closure item 3 — "expand the Others" for companies too). */
export const DEFAULT_TOP_N = 10;

/** One company's aggregated folder-scoped activity (a chart bar). */
export interface FolderCompanyBar {
  company: string;
  count: number;
  /** This company's contributing user emails — feeds the per-company drill action. Empty for the "Other" bucket (no drill). */
  memberEmails: string[];
}

export interface FolderActivityByCompanySummary {
  /** Top-N companies by folder-scoped activity desc, plus a trailing "Other (N companies)" bar when truncated. */
  bars: FolderCompanyBar[];
  /** Sum of all bar counts (= total attributed folder-scoped activity in scope). */
  total: number;
  /** Company label -> contributing users, sorted by count desc (drives the drill's "top users" list). */
  usersByCompany: Map<string, CompanyActivityUser[]>;
}

/**
 * Buckets folder-scoped activity by company (via `summarizeActivityByCompany`),
 * then keeps the top `topN` companies as individual bars and collapses the
 * remainder into one "Other (N companies)" bar. `memberEmails` per bar comes
 * from that company's `usersByCompany` entry; the "Other" bar has no drill
 * (empty `memberEmails`).
 */
export function summarizeFolderActivityByCompany(
  activity: ReadonlyArray<ActivityActorInput>,
  memberships: ReadonlyArray<MembershipCompanyInput>,
  topN: number = DEFAULT_TOP_N,
): FolderActivityByCompanySummary {
  const summary = summarizeActivityByCompany(activity, memberships);
  const limit = Math.max(0, topN);
  const kept = summary.slices.slice(0, limit);
  const rest = summary.slices.slice(limit);

  const bars: FolderCompanyBar[] = kept.map((s) => ({
    company: s.name,
    count: s.value,
    memberEmails: (summary.usersByCompany.get(s.name) ?? []).map((u) => u.email),
  }));

  if (rest.length > 0) {
    const count = rest.reduce((sum, s) => sum + s.value, 0);
    const noun = rest.length === 1 ? "company" : "companies";
    bars.push({ company: `Other (${rest.length} ${noun})`, count, memberEmails: [] });
  }

  return { bars, total: summary.total, usersByCompany: summary.usersByCompany };
}
