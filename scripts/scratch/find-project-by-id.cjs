const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 1 }),
  });

  try {
    const id = process.argv[2] || "9e22cffe-2b68-458a-8a75-6f85e4533156";
    const project = await prisma.accProject.findUnique({
      where: { id },
    });
    console.log(JSON.stringify(project, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(console.error);
