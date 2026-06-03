const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv/config");

const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
const adapter = new PrismaPg({ connectionString: url, max: 2 });
const p = new PrismaClient({ adapter, log: ["error"] });

(async () => {
  const actions = await p.$queryRawUnsafe(
    `SELECT "rawAction", COUNT(*)::int as cnt FROM "AccActivity" GROUP BY "rawAction" ORDER BY cnt DESC LIMIT 60`
  );
  console.log("=== RAW ACTIONS ===");
  console.log(JSON.stringify(actions, null, 2));

  const services = await p.$queryRawUnsafe(
    `SELECT "service", COUNT(*)::int as cnt FROM "AccActivity" GROUP BY "service" ORDER BY cnt DESC`
  );
  console.log("\n=== SERVICES ===");
  console.log(JSON.stringify(services, null, 2));

  const sources = await p.$queryRawUnsafe(
    `SELECT "sourceFile", COUNT(*)::int as cnt FROM "AccActivity" GROUP BY "sourceFile" ORDER BY cnt DESC`
  );
  console.log("\n=== SOURCE FILES ===");
  console.log(JSON.stringify(sources, null, 2));

  const nullEmail = await p.$queryRawUnsafe(
    `SELECT COUNT(*)::int as total, COUNT(CASE WHEN "userEmail" IS NULL THEN 1 END)::int as null_email FROM "AccActivity"`
  );
  console.log("\n=== EMAIL COVERAGE ===");
  console.log(JSON.stringify(nullEmail, null, 2));

  const dcUserStatus = await p.$queryRawUnsafe(
    `SELECT "status", COUNT(*)::int as cnt FROM "AccDcUser" GROUP BY "status" ORDER BY cnt DESC`
  );
  console.log("\n=== DC USER STATUS ===");
  console.log(JSON.stringify(dcUserStatus, null, 2));

  const dcCompanyCount = await p.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "AccDcCompany"`
  );
  console.log("\n=== DC COMPANIES ===");
  console.log(JSON.stringify(dcCompanyCount, null, 2));

  const folderPerms = await p.$queryRawUnsafe(
    `SELECT "permType", COUNT(*)::int as cnt FROM "AccFolderPermission" GROUP BY "permType" ORDER BY cnt DESC`
  );
  console.log("\n=== FOLDER PERM TYPES ===");
  console.log(JSON.stringify(folderPerms, null, 2));

  const projStatus = await p.$queryRawUnsafe(
    `SELECT "status", COUNT(*)::int as cnt FROM "AccProject" GROUP BY "status" ORDER BY cnt DESC`
  );
  console.log("\n=== PROJECT STATUS ===");
  console.log(JSON.stringify(projStatus, null, 2));

  const memberStatus = await p.$queryRawUnsafe(
    `SELECT "status", COUNT(*)::int as cnt FROM "AccProjectMember" GROUP BY "status" ORDER BY cnt DESC`
  );
  console.log("\n=== MEMBER STATUS ===");
  console.log(JSON.stringify(memberStatus, null, 2));

  const tableCounts = await p.$queryRawUnsafe(`
    SELECT 'AccActivity' as tbl, COUNT(*)::int as cnt FROM "AccActivity"
    UNION ALL SELECT 'AccProject', COUNT(*)::int FROM "AccProject"
    UNION ALL SELECT 'AccProjectMember', COUNT(*)::int FROM "AccProjectMember"
    UNION ALL SELECT 'AccRole', COUNT(*)::int FROM "AccRole"
    UNION ALL SELECT 'AccProjectRole', COUNT(*)::int FROM "AccProjectRole"
    UNION ALL SELECT 'AccFolder', COUNT(*)::int FROM "AccFolder"
    UNION ALL SELECT 'AccFolderPermission', COUNT(*)::int FROM "AccFolderPermission"
    UNION ALL SELECT 'AccDcUser', COUNT(*)::int FROM "AccDcUser"
    UNION ALL SELECT 'AccDcCompany', COUNT(*)::int FROM "AccDcCompany"
    UNION ALL SELECT 'AccDcProject', COUNT(*)::int FROM "AccDcProject"
    UNION ALL SELECT 'AccDcProjectUser', COUNT(*)::int FROM "AccDcProjectUser"
    UNION ALL SELECT 'AccDcProjectUserRole', COUNT(*)::int FROM "AccDcProjectUserRole"
    UNION ALL SELECT 'AccDcProjectUserProduct', COUNT(*)::int FROM "AccDcProjectUserProduct"
    UNION ALL SELECT 'AccDcProjectUserCompany', COUNT(*)::int FROM "AccDcProjectUserCompany"
    UNION ALL SELECT 'AccDcProjectRole', COUNT(*)::int FROM "AccDcProjectRole"
    UNION ALL SELECT 'AccDcProjectProduct', COUNT(*)::int FROM "AccDcProjectProduct"
    UNION ALL SELECT 'AccDcProjectCompany', COUNT(*)::int FROM "AccDcProjectCompany"
    UNION ALL SELECT 'UnresolvedAttribution', COUNT(*)::int FROM "UnresolvedAttribution"
    ORDER BY cnt DESC
  `);
  console.log("\n=== TABLE ROW COUNTS ===");
  console.log(JSON.stringify(tableCounts, null, 2));

  await p.$disconnect();
})();
