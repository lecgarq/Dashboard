const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 1 }),
  });

  try {
    console.log("=== MTY DC JOBS IN DB ===");
    const jobIds = ["cmph1bgga0000koz4deufmfng", "cmph1feq30mchkoz4sv31742u"];
    const jobs = await prisma.accDataConnectorJob.findMany({
      where: { id: { in: jobIds } }
    });

    console.log(JSON.stringify(jobs, null, 2));

  } finally {
    await prisma.$disconnect();
  }
}
main().catch(console.error);
