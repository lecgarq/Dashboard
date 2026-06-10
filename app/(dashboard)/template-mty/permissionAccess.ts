import { TIER_LEGEND } from "@/app/(dashboard)/access-analysis/folderTerrain";

export interface TierRoleBreakdown {
  role: string;
  userCount: number;
}

export interface TierAccess {
  rank: number; // 1..5
  label: string; // from TIER_LEGEND
  userCount: number; // distinct members whose role grants this tier ≥ once
  roles: TierRoleBreakdown[]; // contributing roles, desc by user count
}

export interface PermissionAccessSummary {
  /** Present tiers, ordered by rank desc (Full control → View only). */
  tiers: TierAccess[];
  /** Members whose role holds no folder permission at all. */
  noAccess: { userCount: number; roles: string[] };
  memberCount: number;
}

const RANK_LABEL = new Map(TIER_LEGEND.map((t) => [t.rank, t.label]));

/**
 * For each permission tier, which roles — and how many of the given members in
 * them — hold that tier somewhere in the template's folder tree.
 *
 * `rolePermRanks` maps a role NAME to the tier ranks it holds anywhere. A role
 * can grant several tiers, so a member is counted under every tier their role
 * grants — these are per-tier reach counts, not a partition (the panel says so).
 */
export function summarizePermissionAccess(
  members: ReadonlyArray<{ name: string; role: string }>,
  rolePermRanks: Record<string, number[]>,
): PermissionAccessSummary {
  const byRank = new Map<number, Map<string, number>>();
  const noAccessRoles = new Set<string>();
  let noAccessUsers = 0;

  for (const m of members) {
    const ranks = rolePermRanks[m.role] ?? [];
    if (ranks.length === 0) {
      noAccessUsers += 1;
      if (m.role) noAccessRoles.add(m.role);
      continue;
    }
    for (const rank of new Set(ranks)) {
      const roleMap = byRank.get(rank) ?? new Map<string, number>();
      roleMap.set(m.role, (roleMap.get(m.role) ?? 0) + 1);
      byRank.set(rank, roleMap);
    }
  }

  const tiers: TierAccess[] = [...byRank.entries()]
    .map(([rank, roleMap]) => {
      const roles = [...roleMap.entries()]
        .map(([role, userCount]) => ({ role, userCount }))
        .sort((a, b) => b.userCount - a.userCount || a.role.localeCompare(b.role));
      const userCount = roles.reduce((s, r) => s + r.userCount, 0);
      return { rank, label: RANK_LABEL.get(rank) ?? `Tier ${rank}`, userCount, roles };
    })
    .sort((a, b) => b.rank - a.rank);

  return {
    tiers,
    noAccess: { userCount: noAccessUsers, roles: [...noAccessRoles].sort((a, b) => a.localeCompare(b)) },
    memberCount: members.length,
  };
}
