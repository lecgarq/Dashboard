/**
 * User Engagement Score (DASH-08 / Gap E).
 *
 * Computes a multi-signal engagement score in [0, 100] per user.
 * Signals used:
 *   - Recency of last activity (decay over 90 days)
 *   - Volume of activity (log-scaled count of total rows)
 *   - Diversity of activity (fraction of 15 typical distinct raw actions)
 *   - Project breadth (fraction of 5 projects)
 *   - Module diversity (fraction of 4 modules)
 *   - Permission reach (log-scaled count of accessible folder permissions)
 *
 * Weight allocation:
 *   - Recency: 30%
 *   - Volume: 25%
 *   - Diversity: 15%
 *   - Breadth: 15%
 *   - Modules: 10%
 *   - Permissions: 5%
 */

import { differenceInDays } from "date-fns";

export interface EngagementInput {
  /** ISO 8601 string or Date or timestamp representing last activity/sign-in. */
  lastSignIn: string | Date | number | null | undefined;
  activityCount: number;
  /** Count of distinct rawAction strings. */
  distinctActionCount: number;
  projectCount: number;
  distinctModuleCount: number;
  permissionCount: number;
}

export interface EngagementBreakdown {
  score: number;
  recency: number;
  volume: number;
  diversity: number;
  breadth: number;
  modules: number;
  permissions: number;
  tier: "Dormant" | "Low" | "Moderate" | "High" | "Power";
}

export function computeUserEngagement(
  input: EngagementInput,
  now: Date = new Date(),
): EngagementBreakdown {
  // 1. Recency Score (30%)
  let recency = 0;
  if (input.lastSignIn != null) {
    const lastDate = typeof input.lastSignIn === "object"
      ? input.lastSignIn
      : new Date(input.lastSignIn);
    if (!Number.isNaN(lastDate.getTime())) {
      const days = Math.max(0, differenceInDays(now, lastDate));
      recency = Math.max(0, 100 - (days * 100 / 90));
    }
  }

  // 2. Volume Score (25%)
  // log2(x + 1) * 10 -> x=1023 gives 100%
  const volume = Math.min(100, Math.max(0, Math.log2(input.activityCount + 1) * 10));

  // 3. Diversity Score (15%)
  // 15 distinct actions = 100%
  const diversity = Math.min(100, (input.distinctActionCount / 15) * 100);

  // 4. Breadth Score (15%)
  // 5 projects = 100%
  const breadth = Math.min(100, (input.projectCount / 5) * 100);

  // 5. Module Score (10%)
  // 4 modules = 100%
  const modules = Math.min(100, (input.distinctModuleCount / 4) * 100);

  // 6. Permissions Score (5%)
  // log2(x + 1) * 10 -> x=1023 gives 100%
  const permissions = Math.min(100, Math.max(0, Math.log2(input.permissionCount + 1) * 10));

  // Weighted Sum
  const weightedScore =
    recency * 0.30 +
    volume * 0.25 +
    diversity * 0.15 +
    breadth * 0.15 +
    modules * 0.10 +
    permissions * 0.05;

  const score = Math.round(Math.max(0, Math.min(100, weightedScore)));

  // Determine Engagement Tier
  let tier: EngagementBreakdown["tier"] = "Dormant";
  if (score > 80) tier = "Power";
  else if (score > 50) tier = "High";
  else if (score > 20) tier = "Moderate";
  else if (score > 0) tier = "Low";

  return {
    score,
    recency: Math.round(recency),
    volume: Math.round(volume),
    diversity: Math.round(diversity),
    breadth: Math.round(breadth),
    modules: Math.round(modules),
    permissions: Math.round(permissions),
    tier,
  };
}
