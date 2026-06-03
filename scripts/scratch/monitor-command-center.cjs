const path = require("node:path");

const HARD_DAILY_CAP = 25;
const SAFE_DAILY_BUDGET = 20;
const BATCH_SIZE_LIMIT = 50;
const BACKWARD_MIN_START = new Date("2026-02-22T00:00:00.000Z");

const COMMAND_REGISTRY = Object.freeze({
  folder: Object.freeze({
    type: "folder",
    label: "MTY Folder Crawl",
    scriptName: "run-bulk-mty-folders.cjs",
    logType: "folder",
    baseCost: 0,
    quotaConsuming: false,
    riskLevel: "low",
  }),
  activity: Object.freeze({
    type: "activity",
    label: "MTY Activity Sync",
    scriptName: "extract-mty-data.cjs",
    logType: "activity",
    baseCost: null,
    quotaConsuming: true,
    riskLevel: "medium",
  }),
  backward: Object.freeze({
    type: "backward",
    label: "Single Backward Slice Backfill",
    scriptName: "submit-backward-slice.cjs",
    logType: "activity",
    baseCost: null,
    quotaConsuming: true,
    riskLevel: "medium",
  }),
  bulk: Object.freeze({
    type: "bulk",
    label: "Bulk Backward Slices",
    scriptName: "submit-more-slices.cjs",
    logType: "activity",
    baseCost: null,
    quotaConsuming: true,
    riskLevel: "high",
  }),
});

function getCommandDefinition(type) {
  return COMMAND_REGISTRY[type] || null;
}

function getCommandScriptPath(type, baseDir = __dirname) {
  const command = getCommandDefinition(type);
  if (!command) return null;
  return path.join(baseDir, command.scriptName);
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function chunkCount(projectCount) {
  return projectCount > 0 ? Math.ceil(projectCount / BATCH_SIZE_LIMIT) : 0;
}

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesMty(project) {
  const name = normalizeName(project.name);
  return name.includes("mty") || name.includes("monterrey");
}

async function findMtyProjects(prisma, { activeOnly = false, folderStatuses = null } = {}) {
  if (!prisma?.accProject?.findMany) {
    throw new Error("accProject.findMany is unavailable; cannot estimate command cost.");
  }

  const where = {
    OR: [
      { name: { contains: "mty", mode: "insensitive" } },
      { name: { contains: "monterrey", mode: "insensitive" } },
    ],
  };
  if (activeOnly) where.status = "active";
  if (folderStatuses) where.folderCrawlStatus = { in: folderStatuses };

  const projects = await prisma.accProject.findMany({
    where,
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      folderCrawlStatus: true,
    },
    orderBy: { name: "asc" },
  });

  return projects.filter((project) => {
    if (!matchesMty(project)) return false;
    if (activeOnly && project.status !== "active") return false;
    if (folderStatuses && !folderStatuses.includes(project.folderCrawlStatus)) return false;
    return true;
  });
}

async function findBackwardCandidates(prisma) {
  if (!prisma?.accProject?.findMany || !prisma?.accDcBackfillProgress?.findMany) {
    throw new Error("Backfill project tables are unavailable; cannot estimate command cost.");
  }

  const [projects, backfills] = await Promise.all([
    prisma.accProject.findMany({
      where: { status: "active" },
      select: { id: true, name: true, createdAt: true, status: true },
    }),
    prisma.accDcBackfillProgress.findMany({
      select: { projectId: true, earliestCovered: true },
    }),
  ]);

  const backfillMap = new Map(backfills.map((row) => [row.projectId, row]));
  const candidates = [];

  for (const project of projects) {
    if (project.status !== "active") continue;
    const progress = backfillMap.get(project.id);
    const floor = toDate(project.createdAt);
    const earliest = toDate(progress?.earliestCovered);
    if (!floor || !earliest) continue;
    if (earliest <= floor || earliest < BACKWARD_MIN_START) continue;

    const diffDays = Math.ceil((earliest.getTime() - floor.getTime()) / 86400000);
    if (diffDays <= 5) continue;

    candidates.push({
      id: project.id,
      name: project.name,
      diffDays,
    });
  }

  candidates.sort((a, b) => b.diffDays - a.diffDays);
  return candidates;
}

async function estimateCommandCost(type, prisma) {
  const command = getCommandDefinition(type);
  if (!command) {
    throw new Error(`Unknown command type "${type}".`);
  }

  if (type === "folder") {
    const projects = await findMtyProjects(prisma, {
      activeOnly: true,
      folderStatuses: ["never", "partial", "failed"],
    });
    return {
      type,
      cost: 0,
      estimatedBatches: 0,
      plannedProjects: projects.length,
      totalCandidates: projects.length,
      noWork: projects.length === 0,
      description: `${projects.length} folder projects, no Data Connector quota`,
    };
  }

  if (type === "activity") {
    const projects = await findMtyProjects(prisma);
    const batches = chunkCount(projects.length);
    return {
      type,
      cost: batches,
      estimatedBatches: batches,
      plannedProjects: projects.length,
      totalCandidates: projects.length,
      noWork: projects.length === 0,
      description: `${batches} requests, ${projects.length} local MTY projects`,
    };
  }

  const candidates = await findBackwardCandidates(prisma);

  if (type === "backward") {
    const plannedProjects = Math.min(candidates.length, BATCH_SIZE_LIMIT);
    const cost = plannedProjects > 0 ? 1 : 0;
    return {
      type,
      cost,
      estimatedBatches: cost,
      plannedProjects,
      totalCandidates: candidates.length,
      noWork: plannedProjects === 0,
      description: `${cost} request, ${plannedProjects} projects`,
    };
  }

  if (type === "bulk") {
    const remaining = candidates.slice(BATCH_SIZE_LIMIT);
    const batches = chunkCount(remaining.length);
    return {
      type,
      cost: batches,
      estimatedBatches: batches,
      plannedProjects: remaining.length,
      totalCandidates: candidates.length,
      noWork: remaining.length === 0,
      description: `${batches} requests, ${remaining.length} projects`,
    };
  }

  throw new Error(`Unknown command type "${type}".`);
}

function utcDayRange(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}

async function getQuotaUsage(prisma, now = new Date()) {
  if (!prisma?.accDcIngestRun?.findMany || !prisma?.accDataConnectorJob?.findMany) {
    throw new Error("Quota tables are unavailable; cannot prove daily quota usage.");
  }

  const { start, end } = utcDayRange(now);
  const [runs, legacyJobs] = await Promise.all([
    prisma.accDcIngestRun.findMany({
      where: { startedAt: { gte: start, lt: end } },
      select: { quotaUsed: true, status: true, startedAt: true },
    }),
    prisma.accDataConnectorJob.findMany({
      where: { startedAt: { gte: start, lt: end } },
      select: { requestId: true, status: true, startedAt: true },
    }),
  ]);

  const runQuota = runs.reduce((sum, run) => sum + (Number(run.quotaUsed) || 0), 0);
  const legacyQuota = legacyJobs.length;
  return {
    quotaUsedToday: runQuota + legacyQuota,
    runQuota,
    legacyQuota,
  };
}

function quotaRemainders(quotaUsedToday) {
  const hardRemaining = Math.max(0, HARD_DAILY_CAP - quotaUsedToday);
  const safeRemaining = Math.max(
    0,
    Math.min(SAFE_DAILY_BUDGET - quotaUsedToday, hardRemaining),
  );
  return { hardRemaining, safeRemaining };
}

function getActiveProcessRun(activeProcesses = {}) {
  for (const [type, proc] of Object.entries(activeProcesses || {})) {
    if (!proc || proc.killed === true) continue;
    if (proc.exitCode != null || proc.signalCode != null) continue;
    const command = getCommandDefinition(type);
    return {
      source: "process",
      type,
      label: command?.label || type,
      pid: proc.pid ?? null,
    };
  }
  return null;
}

async function findDbActiveRun(prisma) {
  if (!prisma) return null;

  const [dcRun, legacyJob] = await Promise.all([
    prisma.accDcIngestRun?.findFirst
      ? prisma.accDcIngestRun.findFirst({
          where: { status: "running" },
          orderBy: { startedAt: "desc" },
          select: {
            id: true,
            status: true,
            startedAt: true,
            quotaUsed: true,
            projectsProcessed: true,
          },
        })
      : null,
    prisma.accDataConnectorJob?.findFirst
      ? prisma.accDataConnectorJob.findFirst({
          where: { status: { in: ["pending", "running"] } },
          orderBy: { startedAt: "desc" },
          select: {
            id: true,
            requestId: true,
            status: true,
            startedAt: true,
          },
        })
      : null,
  ]);

  if (dcRun) {
    return {
      source: "db",
      type: "accDcIngestRun",
      id: dcRun.id,
      status: dcRun.status,
      startedAt: dcRun.startedAt,
      quotaUsed: dcRun.quotaUsed ?? null,
      projectsProcessed: dcRun.projectsProcessed ?? null,
    };
  }

  if (legacyJob) {
    return {
      source: "db",
      type: "accDataConnectorJob",
      id: legacyJob.id,
      requestId: legacyJob.requestId ?? null,
      status: legacyJob.status,
      startedAt: legacyJob.startedAt,
    };
  }

  return null;
}

function buildBasePreflight(type, command, quotaUsage, estimate, activeRun = null) {
  const quotaUsedToday = quotaUsage?.quotaUsedToday ?? 0;
  const { hardRemaining, safeRemaining } = quotaRemainders(quotaUsedToday);
  return {
    type,
    command: command
      ? {
          type: command.type,
          label: command.label,
          riskLevel: command.riskLevel,
          quotaConsuming: command.quotaConsuming,
        }
      : null,
    allowed: false,
    reason: "",
    cost: estimate?.cost ?? 0,
    quotaUsedToday,
    hardRemaining,
    safeRemaining,
    hardCap: HARD_DAILY_CAP,
    safeBudget: SAFE_DAILY_BUDGET,
    activeRun,
    estimatedBatches: estimate?.estimatedBatches ?? 0,
    plannedProjects: estimate?.plannedProjects ?? 0,
    totalCandidates: estimate?.totalCandidates ?? 0,
    description: estimate?.description ?? "",
    runQuota: quotaUsage?.runQuota ?? 0,
    legacyQuota: quotaUsage?.legacyQuota ?? 0,
  };
}

async function buildPreflight(type, { prisma, activeProcesses = {}, now = new Date() } = {}) {
  const command = getCommandDefinition(type);
  if (!command) {
    const base = buildBasePreflight(type, null, { quotaUsedToday: 0 }, null);
    base.reason = `Unknown command type "${type}".`;
    return base;
  }

  if (!prisma) {
    const base = buildBasePreflight(type, command, { quotaUsedToday: 0 }, null);
    base.reason = "Database connection is unavailable; backend cannot prove quota safety.";
    return base;
  }

  let quotaUsage;
  let estimate;
  try {
    [quotaUsage, estimate] = await Promise.all([
      getQuotaUsage(prisma, now),
      estimateCommandCost(type, prisma),
    ]);
  } catch (error) {
    const base = buildBasePreflight(type, command, { quotaUsedToday: 0 }, null);
    base.reason = error?.message || "Backend preflight failed.";
    return base;
  }

  const processRun = getActiveProcessRun(activeProcesses);
  if (processRun) {
    const base = buildBasePreflight(type, command, quotaUsage, estimate, processRun);
    base.reason = `${processRun.label} is already running in this monitor process.`;
    return base;
  }

  const dbRun = await findDbActiveRun(prisma);
  if (dbRun && command.quotaConsuming) {
    const base = buildBasePreflight(type, command, quotaUsage, estimate, dbRun);
    base.reason = `A Data Connector job is already running in the database (${dbRun.type}).`;
    return base;
  }

  const base = buildBasePreflight(type, command, quotaUsage, estimate, null);

  if (estimate.noWork && command.quotaConsuming) {
    base.reason = "No eligible projects were found for this Data Connector command.";
    return base;
  }

  if (command.quotaConsuming && quotaUsage.quotaUsedToday + estimate.cost > HARD_DAILY_CAP) {
    base.reason = `Blocked by hard cap: ${quotaUsage.quotaUsedToday} used + ${estimate.cost} requested exceeds ${HARD_DAILY_CAP}.`;
    return base;
  }

  base.allowed = true;
  base.reason =
    command.quotaConsuming && quotaUsage.quotaUsedToday + estimate.cost > SAFE_DAILY_BUDGET
      ? "Allowed under hard cap; this consumes reserve quota beyond the safe budget."
      : "Ready. Server preflight approved this command.";
  return base;
}

module.exports = {
  BACKWARD_MIN_START,
  BATCH_SIZE_LIMIT,
  COMMAND_REGISTRY,
  HARD_DAILY_CAP,
  SAFE_DAILY_BUDGET,
  buildPreflight,
  estimateCommandCost,
  findBackwardCandidates,
  findDbActiveRun,
  findMtyProjects,
  getActiveProcessRun,
  getCommandDefinition,
  getCommandScriptPath,
  getQuotaUsage,
  quotaRemainders,
};
