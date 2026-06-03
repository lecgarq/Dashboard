const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const dotenv = (() => {
  try { return require("dotenv"); } catch { return null; }
})();
if (dotenv) dotenv.config();

const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL or DIRECT_URL must be set");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, max: 1 }),
});

async function main() {
  console.log("\n=== MONTERREY/MTY DB SYNCHRONIZATION CENSUS ===\n");

  // 1. Monterrey projects overall status
  const mtyProjects = await prisma.accProject.findMany({
    where: {
      OR: [
        { name: { contains: "mty", mode: "insensitive" } },
        { name: { contains: "monterrey", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      status: true,
      folderCrawlStatus: true,
    },
  });

  console.log(`Monterrey Projects in Local DB: ${mtyProjects.length}`);
  const crawlStatusCounts = {};
  mtyProjects.forEach((p) => {
    crawlStatusCounts[p.folderCrawlStatus] = (crawlStatusCounts[p.folderCrawlStatus] || 0) + 1;
  });
  console.log("Folder Crawl Status Breakdown:");
  Object.entries(crawlStatusCounts).forEach(([status, count]) => {
    console.log(`  • ${status}: ${count}`);
  });

  // 2. Count folders and permissions for Monterrey projects
  const mtyProjectIds = mtyProjects.map((p) => p.id);
  const folderCount = await prisma.accFolder.count({
    where: { projectId: { in: mtyProjectIds } },
  });
  const permissionCount = await prisma.accFolderPermission.count({
    where: { folder: { projectId: { in: mtyProjectIds } } },
  });

  console.log(`\nFolders / Permissions for Monterrey Projects:`);
  console.log(`  • Total Folders Indexed: ${folderCount}`);
  console.log(`  • Total Folder-Role Permissions Mapped: ${permissionCount}`);

  // 3. Activity counts
  const activityCount = await prisma.accActivity.count({
    where: { projectId: { in: mtyProjectIds } },
  });
  console.log(`\nActivity Telemetry for Monterrey Projects (last 30 days):`);
  console.log(`  • Total Ingested Activity Logs: ${activityCount}`);

  // 4. Progressive backfill coverage
  const backfills = await prisma.accDcBackfillProgress.findMany({
    where: { projectId: { in: mtyProjectIds } },
  });
  console.log(`\nProgressive Backfill Coverage (Data Connector):`);
  console.log(`  • Mapped Backfills: ${backfills.length}`);
  if (backfills.length > 0) {
    const earliest = new Date(Math.min(...backfills.map(b => b.earliestCovered ? b.earliestCovered.getTime() : Date.now())));
    const latest = new Date(Math.max(...backfills.map(b => b.latestCovered ? b.latestCovered.getTime() : 0)));
    console.log(`  • Earliest Date Covered: ${earliest.toISOString().split('T')[0]}`);
    console.log(`  • Latest Date Covered: ${latest.toISOString().split('T')[0]}`);
  }

  // 5. Unresolved Attribution (if any)
  const unresolved = await prisma.unresolvedAttribution.count();
  console.log(`\nUnresolved User Attributions (Forensics): ${unresolved}`);
}

main()
  .catch((err) => console.error("Error running census:", err))
  .finally(async () => {
    await prisma.$disconnect();
  });
