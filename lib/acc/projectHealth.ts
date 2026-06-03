/**
 * Project Health Score Engine (DASH-10 / Gap H).
 *
 * Computes a comprehensive health score in [0, 100] per project.
 * High-fidelity components (weighted 25% each):
 *   - Ingest / crawl status completeness (Docs crawl coverage)
 *   - Member activity ratio (proportion of members active in last 90 days)
 *   - Permission hygiene (penalty based on folder-permission orphans)
 *   - Role hygiene (penalty based on junk / duplicate / mismatched roles)
 */

export interface ProjectHealthInput {
  projectId: string;
  projectName: string;
  crawlStatus: string; // "ok" | "partial" | "never" | "failed" | "inaccessible"
  totalMembers: number;
  activeMembers: number; // active in last 90 days
  orphanCount: number;
  roleDiscrepancyCount: number;
}

export interface ProjectHealthResult {
  score: number;
  crawlScore: number;
  activityScore: number;
  orphanScore: number;
  roleScore: number;
  status: "Critical" | "At Risk" | "Healthy" | "Excellent";
}

export function computeProjectHealth(input: ProjectHealthInput): ProjectHealthResult {
  // 1. Crawl Score (25%)
  let crawlScore = 0;
  const cs = (input.crawlStatus || "").toLowerCase();
  if (cs === "ok") crawlScore = 100;
  else if (cs === "partial") crawlScore = 70;
  else if (cs === "failed") crawlScore = 20;
  else if (cs === "inaccessible") crawlScore = 10;
  else if (cs === "never") crawlScore = 0;

  // 2. Activity Score (25%)
  let activityScore = 0;
  if (input.totalMembers > 0) {
    const ratio = Math.max(0, Math.min(1, input.activeMembers / input.totalMembers));
    activityScore = Math.round(ratio * 100);
  }

  // 3. Permission Hygiene / Orphan Score (25%)
  // Subtract 10 points per folder-level orphan, down to 0
  const orphanScore = Math.max(0, 100 - input.orphanCount * 10);

  // 4. Role Hygiene Score (25%)
  // Subtract 10 points per role discrepancy/junk-role found, down to 0
  const roleScore = Math.max(0, 100 - input.roleDiscrepancyCount * 10);

  // Combined Health Score
  const weighted =
    crawlScore * 0.25 +
    activityScore * 0.25 +
    orphanScore * 0.25 +
    roleScore * 0.25;

  const score = Math.round(weighted);

  // Determine Project Health Status
  let status: ProjectHealthResult["status"] = "Critical";
  if (score >= 85) status = "Excellent";
  else if (score >= 60) status = "Healthy";
  else if (score >= 35) status = "At Risk";

  return {
    score,
    crawlScore,
    activityScore,
    orphanScore,
    roleScore,
    status,
  };
}
