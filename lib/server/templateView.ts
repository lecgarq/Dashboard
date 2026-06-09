import "server-only";
import { db } from "@/server/db";
import { summarizeRoles, type RoleSummary } from "@/app/(dashboard)/access-analysis/roleCounts";
import { reduceModules } from "@/app/(dashboard)/access-analysis/modules";
import type { ModuleId } from "@/app/(dashboard)/access-analysis/types";
import {
  summarizeProvisionedModules,
  type ProvisionedModuleSummary,
} from "@/app/(dashboard)/template-mty/provisionedModules";
import { TEMPLATE_MTY_ID } from "@/lib/acc/template-mty";

const INTERNAL_DOMAIN = "@hermosillo.com";

/** Raw per-member row as read from AccProjectMember (+ joined role names). */
export interface TemplateMemberRow {
  name: string;
  email: string;
  companyName: string | null;
  products: Record<string, string>;
  projectAdmin: boolean;
  roleNames: string[];
}

export interface TemplateMember {
  name: string;
  email: string;
  company: string | null;
  roleNames: string[];
  modules: ModuleId[];
  isInternal: boolean;
  isAdmin: boolean;
}

export interface TemplateOverview {
  members: TemplateMember[];
  roleSummary: RoleSummary;
  distinctRoles: number;
  moduleSummary: ProvisionedModuleSummary;
  companies: Array<{ name: string; value: number }>;
  memberCount: number;
  companyCount: number;
  syncedAt: string | null;
}

/** Pure assembly — unit-tested. No I/O. */
export function buildTemplateOverview(
  rows: TemplateMemberRow[],
  syncedAt: string | null,
): TemplateOverview {
  const members: TemplateMember[] = rows.map((r) => {
    const productRows = Object.entries(r.products ?? {}).map(([productKey, accessLevel]) => ({
      productKey,
      accessLevel: String(accessLevel ?? ""),
    }));
    const { modules } = reduceModules(productRows);
    return {
      name: r.name,
      email: r.email,
      company: r.companyName,
      roleNames: r.roleNames,
      modules,
      isInternal: r.email.toLowerCase().endsWith(INTERNAL_DOMAIN),
      isAdmin: r.projectAdmin,
    };
  });

  const roleSummary = summarizeRoles(rows.map((r) => ({ roles: r.roleNames })));
  const moduleSummary = summarizeProvisionedModules(rows);

  const companyCounts = new Map<string, number>();
  for (const r of rows) {
    const name = r.companyName ?? "Unknown company";
    companyCounts.set(name, (companyCounts.get(name) ?? 0) + 1);
  }
  const companies = [...companyCounts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  return {
    members,
    roleSummary,
    distinctRoles: roleSummary.distinctRoles,
    moduleSummary,
    companies,
    memberCount: rows.length,
    companyCount: companies.length,
    syncedAt,
  };
}

/** DB-backed loader: reads the seeded template members + roles, then builds. */
export async function loadTemplateOverview(): Promise<TemplateOverview> {
  const members = await db.accProjectMember.findMany({
    where: { projectId: TEMPLATE_MTY_ID },
    select: {
      name: true,
      email: true,
      companyName: true,
      products: true,
      projectAdmin: true,
      syncedAt: true,
      roles: { select: { role: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });

  const rows: TemplateMemberRow[] = members.map((m) => ({
    name: m.name,
    email: m.email,
    companyName: m.companyName,
    products: (m.products ?? {}) as Record<string, string>,
    projectAdmin: m.projectAdmin,
    roleNames: m.roles.map((r) => r.role.name),
  }));

  const syncedAt =
    members.reduce<Date | null>((max, m) => (!max || m.syncedAt > max ? m.syncedAt : max), null)?.toISOString() ?? null;

  return buildTemplateOverview(rows, syncedAt);
}
