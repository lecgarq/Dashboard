#!/usr/bin/env node
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // WARNING 21: VELOCITY SPIKE
    console.log("--- WARNING 21: VELOCITY SPIKE ---");
    const velocity = await prisma.$queryRaw`
      WITH daily AS (
        SELECT LOWER("userEmail") as email, DATE("createdAt") as d, COUNT(*)::int as cnt
        FROM "AccActivity" WHERE "userEmail" IS NOT NULL
        GROUP BY LOWER("userEmail"), DATE("createdAt")
      ),
      stats AS (
        SELECT email, AVG(cnt)::numeric as avg_daily, MAX(cnt)::int as peak_daily, COUNT(*)::int as active_days
        FROM daily GROUP BY email HAVING COUNT(*) >= 5 AND AVG(cnt) >= 5
      )
      SELECT s.email, ROUND(s.avg_daily,1) as avg_daily, s.peak_daily,
             ROUND(s.peak_daily / NULLIF(s.avg_daily,0),1) as spike_ratio, s.active_days
      FROM stats s WHERE s.peak_daily / NULLIF(s.avg_daily,0) >= 10
      ORDER BY spike_ratio DESC LIMIT 10
    `;
    velocity.forEach((v,i) => console.log(`  #${i+1}. <${v.email}> avg:${v.avg_daily}/day peak:${v.peak_daily} spike:${v.spike_ratio}x days:${v.active_days}`));

    // WARNING 22: WEEKEND WARRIORS
    console.log("\n--- WARNING 22: WEEKEND WARRIORS ---");
    const ww = await prisma.$queryRaw`
      SELECT LOWER("userEmail") as email, EXTRACT(DOW FROM "createdAt")::int as dow, COUNT(*)::int as cnt
      FROM "AccActivity" WHERE "userEmail" IS NOT NULL AND EXTRACT(DOW FROM "createdAt") IN (0,6)
      GROUP BY LOWER("userEmail"), EXTRACT(DOW FROM "createdAt") HAVING COUNT(*) >= 50
      ORDER BY cnt DESC LIMIT 10
    `;
    ww.forEach((w,i) => { const day = w.dow===0?"Sunday":"Saturday"; console.log(`  #${i+1}. <${w.email}> ${w.cnt} actions on ${day}s`); });

    // WARNING 23: RUBBER-STAMP
    console.log("\n--- WARNING 23: RUBBER-STAMP APPROVALS ---");
    const rs = await prisma.$queryRaw`
      WITH approvers AS (
        SELECT LOWER("userEmail") as email, "projectId", COUNT(*)::int as approvals
        FROM "AccActivity" WHERE "rawAction" IN ('set-approval-status','review-push-approval-status')
          AND "userEmail" IS NOT NULL AND "projectId" IS NOT NULL AND "projectId" <> ''
        GROUP BY LOWER("userEmail"), "projectId" HAVING COUNT(*) >= 10
      ),
      viewers AS (
        SELECT DISTINCT LOWER("userEmail") as email, "projectId"
        FROM "AccActivity" WHERE "rawAction" IN ('view-entity','view-sheet','view-existing-review')
          AND "userEmail" IS NOT NULL AND "projectId" IS NOT NULL AND "projectId" <> ''
      )
      SELECT a.email, a."projectId", a.approvals, p.name as "projectName"
      FROM approvers a LEFT JOIN viewers v ON a.email=v.email AND a."projectId"=v."projectId"
      LEFT JOIN "AccProject" p ON p.id=a."projectId"
      WHERE v.email IS NULL ORDER BY a.approvals DESC LIMIT 10
    `;
    if (rs.length > 0) rs.forEach((r,i) => console.log(`  #${i+1}. <${r.email}> approved ${r.approvals} docs in "${r.projectName}" — NEVER viewed`));
    else console.log("  ✅ All approvers have corresponding view logs.");

  } finally { await prisma.$disconnect(); await pool.end(); }
}
main().catch(console.error);
