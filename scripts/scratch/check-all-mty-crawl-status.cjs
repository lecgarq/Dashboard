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
        OR: [
          { name: { contains: "mty", mode: "insensitive" } },
          { name: { contains: "monterrey", mode: "insensitive" } },
        ]
      },
      select: { id: true, name: true, folderCrawlStatus: true },
      orderBy: { name: "asc" }
    });

    console.log(`=== ALL MONTERREY PROJECTS IN DB (Total: ${projects.length}) ===`);
    projects.forEach((p, idx) => {
      if (p.folderCrawlStatus !== "never") {
        console.log(`${idx + 1}. [${p.folderCrawlStatus}] ${p.name} (${p.id})`);
      }
    });

  } finally {
    await prisma.$disconnect();
  }
}
main().catch(console.error);
