const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 1 }),
  });

  try {
    const stats = await prisma.accProject.groupBy({
      by: ["folderCrawlStatus"],
      _count: true,
    });
    console.log("=== FOLDER CRAWL STATUS GROUPING ===");
    console.log(JSON.stringify(stats, null, 2));

    const failedOrPartial = await prisma.accProject.findMany({
      where: {
        status: "active",
        folderCrawlStatus: { in: ["failed", "partial"] }
      },
      select: { id: true, name: true, folderCrawlStatus: true },
      orderBy: { name: "asc" }
    });
    console.log("\n=== FAILED OR PARTIAL PROJECTS ===");
    console.log(JSON.stringify(failedOrPartial, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(console.error);
