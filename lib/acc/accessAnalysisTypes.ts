// lib/acc/accessAnalysisTypes.ts

const TIME_WINDOWS = ["30d", "90d", "1y", "all"] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];

export const CHANGE_STREAMS = [
  "membership",   // user.added | user.removed | user.activated | user.deactivated
  "permission",   // role.* | permission.* (non-admin)
  "project",      // project.member.added | project.member.removed
  "admin",        // role change → projectAdmin | accountAdmin
] as const;
export type ChangeStreamId = (typeof CHANGE_STREAMS)[number];

export interface ChangeStreamMeta {
  id: ChangeStreamId;
  label: string;
  color: string; // hsl(...) — must match Tailwind CSS variable equivalents
  description: string;
}

export const CHANGE_STREAM_META: Record<ChangeStreamId, ChangeStreamMeta> = {
  membership: {
    id: "membership",
    label: "Membership churn",
    color: "hsl(210 80% 55%)",
    description: "Users joined, left, activated, or deactivated.",
  },
  permission: {
    id: "permission",
    label: "Permission drift",
    color: "hsl(270 60% 55%)",
    description: "Role or permission tier changes.",
  },
  project: {
    id: "project",
    label: "Project access",
    color: "hsl(180 65% 45%)",
    description: "Users added to or removed from projects.",
  },
  admin: {
    id: "admin",
    label: "Admin grants",
    color: "hsl(35 90% 55%)",
    description: "projectAdmin or accountAdmin role assignments.",
  },
};

export type TimelineBin = "day" | "week" | "month";

export interface KpiSummary {
  members: { value: number; delta: number };
  accessChanges: { value: number; delta: number };
  activeAdmins: { value: number; delta: number };
  staleMembers: { value: number; delta: number };
  /** ISO string — earliest AccActivity row in the data, used for the chart's empty-window line. */
  dataEarliestEvent: string | null;
}

export interface HeadlineEvent {
  stream: ChangeStreamId;
  /** Display text (already includes who/what/when). */
  headline: string;
  /** ISO date string. */
  occurredAt: string;
  /** Subject user — autodeskId. */
  subjectAutodeskId: string | null;
  subjectEmail: string | null;
  /** Optional context: projectId or new role. */
  projectId: string | null;
  newRole: string | null;
  impactScore: number;
}
