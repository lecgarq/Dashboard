import { addUtcDays, endOfUtcDay, startOfUtcDay } from "./activityCoverageMatrix";

export type ExtractionPriorityLane =
  | "use_quota_first"
  | "needs_activity_backfill"
  | "needs_permissions_crawl"
  | "good_coverage"
  | "skip_archived_or_demo";

export type FormalBackfillState =
  | "uninitialized"
  | "new_project"
  | "stale"
  | "current"
  | "partial";

export interface ExtractionPriorityProjectInput {
  id: string;
  name: string | null;
  status: string | null;
  createdAt: Date | null;
  folderCrawlStatus: string | null;
  memberCount: number;
}

export interface ExtractionPriorityActivityInput {
  projectId: string;
  rows: number | bigint;
  activeDays: number | bigint;
  services: string[];
  lastActivityAt: Date | string | null;
}

export interface ExtractionPriorityBackfillInput {
  projectId: string;
  earliestCovered: Date | null;
  latestCovered: Date | null;
  projectCreatedAt: Date;
  newProjectFlag: boolean;
}

export interface BuildExtractionPriorityPlanInput {
  generatedAt: Date;
  windowDays: number;
  projects: ExtractionPriorityProjectInput[];
  activity: ExtractionPriorityActivityInput[];
  backfillProgress: ExtractionPriorityBackfillInput[];
  expectedServices?: string[];
  limit?: number;
  quotaLimit?: number;
}

export interface ExtractionPriorityProject {
  rank: number;
  projectId: string;
  projectName: string;
  status: string | null;
  lane: ExtractionPriorityLane;
  score: number;
  recommendedAction: string;
  reasons: string[];
  activityRows: number;
  activeDays: number;
  activeServices: string[];
  missingServices: string[];
  lastActivityAt: string | null;
  formalBackfillState: FormalBackfillState;
  earliestCovered: string | null;
  latestCovered: string | null;
  folderCrawlStatus: string;
  memberCount: number;
}

const DEFAULT_EXPECTED_SERVICES = ["docs", "issues", "rfis", "submittals", "sheets"];
const LOW_VALUE_NAME_PATTERN = /\b(demo|template|test|sandbox|training|capacitacion|migracion)\b/i;

function toInt(value: number | bigint | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  return value ?? 0;
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}

function normalizeName(project: Pick<ExtractionPriorityProjectInput, "id" | "name">): string {
  return project.name?.trim() || project.id;
}

function normalizeStatus(status: string | null): string {
  return (status ?? "unknown").toLowerCase();
}

function isArchivedOrDemo(project: ExtractionPriorityProjectInput): boolean {
  const status = normalizeStatus(project.status);
  const searchableName = normalizeName(project).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return status === "archived" || status === "inactive" || LOW_VALUE_NAME_PATTERN.test(searchableName);
}

function normalizeServices(services: string[]): string[] {
  return [...new Set(services.map((s) => s.trim().toLowerCase()).filter(Boolean))].sort();
}

function classifyFormalBackfill(
  progress: ExtractionPriorityBackfillInput | undefined,
  currentWindowStart: Date,
): FormalBackfillState {
  if (!progress || !progress.earliestCovered || !progress.latestCovered) return "uninitialized";
  if (progress.newProjectFlag) return "new_project";
  if (progress.latestCovered < currentWindowStart) return "stale";
  if (progress.earliestCovered <= progress.projectCreatedAt) return "current";
  return "partial";
}

function scoreMemberCount(memberCount: number): number {
  if (memberCount >= 50) return 20;
  if (memberCount >= 25) return 15;
  if (memberCount >= 10) return 10;
  if (memberCount > 0) return 5;
  return 0;
}

function recommendedAction(lane: ExtractionPriorityLane): string {
  switch (lane) {
    case "use_quota_first":
      return "Spend Data Connector quota here first.";
    case "needs_activity_backfill":
      return "Queue for activity backfill after the first quota batch.";
    case "needs_permissions_crawl":
      return "Run folder permissions crawl before spending Data Connector quota.";
    case "good_coverage":
      return "Do not spend quota now; keep monitoring freshness.";
    case "skip_archived_or_demo":
      return "Skip for now unless leadership explicitly asks for this project.";
  }
}

function chooseLane(args: {
  lowValue: boolean;
  activityRows: number;
  activeDays: number;
  formalBackfillState: FormalBackfillState;
  folderCrawlStatus: string;
}): ExtractionPriorityLane {
  if (args.lowValue) return "skip_archived_or_demo";
  const needsFormalBackfill =
    args.formalBackfillState === "uninitialized" ||
    args.formalBackfillState === "new_project" ||
    args.formalBackfillState === "stale";
  if (needsFormalBackfill && (args.activityRows === 0 || args.activeDays <= 3)) {
    return "use_quota_first";
  }
  if (needsFormalBackfill) return "needs_activity_backfill";
  if (!["ok", "partial"].includes(args.folderCrawlStatus)) return "needs_permissions_crawl";
  if (args.activityRows === 0 || args.activeDays <= 3) return "needs_activity_backfill";
  return "good_coverage";
}

function laneRank(lane: ExtractionPriorityLane): number {
  switch (lane) {
    case "use_quota_first":
      return 0;
    case "needs_activity_backfill":
      return 1;
    case "needs_permissions_crawl":
      return 2;
    case "good_coverage":
      return 3;
    case "skip_archived_or_demo":
      return 4;
  }
}

function scoreProject(args: {
  lowValue: boolean;
  activityRows: number;
  activeDays: number;
  formalBackfillState: FormalBackfillState;
  folderCrawlStatus: string;
  memberCount: number;
  missingServices: string[];
}): number {
  if (args.lowValue) return -100 + scoreMemberCount(args.memberCount);
  let score = 25 + scoreMemberCount(args.memberCount);
  if (args.activityRows === 0) score += 40;
  else if (args.activeDays <= 3) score += 25;
  else if (args.activeDays <= 10) score += 10;

  if (args.formalBackfillState === "uninitialized") score += 35;
  if (args.formalBackfillState === "new_project") score += 30;
  if (args.formalBackfillState === "stale") score += 25;
  if (args.formalBackfillState === "partial") score += 10;
  if (!["ok", "partial"].includes(args.folderCrawlStatus)) score += 8;
  score += Math.min(12, args.missingServices.length * 3);
  return score;
}

function buildReasons(args: {
  lowValue: boolean;
  project: ExtractionPriorityProjectInput;
  activityRows: number;
  activeDays: number;
  formalBackfillState: FormalBackfillState;
  folderCrawlStatus: string;
  missingServices: string[];
}): string[] {
  const reasons: string[] = [];
  if (args.lowValue) reasons.push("Archived, inactive, demo, template, test, or migration project.");
  if (args.activityRows === 0) reasons.push("No activity rows in the analysis window.");
  else reasons.push(`${args.activityRows.toLocaleString()} activity rows across ${args.activeDays} active day(s).`);
  if (args.formalBackfillState === "uninitialized") reasons.push("Formal backfill tracker has no covered window.");
  if (args.formalBackfillState === "new_project") reasons.push("Backfill tracker marks this as a new project.");
  if (args.formalBackfillState === "stale") reasons.push("Formal backfill latest coverage is older than the current window.");
  if (args.formalBackfillState === "partial") reasons.push("Formal backfill has not reached project creation date.");
  if (!["ok", "partial"].includes(args.folderCrawlStatus)) {
    reasons.push(`Folder permissions crawl status is ${args.folderCrawlStatus}.`);
  }
  if (args.missingServices.length > 0) {
    reasons.push(`No window activity for: ${args.missingServices.join(", ")}.`);
  }
  if (args.project.memberCount > 0) reasons.push(`${args.project.memberCount} known project member(s).`);
  return reasons;
}

function buildSummary(projects: ExtractionPriorityProject[]) {
  const byLane = new Map<ExtractionPriorityLane, number>();
  for (const project of projects) {
    byLane.set(project.lane, (byLane.get(project.lane) ?? 0) + 1);
  }
  return {
    totalProjects: projects.length,
    useQuotaFirst: byLane.get("use_quota_first") ?? 0,
    needsActivityBackfill: byLane.get("needs_activity_backfill") ?? 0,
    needsPermissionsCrawl: byLane.get("needs_permissions_crawl") ?? 0,
    goodCoverage: byLane.get("good_coverage") ?? 0,
    skipArchivedOrDemo: byLane.get("skip_archived_or_demo") ?? 0,
  };
}

export function buildExtractionPriorityPlan(input: BuildExtractionPriorityPlanInput) {
  const expectedServices = normalizeServices(input.expectedServices ?? DEFAULT_EXPECTED_SERVICES);
  const limit = input.limit ?? 75;
  const quotaLimit = input.quotaLimit ?? 5;
  const to = endOfUtcDay(input.generatedAt);
  const from = startOfUtcDay(addUtcDays(to, -input.windowDays + 1));
  const activityByProject = new Map(input.activity.map((row) => [row.projectId, row]));
  const progressByProject = new Map(input.backfillProgress.map((row) => [row.projectId, row]));

  const ranked = input.projects.map((project) => {
    const activity = activityByProject.get(project.id);
    const activeServices = normalizeServices(activity?.services ?? []);
    const missingServices = expectedServices.filter((service) => !activeServices.includes(service));
    const activityRows = toInt(activity?.rows);
    const activeDays = toInt(activity?.activeDays);
    const folderCrawlStatus = (project.folderCrawlStatus ?? "unknown").toLowerCase();
    const progress = progressByProject.get(project.id);
    const formalBackfillState = classifyFormalBackfill(progress, from);
    const lowValue = isArchivedOrDemo(project);
    const lane = chooseLane({
      lowValue,
      activityRows,
      activeDays,
      formalBackfillState,
      folderCrawlStatus,
    });
    const score = scoreProject({
      lowValue,
      activityRows,
      activeDays,
      formalBackfillState,
      folderCrawlStatus,
      memberCount: project.memberCount,
      missingServices,
    });

    return {
      rank: 0,
      projectId: project.id,
      projectName: normalizeName(project),
      status: project.status,
      lane,
      score,
      recommendedAction: recommendedAction(lane),
      reasons: buildReasons({
        lowValue,
        project,
        activityRows,
        activeDays,
        formalBackfillState,
        folderCrawlStatus,
        missingServices,
      }),
      activityRows,
      activeDays,
      activeServices,
      missingServices,
      lastActivityAt: isoOrNull(activity?.lastActivityAt),
      formalBackfillState,
      earliestCovered: isoOrNull(progress?.earliestCovered),
      latestCovered: isoOrNull(progress?.latestCovered),
      folderCrawlStatus,
      memberCount: project.memberCount,
    } satisfies ExtractionPriorityProject;
  });

  ranked.sort(
    (a, b) =>
      laneRank(a.lane) - laneRank(b.lane) ||
      b.score - a.score ||
      b.memberCount - a.memberCount ||
      a.projectName.localeCompare(b.projectName),
  );
  ranked.forEach((project, index) => {
    project.rank = index + 1;
  });

  const quotaCandidates = ranked.filter((project) =>
    project.lane === "use_quota_first" || project.lane === "needs_activity_backfill",
  );
  const quotaProjectLimit = Math.max(0, quotaLimit) * 50;
  const quotaProjectIds = quotaCandidates.slice(0, quotaProjectLimit).map((project) => project.projectId);
  const batches: Array<{
    requestNumber: number;
    projectIds: string[];
    reason: string;
  }> = [];
  for (let i = 0; i < quotaProjectIds.length; i += 50) {
    batches.push({
      requestNumber: batches.length + 1,
      projectIds: quotaProjectIds.slice(i, i + 50),
      reason: "highest-priority activity/backfill gaps",
    });
  }

  return {
    generatedAt: input.generatedAt.toISOString(),
    window: {
      from: from.toISOString(),
      to: to.toISOString(),
      days: input.windowDays,
    },
    expectedServices,
    summary: buildSummary(ranked),
    quotaPlan: {
      requestedQuotaLimit: quotaLimit,
      candidateProjects: quotaProjectIds.length,
      estimatedRequests: batches.length,
      batches,
    },
    rankedProjects: ranked.slice(0, limit),
  };
}
