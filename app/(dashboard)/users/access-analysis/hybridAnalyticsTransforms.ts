// Pure compute/format helpers extracted verbatim from HybridAnalyticsSurface.tsx (SPLIT-04).
// No React, no JSX, no hooks — safe to import from both the data-hook and the presentational view.
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { GraphFolderPermissionRow } from "./graphTables";
import type { ChartDatum } from "./analyticsQueries";
import type { DonutSlice } from "./DonutPanel";
import { chartColor, sequenceColor } from "./chartColors";

export const ACTIVE_REFRESH_MS = 15_000;
export const IDLE_REFRESH_MS = 5 * 60_000;

export function toFolderRows(rawRows: readonly unknown[] | undefined): GraphFolderPermissionRow[] {
  return (rawRows ?? [])
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        folderId: String(r.folderId ?? ""),
        folderPath: String(r.folderPath ?? ""),
        projectId: String(r.projectId ?? ""),
        roleId: String(r.roleName ?? r.roleId ?? ""),
        permType: String(r.permType ?? ""),
      };
    })
    .filter((row) => row.folderId && row.roleId && row.permType);
}

export const ACCENTS = {
  distribution: chartColor("seq4"),
  distributionAdmin: chartColor("watch"),
  heatmap: chartColor("seq2"),
  membership: chartColor("good"),
  role: chartColor("seq4"),
  company: chartColor("seq1"),
} as const;

export const STATUS_ROLE: Record<string, Parameters<typeof chartColor>[0]> = {
  active: "good",
  pending: "watch",
  deleted: "risk",
  unknown: "neutral",
};
export const RECENCY_ROLES = ["good", "info", "watch", "neutral"] as const;
export const ADMIN_MIX_ROLES = ["risk", "watch", "info", "neutral"] as const;

export function computeUserStatus(users: BulkAccUser[]): DonutSlice[] {
  const counts = new Map<string, number>();
  for (const u of users) {
    const key = u.aggregatedStatus ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      value,
      color: chartColor(STATUS_ROLE[label] ?? "neutral"),
    }))
    .sort((a, b) => b.value - a.value);
}

export function computeActivityRecency(users: BulkAccUser[]): DonutSlice[] {
  const now = Date.now();
  const buckets = [
    { label: "Signed in 30d", value: 0 },
    { label: "31-90d", value: 0 },
    { label: "Older than 90d", value: 0 },
    { label: "Never signed in", value: 0 },
  ];
  for (const u of users) {
    const t = u.lastSignIn ? Date.parse(u.lastSignIn) : NaN;
    if (!Number.isFinite(t)) {
      buckets[3].value++;
      continue;
    }
    const days = (now - t) / 86_400_000;
    if (days <= 30) buckets[0].value++;
    else if (days <= 90) buckets[1].value++;
    else buckets[2].value++;
  }
  return buckets.map((b, i) => ({ ...b, color: chartColor(RECENCY_ROLES[i]) }));
}

export function computeAdminMix(users: BulkAccUser[]): DonutSlice[] {
  let accountOnly = 0;
  let projectOnly = 0;
  let both = 0;
  let none = 0;
  for (const u of users) {
    const isAccount = u.isAccountAdmin;
    const isProject = u.adminCount > 0;
    if (isAccount && isProject) both++;
    else if (isAccount) accountOnly++;
    else if (isProject) projectOnly++;
    else none++;
  }
  return [
    { label: "Account admin", value: accountOnly, color: chartColor(ADMIN_MIX_ROLES[0]) },
    { label: "Account + project", value: both, color: chartColor(ADMIN_MIX_ROLES[1]) },
    { label: "Project admin only", value: projectOnly, color: chartColor(ADMIN_MIX_ROLES[2]) },
    { label: "Standard member", value: none, color: chartColor(ADMIN_MIX_ROLES[3]) },
  ];
}

export function computePermTiers(folderRows: GraphFolderPermissionRow[]): DonutSlice[] {
  const counts = new Map<string, number>();
  for (const r of folderRows) counts.set(r.permType, (counts.get(r.permType) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: sequenceColor(i) }));
}

export function toTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function latestTime(values: Array<Date | string | null | undefined>): number | null {
  const times = values.map(toTime).filter((value): value is number => value !== null);
  return times.length ? Math.max(...times) : null;
}

export function formatDateTime(value: number | null): string {
  if (value === null) return "No extraction yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export interface FallbackBarDatum {
  label: string;
  value: number;
}

export function toFallbackRows(rows: readonly ChartDatum[]): FallbackBarDatum[] {
  return rows.map((row) => ({ label: row.label, value: row.value })).filter((row) => row.value > 0);
}

export function projectCountDistribution(users: readonly BulkAccUser[]): FallbackBarDatum[] {
  const buckets = new Map<string, number>();
  for (const user of users) {
    const key = user.projectCount >= 10 ? "10+" : String(user.projectCount);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => Number.parseInt(a.label, 10) - Number.parseInt(b.label, 10));
}

export function adminGrantDistribution(users: readonly BulkAccUser[]): FallbackBarDatum[] {
  const buckets = new Map<string, number>();
  for (const user of users) {
    const key = user.adminCount >= 10 ? "10+" : String(user.adminCount);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => Number.parseInt(a.label, 10) - Number.parseInt(b.label, 10));
}

export function topCompanies(users: readonly BulkAccUser[], limit = 20): FallbackBarDatum[] {
  const counts = new Map<string, number>();
  for (const user of users) {
    const label = (user.companyName ?? user.companyRole ?? "Unknown").trim() || "Unknown";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function topProjects(users: readonly BulkAccUser[], limit = 20): FallbackBarDatum[] {
  const counts = new Map<string, Set<string>>();
  for (const user of users) {
    for (const project of user.projects) {
      const label = project.name || project.id || "Unknown";
      const emails = counts.get(label) ?? new Set<string>();
      emails.add(user.email.toLowerCase());
      counts.set(label, emails);
    }
  }
  return Array.from(counts.entries())
    .map(([label, emails]) => ({ label, value: emails.size }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function topRoles(users: readonly BulkAccUser[], limit = 20): FallbackBarDatum[] {
  const counts = new Map<string, Set<string>>();
  for (const user of users) {
    const roles = new Set([...(user.allRoles ?? []), ...(user.perProjectRoleNames ?? [])].filter(Boolean));
    for (const project of user.projects) {
      for (const role of project.roles) if (role) roles.add(role);
    }
    for (const role of roles) {
      const emails = counts.get(role) ?? new Set<string>();
      emails.add(user.email.toLowerCase());
      counts.set(role, emails);
    }
  }
  return Array.from(counts.entries())
    .map(([label, emails]) => ({ label, value: emails.size }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function roleStatusHeatmapRows(users: readonly BulkAccUser[], limit = 12): FallbackBarDatum[] {
  const counts = new Map<string, number>();
  for (const user of users) {
    for (const project of user.projects) {
      const roles = project.roles.length ? project.roles : user.allRoles;
      for (const role of roles) {
        const label = `${role || "Unknown"} / ${project.status || "unknown"}`;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function adminGrantFinding(users: readonly BulkAccUser[]): string {
  const grants = users.reduce((sum, user) => sum + user.adminCount, 0);
  if (grants === 0) return "No project admin grants found.";
  return `${grants.toLocaleString()} project admin ${grants === 1 ? "grant" : "grants"}`;
}
