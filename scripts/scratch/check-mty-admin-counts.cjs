const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 1 }),
  });

  try {
    console.log("=== AccDc* ADMIN DATA CENSUS ===");
    const userCount = await prisma.accDcUser.count();
    const companyCount = await prisma.accDcCompany.count();
    const projectCount = await prisma.accDcProject.count();
    const projectUserCount = await prisma.accDcProjectUser.count();
    const projectUserCompanyCount = await prisma.accDcProjectUserCompany.count();

    console.log(`AccDcUser count: ${userCount}`);
    console.log(`AccDcCompany count: ${companyCount}`);
    console.log(`AccDcProject count: ${projectCount}`);
    console.log(`AccDcProjectUser count: ${projectUserCount}`);
    console.log(`AccDcProjectUserCompany count: ${projectUserCompanyCount}`);

    // Let's see if we can find any MTY projects in AccDcProject
    const mtyProjects = await prisma.accDcProject.findMany({
      where: {
        OR: [
          { name: { contains: "mty", mode: "insensitive" } },
          { name: { contains: "monterrey", mode: "insensitive" } },
        ]
      },
      select: { id: true, name: true, status: true },
      take: 10
    });
    console.log(`\nMTY projects in AccDcProject (sample, total=${mtyProjects.length}):`);
    console.log(JSON.stringify(mtyProjects, null, 2));

    // Let's check how many users are in these MTY projects in AccDcProjectUser
    if (mtyProjects.length > 0) {
      const mtyProjIds = mtyProjects.map(p => p.id);
      const mtyProjUsers = await prisma.accDcProjectUser.count({
        where: { projectId: { in: mtyProjIds } }
      });
      console.log(`\nTotal users in those sample MTY projects (via AccDcProjectUser): ${mtyProjUsers}`);
    }

  } finally {
    await prisma.$disconnect();
  }
}
main().catch(console.error);
