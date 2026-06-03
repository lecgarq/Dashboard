import type { PrismaClient } from "@prisma/client";
import { classifyActivity } from "./activityCategories";

export interface ComplianceViolation {
  id: string;
  /**
   * Stable rule identifier. The four governance rules below use fixed strings;
   * deep findings (lib/acc/deepFindings.ts) supply their own `deep-*` ids, which
   * is why this is a plain string rather than a closed union.
   */
  ruleId: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  /** Short action text shown in the panel's "Action recommendation" badge. */
  recommendation: string;
  /** Non-user subject (folder path, role name, …) when the finding is not user-scoped. */
  subjectLabel?: string;
  userEmail?: string;
  userName?: string | null;
  projectName?: string | null;
  timestamp?: string | null;
  details: Record<string, unknown>;
}

export interface ComplianceSummary {
  score: number; // 0 - 100 compliance health score
  violations: ComplianceViolation[];
  metrics: {
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    auditedUsersCount: number;
  };
}

/**
 * Executes a full security compliance audit across identity, access, and activities.
 */
export async function analyzeGovernanceCompliance(
  db: any,
  now = Date.now(),
): Promise<ComplianceSummary> {
  const violations: ComplianceViolation[] = [];
  const DAY_MS = 86_400_000;

  // 1. Fetch data from DC tables
  const [dcUsers, dcProjectUsers, dcProjectUserProducts, dcProjects, folderPermissions, activities] =
    await Promise.all([
      db.accDcUser.findMany({
        select: { id: true, email: true, name: true, status: true, companyId: true },
      }),
      db.accDcProjectUser.findMany({
        select: { projectId: true, userId: true, status: true },
      }),
      db.accDcProjectUserProduct.findMany({
        select: { projectId: true, userId: true, productKey: true, accessLevel: true },
      }),
      db.accDcProject.findMany({
        select: { id: true, name: true, status: true },
      }),
      db.accFolderPermission.findMany({
        select: {
          id: true,
          permType: true,
          folderId: true,
          folder: {
            select: {
              name: true,
              fullPath: true,
              project: { select: { name: true } },
            },
          },
        },
      }),
      db.accActivity.findMany({
        take: 1000, // Audit latest 1000 activity logs for anomalies
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          userEmail: true,
          rawAction: true,
          createdAt: true,
          projectId: true,
        },
      }),
    ]);

  const userMap = new Map<string, typeof dcUsers[0]>();
  const userByEmailMap = new Map<string, typeof dcUsers[0]>();
  for (const u of dcUsers) {
    if (u.email) {
      userMap.set(u.id, u);
      userByEmailMap.set(u.email.toLowerCase(), u);
    }
  }

  const projectMap = new Map<string, typeof dcProjects[0]>();
  for (const p of dcProjects) {
    projectMap.set(p.id, p);
  }

  // Set of userIds who are Project Admins
  const adminKeys = new Set<string>(); // "userId::projectId"
  const adminUsers = new Set<string>(); // "userId"
  for (const pup of dcProjectUserProducts) {
    if (pup.accessLevel === "project_admin") {
      adminKeys.add(`${pup.userId}::${pup.projectId}`);
      adminUsers.add(pup.userId);
    }
  }

  // --- Rule 1: Orphaned or External Administrative Access ---
  // Any admin whose status is "deleted" or "pending", or who is external but retains admin
  for (const pu of dcProjectUsers) {
    const user = userMap.get(pu.userId);
    if (!user) continue;

    const email = user.email || "";
    const isProjectAdmin = adminKeys.has(`${pu.userId}::${pu.projectId}`);
    const isDeletedOrPending = user.status === "deleted" || user.status === "pending" || pu.status === "deleted";

    if (isProjectAdmin && isDeletedOrPending) {
      const proj = projectMap.get(pu.projectId);
      violations.push({
        id: `ext-adm-${pu.userId}-${pu.projectId}`,
        ruleId: "external-admin",
        severity: "critical",
        title: "Dormant Administrator Access",
        description: `Inactive user ${user.name || email} still holds administrator privileges on active project.`,
        recommendation: "Revoke Admin Status",
        userEmail: email,
        userName: user.name,
        projectName: proj?.name ?? pu.projectId,
        timestamp: null,
        details: {
          userId: user.id,
          userStatus: user.status,
          membershipStatus: pu.status,
          projectId: pu.projectId,
        },
      });
    }
  }

  // --- Rule 2: Over-provisioned Privilege Drift (Stale Admins) ---
  // Admins who have no activity logs in our latest dataset, or last login exceeds 90 days
  const activeUserEmails = new Set<string>();
  const lastActiveByEmail = new Map<string, number>();
  for (const act of activities) {
    const email = act.userEmail?.toLowerCase();
    if (email) {
      activeUserEmails.add(email);
      const time = new Date(act.createdAt).getTime();
      const current = lastActiveByEmail.get(email) ?? 0;
      if (time > current) lastActiveByEmail.set(email, time);
    }
  }

  for (const userId of adminUsers) {
    const user = userMap.get(userId);
    if (!user || !user.email) continue;
    const email = user.email.toLowerCase();

    const lastActive = lastActiveByEmail.get(email);
    const isStale = !lastActive || (now - lastActive) > 90 * DAY_MS;

    if (isStale && user.status === "active") {
      violations.push({
        id: `stale-adm-${userId}`,
        ruleId: "stale-admin",
        severity: "warning",
        title: "Stale Administrator Account",
        description: `Admin user ${user.name || user.email} has been inactive for over 90 days. Privilege pruning recommended.`,
        recommendation: "Prune Inactive Privileges",
        userEmail: user.email,
        userName: user.name,
        projectName: null,
        timestamp: lastActive ? new Date(lastActive).toISOString() : null,
        details: {
          userId: user.id,
          lastActiveDaysAgo: lastActive ? Math.round((now - lastActive) / DAY_MS) : "Never",
        },
      });
    }
  }

  // --- Rule 3: High-Risk Permission Leaks (Full Controllers in Inactive Accounts) ---
  // Any "Full Controller" folder access given to inactive/stale users
  for (const perm of folderPermissions) {
    if (perm.permType === "Full Controller") {
      // Find matching user. Since permissions are role or company based in ACC, if we see them,
      // we check for orphans or external firms with Full Controller permission.
      const path = perm.folder?.fullPath ?? perm.folder?.name ?? "Unknown folder";
      const isExternalLeak = perm.folder?.fullPath?.toLowerCase().includes("external") || false;

      if (isExternalLeak) {
        violations.push({
          id: `dorm-ctrl-${perm.id}`,
          ruleId: "dormant-controller",
          severity: "critical",
          title: "Administrative Folder Exposure",
          description: `Full Controller administrative folder access assigned over shared external path: "${path}"`,
          recommendation: "Audit Path Permissions",
          userEmail: "shared-role-group",
          userName: "Group Permission",
          projectName: perm.folder?.project?.name ?? null,
          timestamp: null,
          details: {
            permId: perm.id,
            folderId: perm.folderId,
            folderPath: path,
          },
        });
      }
    }
  }

  // --- Rule 4: Action Anomaly Detections (Suspicious Out-of-Hours Operations) ---
  // High-impact deletions or administrative edits done in the middle of the night (10 PM to 5 AM) or on weekends
  for (const act of activities) {
    const time = new Date(act.createdAt);
    const hour = time.getHours();
    const day = time.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = day === 0 || day === 6;
    const isNight = hour >= 22 || hour <= 5;

    if (isNight || isWeekend) {
      const classification = classifyActivity(act.rawAction);
      const isHighImpact = classification.category === "delete" || classification.impact === "access-change";

      if (isHighImpact && act.userEmail) {
        const emailLower = act.userEmail.toLowerCase();
        const user = userByEmailMap.get(emailLower);
        const userName = user?.name ?? null;
        const proj = act.projectId ? projectMap.get(act.projectId) : null;
        const projectName = proj?.name ?? null;

        violations.push({
          id: `time-anom-${act.id}`,
          ruleId: "time-anomaly",
          severity: "warning",
          title: "Suspicious Off-Hours Action",
          description: `High-impact administrative action (${act.rawAction}) performed by ${userName || act.userEmail} during off-hours (${isNight ? "Night-shift" : "Weekend"}).`,
          recommendation: "Verify User Identity",
          userEmail: act.userEmail,
          userName,
          projectName,
          timestamp: time.toISOString(),
          details: {
            action: act.rawAction,
            hour,
            isWeekend,
            impact: classification.impact,
          },
        });
      }
    }
  }

  // 2. Compute final compliance score (starts at 100, drops by severity weight)
  let scorePoints = 100;
  let critical = 0;
  let warning = 0;
  let info = 0;

  for (const v of violations) {
    if (v.severity === "critical") {
      critical++;
      scorePoints -= 15;
    } else if (v.severity === "warning") {
      warning++;
      scorePoints -= 5;
    } else {
      info++;
      scorePoints -= 1;
    }
  }

  const finalScore = Math.max(0, Math.min(100, scorePoints));

  return {
    score: finalScore,
    violations,
    metrics: {
      criticalCount: critical,
      warningCount: warning,
      infoCount: info,
      auditedUsersCount: dcUsers.length,
    },
  };
}
