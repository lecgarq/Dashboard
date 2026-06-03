/**
 * Company/Firm Analytics (DASH-09 / Gap F).
 *
 * Provides analytical aggregations across all Autodesk/APS companies, mapping
 * them into firm tiers (internal vs external vs partners), project presence,
 * active member distributions, and rolling activity volumes.
 */

import type { ActiveTier } from "./activeUserTiers";

export type FirmType = "Internal" | "External" | "Consultant" | "Partner";

export interface CompanyInputUser {
  id: string;
  email: string | null;
  companyId: string | null;
  activeTier: ActiveTier;
  activityCount: number;
  projectCount: number;
}

export interface CompanyInputJoin {
  companyId: string;
  projectId: string;
  userId: string;
}

export interface CompanyInputMeta {
  id: string;
  name: string;
}

export interface CompanyAnalyticsInput {
  companies: CompanyInputMeta[];
  users: CompanyInputUser[];
  projectUserCompanies: CompanyInputJoin[];
}

export interface CompanyStat {
  companyId: string;
  companyName: string;
  memberCount: number;
  projectCount: number;
  activityCount: number;
  firmType: FirmType;
  activeTiers: Record<ActiveTier, number>;
}

export function classifyFirmType(name: string): FirmType {
  const n = name.toLowerCase();
  if (n.includes("lecg")) return "Internal";
  if (n.includes("client") || n.includes("owner") || n.includes("sponsor")) return "Partner";
  if (
    n.includes("consult") ||
    n.includes("engineer") ||
    n.includes("architect") ||
    n.includes("design") ||
    n.includes("survey")
  ) {
    return "Consultant";
  }
  return "External";
}

export function aggregateCompanyStats(input: CompanyAnalyticsInput): CompanyStat[] {
  const companyMap = new Map<string, CompanyStat>();

  // 1. Initialize stats for all known companies
  for (const c of input.companies) {
    companyMap.set(c.id, {
      companyId: c.id,
      companyName: c.name,
      memberCount: 0,
      projectCount: 0,
      activityCount: 0,
      firmType: classifyFirmType(c.name),
      activeTiers: {
        "7d": 0,
        "30d": 0,
        "90d": 0,
        ">90d": 0,
        "Never": 0,
      },
    });
  }

  // Ensure "Unknown Company" sentinel exists for users with missing/invalid companyId
  const UNKNOWN_ID = "unknown_company";
  if (!companyMap.has(UNKNOWN_ID)) {
    companyMap.set(UNKNOWN_ID, {
      companyId: UNKNOWN_ID,
      companyName: "Unassigned/Unknown Company",
      memberCount: 0,
      projectCount: 0,
      activityCount: 0,
      firmType: "External",
      activeTiers: {
        "7d": 0,
        "30d": 0,
        "90d": 0,
        ">90d": 0,
        "Never": 0,
      },
    });
  }

  // 2. Map users to companies and aggregate
  const userToCompany = new Map<string, string>();
  for (const u of input.users) {
    const cid = u.companyId || UNKNOWN_ID;
    userToCompany.set(u.id, cid);

    const stat = companyMap.get(cid);
    if (stat) {
      stat.memberCount += 1;
      stat.activityCount += u.activityCount;
      stat.activeTiers[u.activeTier] += 1;
    }
  }

  // 3. Compute distinct project counts per company using the join table
  const companyProjects = new Map<string, Set<string>>();
  for (const join of input.projectUserCompanies) {
    const cid = join.companyId || UNKNOWN_ID;
    const set = companyProjects.get(cid) ?? new Set<string>();
    set.add(join.projectId);
    companyProjects.set(cid, set);
  }

  for (const [cid, projects] of companyProjects.entries()) {
    const stat = companyMap.get(cid);
    if (stat) {
      stat.projectCount = projects.size;
    }
  }

  // If some companies had no joins but had users, default project counts to 0
  const stats = Array.from(companyMap.values());

  // Filter out companies that have zero members to avoid noise
  return stats.filter((s) => s.memberCount > 0 || s.companyId !== UNKNOWN_ID);
}
