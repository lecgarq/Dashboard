import "server-only";
import { db } from "@/server/db";
import { summarizeRoles, type RoleSummary } from "@/app/(dashboard)/access-analysis/roleCounts";
import { rankForTier } from "@/app/(dashboard)/access-analysis/folderTerrain";
import {
  TEMPLATE_MTY_ROSTER,
  TEMPLATE_MTY_ROSTER_UPDATED,
  type TemplateRosterMember,
} from "@/lib/acc/template-mty-roster";
import { TEMPLATE_MTY_ID } from "@/lib/acc/template-mty";
import {
  summarizeModuleAccess,
  type ModuleAccessSummary,
} from "@/app/(dashboard)/template-mty/moduleAccess";
import {
  summarizePermissionAccess,
  type PermissionAccessSummary,
} from "@/app/(dashboard)/template-mty/permissionAccess";

const INTERNAL_DOMAIN = "@hermosillo.com";

export interface TemplateMember {
  name: string;
  email: string;
  company: string;
  role: string;
  accessLevel: string;
  isInternal: boolean;
  isAdmin: boolean;
}

export interface CategorySlice {
  name: string;
  value: number;
}

export interface TemplateOverview {
  members: TemplateMember[];
  roleSummary: RoleSummary;
  distinctRoles: number;
  /** Per-module provisioning across the 19 (empty until the roster is filled). */
  moduleSummary: ModuleAccessSummary;
  companies: CategorySlice[];
  memberCount: number;
  adminCount: number;
  companyCount: number;
  /** Date the roster was last captured from ACC (it has no API to refresh). */
  updatedAt: string;
}

function tally(items: string[]): CategorySlice[] {
  const counts = new Map<string, number>();
  for (const x of items) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/** Pure assembly from the committed roster — unit-tested. No I/O. */
export function buildTemplateOverview(
  roster: TemplateRosterMember[],
  updatedAt: string,
): TemplateOverview {
  const members: TemplateMember[] = roster.map((r) => ({
    name: r.name,
    email: r.email,
    company: r.company,
    role: r.role,
    accessLevel: r.accessLevel,
    isInternal: r.email.toLowerCase().endsWith(INTERNAL_DOMAIN),
    isAdmin: r.accessLevel === "Project Admin",
  }));

  const roleSummary = summarizeRoles(roster.map((r) => ({ roles: [r.role] })));
  const moduleSummary = summarizeModuleAccess(
    roster.map((r) => ({ name: r.name, role: r.role, modules: r.modules })),
  );
  const companies = tally(roster.map((r) => r.company));

  return {
    members,
    roleSummary,
    distinctRoles: roleSummary.distinctRoles,
    moduleSummary,
    companies,
    memberCount: roster.length,
    adminCount: members.filter((m) => m.isAdmin).length,
    companyCount: companies.length,
    updatedAt,
  };
}

/** Build the template overview from the committed roster. */
export function loadTemplateOverview(): TemplateOverview {
  return buildTemplateOverview(TEMPLATE_MTY_ROSTER, TEMPLATE_MTY_ROSTER_UPDATED);
}

/**
 * Permission-tier access for the 19 project members: join each member's role to
 * the folder-permission tiers that role holds on the template (live DB). Roles
 * absent from the folder permissions (e.g. Dirección, Contabilidad) land in the
 * summary's `noAccess` bucket.
 */
export async function loadTemplatePermissionAccess(): Promise<PermissionAccessSummary> {
  const rows = await db.$queryRaw<Array<{ role_name: string; perm_type: string }>>`
    SELECT DISTINCT r.name AS role_name, fp."permType" AS perm_type
    FROM "AccFolderPermission" fp
    JOIN "AccRole" r ON r.id = fp."roleId"
    JOIN "AccFolder" f ON f.id = fp."folderId"
    WHERE f."projectId" = ${TEMPLATE_MTY_ID}
  `;
  const rolePermRanks: Record<string, number[]> = {};
  for (const row of rows) {
    (rolePermRanks[row.role_name] ??= []).push(rankForTier(row.perm_type));
  }
  return summarizePermissionAccess(
    TEMPLATE_MTY_ROSTER.map((r) => ({ name: r.name, role: r.role })),
    rolePermRanks,
  );
}
