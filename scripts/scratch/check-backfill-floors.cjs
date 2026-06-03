const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  const pool = new (require("pg").Pool)({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("=== AUDITING PROJECT CREATION FLOORS VS EARLIEST COVERAGE ===\n");

    const projects = await prisma.accProject.findMany({
      where: {
        status: "active",
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      }
    });

    const backfills = await prisma.accDcBackfillProgress.findMany({
      select: {
        projectId: true,
        earliestCovered: true,
        latestCovered: true
      }
    });

    const backfilledMap = new Map(backfills.map(b => [b.projectId, b]));

    let pendingBackwardCount = 0;
    const candidates = [];

    projects.forEach(p => {
      const b = backfilledMap.get(p.id);
      if (b && b.earliestCovered) {
        // Floor date is createdAt (or a reasonable floor)
        const floor = p.createdAt;
        const earliest = b.earliestCovered;
        
        // If earliest covered is after the project creation date, we have more history we can extract!
        if (floor && earliest > floor) {
          const diffDays = Math.ceil((earliest - floor) / (1000 * 60 * 60 * 24));
          if (diffDays > 1) { // Ignore minor rounding
            pendingBackwardCount++;
            candidates.push({
              id: p.id,
              name: p.name,
              floor: floor.toISOString().slice(0, 10),
              earliestCovered: earliest.toISOString().slice(0, 10),
              diffDays
            });
          }
        }
      }
    });

    console.log(`Total active projects checked: ${projects.length}`);
    console.log(`Projects with pending historical data (earliestCovered > createdAt): ${pendingBackwardCount}`);
    
    if (candidates.length > 0) {
      console.log("\nTop 15 candidates with missing historical data:");
      console.log("==========================================================================================================");
      console.log("   PROJECT NAME                                | CREATED AT | EARLIEST COVERED | MISSING DAYS");
      console.log("==========================================================================================================");
      candidates.sort((a,b) => b.diffDays - a.diffDays).slice(0, 15).forEach(c => {
        console.log(`   ${c.name.padEnd(43)} | ${c.floor} | ${c.earliestCovered}      | ${c.diffDays} days`);
      });
      console.log("==========================================================================================================");
    } else {
      console.log("\n✅ Amazing! Every project's coverage has successfully reached its inception floor (createdAt date)!");
    }

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
main().catch(console.error);
