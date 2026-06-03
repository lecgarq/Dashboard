const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 1 }),
  });

  try {
    const projects = await prisma.accProject.findMany({
      where: {
        status: "active",
        folderCrawlStatus: { in: ["never", "failed", "partial"] },
        OR: [
          { name: { contains: "mty", mode: "insensitive" } },
          { name: { contains: "monterrey", mode: "insensitive" } },
        ]
      },
      select: { id: true, name: true, folderCrawlStatus: true },
      orderBy: { name: "asc" }
    });

    console.log("=== PENDING CRAWLS ===");
    console.log(JSON.stringify(projects, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(console.error);
