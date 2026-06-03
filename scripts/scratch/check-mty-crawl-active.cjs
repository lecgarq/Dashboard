const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 1 }),
  });

  try {
    const proj = await prisma.accProject.findUnique({
      where: { id: "76cbed2a-2d75-4d80-a7ca-1197bb5fcb2d" },
      select: { name: true, folderCrawlStatus: true }
    });
    console.log("Project 9 Status in DB:", proj);
    
    const count = await prisma.accFolder.count({
      where: { projectId: "76cbed2a-2d75-4d80-a7ca-1197bb5fcb2d" }
    });
    console.log("Current folders indexed for Project 9:", count);

    const permCount = await prisma.accFolderPermission.count({
      where: { folder: { projectId: "76cbed2a-2d75-4d80-a7ca-1197bb5fcb2d" } }
    });
    console.log("Current folder permissions mapped for Project 9:", permCount);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(console.error);
