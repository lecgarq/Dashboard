const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv/config");

const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
const adapter = new PrismaPg({ connectionString: url, max: 2 });
const p = new PrismaClient({ adapter, log: ["error"] });

(async () => {
  // notify-final-members and save-approval-workflow are both docs/review workflow actions
  await p.$queryRawUnsafe(
    `UPDATE "AccActivity" SET "service" = 'docs' WHERE "service" IS NULL AND "rawAction" IN ('notify-final-members', 'save-approval-workflow')`
  );
  const r = await p.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "AccActivity" WHERE "service" IS NULL`
  );
  console.log("Remaining NULL service rows:", r[0].cnt);
  await p.$disconnect();
})();
