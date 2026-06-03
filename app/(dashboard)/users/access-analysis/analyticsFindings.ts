import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { GraphFolderPermissionRow } from "./graphTables";

export interface ExecutiveFindings {
  activeMembers: string;
  adminConcentration: string;
  permissionTiers: string;
  projectBreadth: string;
  staleMembers: string;
}

const DAY_MS = 86_400_000;

function plural(count: number, singular: string, pluralText = `${singular}s`) {
  return count === 1 ? singular : pluralText;
}

export function isAdmin(user: BulkAccUser) {
  return user.isAccountAdmin || user.projectAdmin === true || user.adminCount > 0;
}

function companyFor(user: BulkAccUser) {
  return (user.companyName ?? user.companyRole ?? "Unknown").trim() || "Unknown";
}

function daysSince(value: string | null | undefined, now: number) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return (now - parsed) / DAY_MS;
}

export function computeProjectBreadthFinding(
  users: readonly BulkAccUser[],
  threshold = 10,
): string {
  const count = users.filter((user) => user.projectCount >= threshold).length;
  if (count === 0) return `No users have ${threshold}+ projects.`;
  return `${count.toLocaleString()} ${plural(count, "user")} ${count === 1 ? "has" : "have"} ${threshold}+ projects.`;
}

export function computeAdminConcentrationFinding(users: readonly BulkAccUser[]): string {
  const companies = new Set<string>();
  for (const user of users) {
    if (isAdmin(user)) companies.add(companyFor(user));
  }
  const count = companies.size;
  if (count === 0) return "No admin access found.";
  return `Admin access is concentrated in ${count.toLocaleString()} ${plural(count, "company", "companies")}.`;
}

export function computeStaleMembersFinding(
  users: readonly BulkAccUser[],
  now = Date.now(),
  thresholdDays = 90,
): string {
  const count = users.filter((user) => daysSince(user.lastSignIn, now) > thresholdDays).length;
  if (count === 0) return `No members are stale beyond ${thresholdDays} days.`;
  return `${count.toLocaleString()} ${plural(count, "member")} ${count === 1 ? "is" : "are"} stale or ${count === 1 ? "has" : "have"} never signed in.`;
}

export function computeActiveMembersFinding(
  users: readonly BulkAccUser[],
  now = Date.now(),
  thresholdDays = 30,
): string {
  const count = users.filter((user) => daysSince(user.lastSignIn, now) <= thresholdDays).length;
  if (count === 0) return `No members signed in within ${thresholdDays} days.`;
  return `${count.toLocaleString()} ${plural(count, "member")} signed in within ${thresholdDays} days.`;
}

export interface SignInCoverage {
  withSignIn: number;
  total: number;
  percent: number;
}

/**
 * How many users have a *recorded* last sign-in. Sign-in recency is only
 * available for a fraction of users (per data discovery ~34%), so a "Never
 * signed in" bucket is dominated by missing data, not real inactivity. The
 * Sign-in recency donut surfaces this coverage so the gap is not misread.
 */
export function computeSignInCoverage(users: readonly BulkAccUser[]): SignInCoverage {
  const total = users.length;
  const withSignIn = users.filter(
    (user) => user.lastSignIn != null && Number.isFinite(Date.parse(user.lastSignIn)),
  ).length;
  const percent = total === 0 ? 0 : Math.round((withSignIn / total) * 100);
  return { withSignIn, total, percent };
}

export interface FolderProjectCoverage {
  projectsWithFolders: number;
  totalProjects: number;
}

/**
 * How many distinct projects have any folder-permission data vs how many
 * projects exist across the membership feed. Folder crawling is project-sparse
 * (most projects are never crawled), so the Permission-tier donut covers only
 * this crawled subset — surfaced as a caption to avoid over-generalizing.
 */
export function computeFolderProjectCoverage(
  folderRows: readonly GraphFolderPermissionRow[],
  users: readonly BulkAccUser[],
): FolderProjectCoverage {
  const projectsWithFolders = new Set(
    folderRows.map((row) => row.projectId).filter(Boolean),
  ).size;
  const totalProjects = new Set(
    users.flatMap((user) => user.projects.map((project) => project.id)).filter(Boolean),
  ).size;
  return { projectsWithFolders, totalProjects };
}

export function computePermissionTierFinding(folderRows: readonly GraphFolderPermissionRow[]): string {
  if (folderRows.length === 0) return "No folder grants are available yet.";
  const counts = new Map<string, number>();
  for (const row of folderRows) {
    counts.set(row.permType, (counts.get(row.permType) ?? 0) + 1);
  }
  const [tier, count] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return `${tier} is the top folder permission tier with ${count.toLocaleString()} ${plural(count, "grant")}.`;
}

export function buildExecutiveFindings({
  users,
  folderRows,
  now = Date.now(),
}: {
  users: readonly BulkAccUser[];
  folderRows: readonly GraphFolderPermissionRow[];
  now?: number;
}): ExecutiveFindings {
  return {
    activeMembers: computeActiveMembersFinding(users, now),
    adminConcentration: computeAdminConcentrationFinding(users),
    permissionTiers: computePermissionTierFinding(folderRows),
    projectBreadth: computeProjectBreadthFinding(users),
    staleMembers: computeStaleMembersFinding(users, now),
  };
}
