import "server-only";
import { summarizeRoles, type RoleSummary } from "@/app/(dashboard)/access-analysis/roleCounts";
import {
  TEMPLATE_MTY_ROSTER,
  TEMPLATE_MTY_ROSTER_UPDATED,
  type TemplateRosterMember,
} from "@/lib/acc/template-mty-roster";

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
  /** Project Admin vs Project Member split. */
  accessLevels: CategorySlice[];
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
  const accessLevels = tally(roster.map((r) => r.accessLevel));
  const companies = tally(roster.map((r) => r.company));

  return {
    members,
    roleSummary,
    distinctRoles: roleSummary.distinctRoles,
    accessLevels,
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
