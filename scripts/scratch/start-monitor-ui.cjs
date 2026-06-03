#!/usr/bin/env node
/**
 * scripts/scratch/start-monitor-ui.cjs
 *
 * Standalone desktop progress monitor UI. Every quota-consuming command is
 * checked by the backend command center before a child process can start.
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { exec, spawn } = require("node:child_process");

const {
  HARD_DAILY_CAP,
  SAFE_DAILY_BUDGET,
  buildPreflight,
  findDbActiveRun,
  getActiveProcessRun,
  getCommandDefinition,
  getCommandScriptPath,
  getQuotaUsage,
  quotaRemainders,
} = require("./monitor-command-center.cjs");

require("dotenv").config();

let PrismaClient;
let PrismaPg;
try {
  PrismaClient = require("@prisma/client").PrismaClient;
  PrismaPg = require("@prisma/adapter-pg").PrismaPg;
} catch (error) {
  console.error("Prisma loading failed, DB features will be disabled:", error.message);
}

let PORT = Number(process.env.MONITOR_PORT || process.env.PORT || 6262);
const REPO_ROOT = path.join(__dirname, "../..");
const FOLDER_LOG_PATH = path.join(REPO_ROOT, "logs/finish-partials-20260601.log");
const ACTIVITY_LOG_PATH = path.join(REPO_ROOT, "logs/mty-activity-extract.log");
const HTML_FILE_PATH = path.join(__dirname, "monitor-ui.html");
const AUTODESK_EFFECTIVE_SCOPE =
  "openid data:read data:create viewables:read user:read account:read";

const defaultActiveProcesses = {
  folder: null,
  activity: null,
  backward: null,
  bulk: null,
};

let defaultPrisma = null;
let defaultPrismaInitialized = false;

function ensureLogDirectory() {
  const logsDir = path.dirname(FOLDER_LOG_PATH);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

function getDefaultPrisma() {
  if (defaultPrismaInitialized) return defaultPrisma;
  defaultPrismaInitialized = true;

  if (!PrismaClient || !PrismaPg) return null;

  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.warn("No DATABASE_URL or DIRECT_URL environment variable found.");
    return null;
  }

  defaultPrisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 2 }),
    log: ["error"],
  });
  console.log("Database connection configured for dashboard APIs.");
  return defaultPrisma;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

function readLogFile(logPath) {
  if (!fs.existsSync(logPath)) return "";

  try {
    const raw = fs.readFileSync(logPath);
    if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
      return raw.toString("utf16le");
    }

    const utf16 = raw.toString("utf16le");
    if (
      utf16.includes("[folder-crawl]") ||
      utf16.includes("[mty-extract") ||
      utf16.includes("[backward-slice") ||
      utf16.includes("[bulk-backward") ||
      utf16.includes("[dc-daily-ingest")
    ) {
      return utf16;
    }

    return raw.toString("utf8");
  } catch (error) {
    console.error(`Error reading log file at ${logPath}:`, error);
    return "";
  }
}

function getLogPathForCommand(type) {
  const command = getCommandDefinition(type);
  return command?.logType === "activity" ? ACTIVITY_LOG_PATH : FOLDER_LOG_PATH;
}

function dashboardAutodeskLoginUrl() {
  const dashboardBase = (process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000")
    .replace(/\/+$/, "");
  return `${dashboardBase}/login?connect=autodesk&callbackUrl=${encodeURIComponent("/")}&forceConsent=1`;
}

function openUrl(execImpl, url) {
  const command =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  execImpl(command);
}

function getAutodeskScopeDisplay(account) {
  if (!account) return "None";
  if (account.scope) return account.scope;
  if (account.access_token || account.refresh_token) return AUTODESK_EFFECTIVE_SCOPE;
  return "None";
}

function isLiveProcess(proc) {
  return Boolean(proc && proc.killed !== true && proc.exitCode == null);
}

function getActivityProcess(activeProcesses) {
  return ["activity", "backward", "bulk"].find((type) => isLiveProcess(activeProcesses[type]));
}

async function getQuotaAndBackfillInfo(prisma) {
  if (!prisma) {
    return { error: "Database connection not available" };
  }

  try {
    const quota = await getQuotaUsage(prisma);
    const remainders = quotaRemainders(quota.quotaUsedToday);

    let totalProjects = 0;
    let lowValueSkipped = 0;
    let uninitialized = 0;
    let projNeedingBackward = 0;
    let backwardSlices = 0;
    let projNeedingForward = 0;
    let forwardSlices = 0;

    if (prisma.accDcProject?.findMany && prisma.accDcBackfillProgress?.findMany) {
      const now = new Date();
      const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const yesterday = new Date(utcToday.getTime() - 86400000);

      const [projects, backfills, minActivity] = await Promise.all([
        prisma.accDcProject.findMany({
          select: { id: true, name: true, status: true, createdAt: true },
        }),
        prisma.accDcBackfillProgress.findMany(),
        prisma.$queryRawUnsafe
          ? prisma.$queryRawUnsafe(
              'SELECT "projectId", MIN("createdAt") AS min_ts FROM "AccActivity" WHERE "projectId" IS NOT NULL GROUP BY "projectId"',
            )
          : [],
      ]);

      totalProjects = projects.length;
      const backfillMap = new Map(backfills.map((row) => [row.projectId, row]));
      const minMap = new Map(
        minActivity.map((row) => [row.projectId, row.min_ts ? new Date(row.min_ts) : null]),
      );
      const lowValuePattern = /\b(demo|template|test|sandbox|training|capacitacion|migracion|prueba|not use)\b/i;

      for (const project of projects) {
        const name = String(project.name || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        if (
          lowValuePattern.test(name) ||
          project.status === "archived" ||
          project.status === "inactive"
        ) {
          lowValueSkipped += 1;
          continue;
        }

        const progress = backfillMap.get(project.id);
        const floor =
          project.createdAt ||
          minMap.get(project.id) ||
          new Date(utcToday.getTime() - 2 * 365 * 86400000);

        if (!progress || !progress.earliestCovered || !progress.latestCovered || progress.newProjectFlag) {
          uninitialized += 1;
          continue;
        }

        const earliest = new Date(progress.earliestCovered);
        const latest = new Date(progress.latestCovered);

        if (earliest.getTime() > floor.getTime()) {
          const gapDays = (earliest.getTime() - floor.getTime()) / 86400000;
          const steps = Math.ceil(gapDays / 30);
          backwardSlices += steps;
          if (steps > 0) projNeedingBackward += 1;
        }

        if (latest.getTime() < yesterday.getTime()) {
          forwardSlices += 1;
          projNeedingForward += 1;
        }
      }
    }

    const perProjectSlices = backwardSlices + forwardSlices + uninitialized;
    const packedForwardNew = Math.ceil((forwardSlices + uninitialized) / 50) || 0;
    const packedEstimate = backwardSlices + packedForwardNew;

    let autodeskAccount = null;
    if (prisma.account?.findFirst) {
      autodeskAccount = await prisma.account.findFirst({
        where: { provider: "autodesk" },
        select: {
          scope: true,
          access_token: true,
          refresh_token: true,
          user: { select: { email: true } },
        },
      });
    }

    return {
      quotaUsedToday: quota.quotaUsedToday,
      runQuota: quota.runQuota,
      legacyQuota: quota.legacyQuota,
      remainingSafe: remainders.safeRemaining,
      remainingHard: remainders.hardRemaining,
      hardCap: HARD_DAILY_CAP,
      safeBudget: SAFE_DAILY_BUDGET,
      totalProjects,
      lowValueSkipped,
      uninitialized,
      projNeedingBackward,
      backwardSlices,
      projNeedingForward,
      forwardSlices,
      perProjectSlices,
      packedEstimate,
      daysWorstCase: Math.ceil(perProjectSlices / HARD_DAILY_CAP),
      daysPacked: Math.ceil(packedEstimate / HARD_DAILY_CAP),
      userEmail: autodeskAccount?.user?.email || "Unknown",
      userScopes: getAutodeskScopeDisplay(autodeskAccount),
    };
  } catch (error) {
    console.error("Error calculating quota status:", error);
    return { error: error.message };
  }
}

function streamLogs(req, res, type) {
  const logPath = type === "activity" ? ACTIVITY_LOG_PATH : FOLDER_LOG_PATH;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  let lastContentLength = readLogFile(logPath).length;

  const intervalId = setInterval(() => {
    if (!fs.existsSync(logPath)) return;

    try {
      const content = readLogFile(logPath);
      if (content.length <= lastContentLength) return;

      const newContent = content.slice(lastContentLength);
      lastContentLength = content.length;
      const lines = newContent.split(/\r?\n/).filter(Boolean);

      if (lines.includes("__EOF__")) {
        res.write("data: __EOF__\n\n");
      }

      const visibleLines = lines.filter((line) => line !== "__EOF__");
      if (visibleLines.length > 0) {
        res.write(`data: ${JSON.stringify({ lines: visibleLines })}\n\n`);
      }
    } catch {
      // Ignore transient file locks while the child process writes.
    }
  }, 1000);

  req.on("close", () => {
    clearInterval(intervalId);
  });
}

function buildActiveStatus(activeProcesses, prisma) {
  const folderRunning = isLiveProcess(activeProcesses.folder);
  const activityType = getActivityProcess(activeProcesses);
  const processRun = getActiveProcessRun(activeProcesses);

  return Promise.resolve()
    .then(() => findDbActiveRun(prisma))
    .catch(() => null)
    .then((dbRun) => ({
      folderRunning,
      activityRunning: Boolean(activityType || dbRun),
      runningCommand: activityType || (folderRunning ? "folder" : null),
      activeRun: processRun || dbRun,
      processRun,
      dbRun,
    }));
}

function createMonitorServer(options = {}) {
  ensureLogDirectory();

  const prisma = Object.prototype.hasOwnProperty.call(options, "prisma")
    ? options.prisma
    : getDefaultPrisma();
  const activeProcesses = options.activeProcesses || defaultActiveProcesses;
  const spawnImpl = options.spawnImpl || spawn;
  const execImpl = options.execImpl || exec;
  const repoRoot = options.repoRoot || REPO_ROOT;
  const htmlFilePath = options.htmlFilePath || HTML_FILE_PATH;
  let launchInProgress = false;

  return http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

    if (parsedUrl.pathname === "/api/stream-logs") {
      const type = parsedUrl.searchParams.get("type") === "activity" ? "activity" : "folder";
      streamLogs(req, res, type);
      return;
    }

    if (parsedUrl.pathname === "/api/logs") {
      const type = parsedUrl.searchParams.get("type") === "activity" ? "activity" : "folder";
      const logPath = type === "activity" ? ACTIVITY_LOG_PATH : FOLDER_LOG_PATH;
      const lines = readLogFile(logPath).split(/\r?\n/).filter(Boolean);
      sendJson(res, 200, { lines });
      return;
    }

    if (parsedUrl.pathname === "/api/quota-status") {
      sendJson(res, 200, await getQuotaAndBackfillInfo(prisma));
      return;
    }

    if (parsedUrl.pathname === "/api/preflight") {
      const type = parsedUrl.searchParams.get("type");
      const preflight = await buildPreflight(type, { prisma, activeProcesses });
      sendJson(res, getCommandDefinition(type) ? 200 : 400, preflight);
      return;
    }

    if (parsedUrl.pathname === "/api/trigger-crawl") {
      const type = parsedUrl.searchParams.get("type");

      if (type === "login") {
        const loginUrl = dashboardAutodeskLoginUrl();
        console.log(`Opening Autodesk session upgrade in the dashboard: ${loginUrl}`);
        openUrl(execImpl, loginUrl);
        sendJson(res, 200, {
          success: true,
          message: "Autodesk session upgrade opened in the dashboard browser.",
          url: loginUrl,
        });
        return;
      }

      const command = getCommandDefinition(type);
      if (!command) {
        sendJson(res, 400, {
          success: false,
          error: `Unknown command type "${type}".`,
        });
        return;
      }

      if (launchInProgress) {
        sendJson(res, 409, {
          success: false,
          error: "Another command is already passing through the backend launch gate.",
        });
        return;
      }

      launchInProgress = true;
      try {
        const preflight = await buildPreflight(type, { prisma, activeProcesses });
        if (!preflight.allowed) {
          sendJson(res, 409, {
            success: false,
            error: preflight.reason,
            preflight,
          });
          return;
        }

        const scriptPath = getCommandScriptPath(type, __dirname);
        const logPath = getLogPathForCommand(type);

        try {
          fs.writeFileSync(logPath, "");
        } catch {
          // If the log is locked, append instead of interrupting an existing writer.
        }

        const logStream = fs.createWriteStream(logPath, { flags: "a" });
        const args = [scriptPath];
        console.log(`Spawning backend-approved command ${type}: ${process.execPath} ${args.join(" ")}`);

        const proc = spawnImpl(process.execPath, args, {
          cwd: repoRoot,
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
        });

        if (proc.stdout?.pipe) proc.stdout.pipe(logStream, { end: false });
        if (proc.stderr?.pipe) proc.stderr.pipe(logStream, { end: false });

        activeProcesses[type] = proc;

        proc.on?.("close", (code) => {
          console.log(`${type} command completed with exit code: ${code}`);
          activeProcesses[type] = null;
          const exitText = code === 0 ? "COMPLETED" : "FAILED";
          try {
            logStream.write(`\n__EOF__\n[CRAWL ${exitText} WITH CODE ${code ?? "unknown"}]\n`);
            logStream.end();
          } catch {
            // Stream may already be closed by the OS.
          }
        });

        sendJson(res, 200, {
          success: true,
          message: `${command.label} started after backend preflight.`,
          preflight,
        });
      } catch (error) {
        sendJson(res, 500, {
          success: false,
          error: error.message,
        });
      } finally {
        launchInProgress = false;
      }
      return;
    }

    if (parsedUrl.pathname === "/api/active-status") {
      sendJson(res, 200, await buildActiveStatus(activeProcesses, prisma));
      return;
    }

    if (parsedUrl.pathname === "/" || parsedUrl.pathname === "/index.html") {
      if (fs.existsSync(htmlFilePath)) {
        const htmlContent = fs.readFileSync(htmlFilePath, "utf8");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(htmlContent);
      } else {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error: monitor-ui.html missing");
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  });
}

function startMonitorServer({ port = PORT, launchBrowser = true } = {}) {
  PORT = port || PORT;
  const server = createMonitorServer();

  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log("======================================================");
    console.log("Crawl Live Monitor Server successfully running!");
    console.log(`Access at: ${url}`);
    console.log("======================================================");

    if (!launchBrowser) return;

    let launchCmd = "";
    if (process.platform === "win32") {
      launchCmd = `start msedge --app=${url} --window-size=1280,820`;
    } else if (process.platform === "darwin") {
      launchCmd = `open -a "Google Chrome" --args --app=${url}`;
    } else {
      launchCmd = `xdg-open ${url}`;
    }

    exec(launchCmd, (error) => {
      if (!error) return;
      const fallbackCmd = process.platform === "win32" ? `start ${url}` : `open ${url}`;
      exec(fallbackCmd);
    });
  });

  return server;
}

module.exports = {
  createMonitorServer,
  dashboardAutodeskLoginUrl,
  getQuotaAndBackfillInfo,
  startMonitorServer,
};

if (require.main === module) {
  const envPort = process.env.MONITOR_PORT || process.env.PORT;
  startMonitorServer({
    port: envPort ? Number(envPort) : PORT,
    launchBrowser: true,
  });
}
