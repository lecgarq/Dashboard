#!/usr/bin/env node
/**
 * scripts/scratch/acc-governance-audit.cjs
 *
 * Advanced ACC Governance & License Optimization Audit Tool.
 * Uses extracted database telemetry to generate high-value administrative insights:
 *
 * 1. ACC License Cost-Optimization (Idle Members Audit)
 * 2. IP Protection & Data Security (High Deletion Volume Audit)
 * 3. Coordination Champions (RFI & Issue Resolution Leaders)
 */

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("==========================================================================");
    console.log("           LECG / HERMOSILLO ADVANCED ACC GOVERNANCE AUDIT REPORT          ");
    console.log("==========================================================================\n");

    // ==========================================================================
    // AUDIT 1: LICENSE OPTIMIZATION (IDLE MEMBERS AUDIT)
    // Find project members who have had ZERO activities in the last 30 days.
    // Reclaiming idle licenses can save thousands of dollars in ACC seat costs!
    // ==========================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" [AUDIT 1] LICENSE COST-OPTIMIZATION: IDLE PROJECT MEMBERS (LAST 30 DAYS)");
    console.log("--------------------------------------------------------------------------");

    // Let's get the distinct active users in AccActivity in the last 30 days
    const activeEmailsResult = await prisma.$queryRaw`
      SELECT DISTINCT LOWER("userEmail") as email
      FROM "AccActivity"
      WHERE "userEmail" IS NOT NULL 
        AND "createdAt" >= NOW() - INTERVAL '30 days'
    `;
    const activeEmails = new Set(activeEmailsResult.map(r => r.email.trim()));

    // Get all project members from AccMemberCache extracting from JSONB
    const allMembers = await prisma.$queryRaw`
      SELECT 
        LOWER("email") as email, 
        data->>'name' as "name", 
        data->>'company' as "companyName",
        data->>'status' as "status"
      FROM "AccMemberCache"
      WHERE "email" IS NOT NULL
    `;

    // Unique members mapping
    const uniqueMembersMap = new Map();
    allMembers.forEach(m => {
      if (m.email) {
        const emailLower = m.email.trim();
        if (!uniqueMembersMap.has(emailLower)) {
          uniqueMembersMap.set(emailLower, {
            name: m.name || "Unknown Name",
            company: m.companyName || "No Company Specified",
            status: m.status || "active"
          });
        }
      }
    });

    const idleMembers = [];
    uniqueMembersMap.forEach((info, email) => {
      if (!activeEmails.has(email) && info.status === "active") {
        idleMembers.push({ email, ...info });
      }
    });

    console.log(`Total Active ACC Users Registered : ${uniqueMembersMap.size}`);
    console.log(`Active Users with Activity (30d)  : ${activeEmails.size}`);
    console.log(`Idle Users (0 Activity Logs 30d)  : ${idleMembers.length}`);
    if (uniqueMembersMap.size > 0) {
      console.log(`Potential License Reclaim Rate    : ${((idleMembers.length / uniqueMembersMap.size) * 100).toFixed(1)}%`);
    }

    if (idleMembers.length > 0) {
      console.log("\nSample of Idle Members (Candidates for Seat Reallocation):");
      idleMembers.slice(0, 15).forEach((m, idx) => {
        console.log(`  ${idx + 1}. [${m.company}] ${m.name} <${m.email}>`);
      });
      if (idleMembers.length > 15) {
        console.log(`  ... and ${idleMembers.length - 15} more idle accounts.`);
      }
    } else {
      console.log("\n✅ All registered members have been active! Excellent seat utilization.");
    }

    // ==========================================================================
    // AUDIT 2: IP SECURITY & PROTECTION (POTENTIAL DELETIONS AUDIT)
    // Identify users executing high volume of File Deletion activities.
    // ==========================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" [AUDIT 2] IP SECURITY & IP PROTECTION: HIGH DELETION ACTIVITY AUDIT");
    console.log("--------------------------------------------------------------------------");

    const deletions = await prisma.$queryRaw`
      SELECT 
        LOWER(a."userEmail") as "userEmail", 
        a."projectId", 
        COUNT(*)::int as cnt
      FROM "AccActivity" a
      WHERE a."rawAction" IN ('File Deleted', 'delete-entity', 'delete-sheet', 'asset-delete')
        AND a."userEmail" IS NOT NULL
      GROUP BY LOWER(a."userEmail"), a."projectId"
      ORDER BY cnt DESC
      LIMIT 10
    `;

    if (deletions.length > 0) {
      console.log("Top Users by Deletion Event Volume:");
      for (let i = 0; i < deletions.length; i++) {
        const item = deletions[i];
        const proj = await prisma.accProject.findUnique({
          where: { id: item.projectId },
          select: { name: true }
        });
        const dcProj = await prisma.accDcProject.findUnique({
          where: { id: item.projectId },
          select: { name: true }
        });
        const pName = proj?.name || dcProj?.name || item.projectId;
        console.log(`  #${i + 1}. User: <${item.userEmail}> | Project: "${pName}" | Deletions: ${item.cnt} logs`);
      }
    } else {
      console.log("✅ Zero file deletion logs found in the system. Excellent data integrity!");
    }

    // ==========================================================================
    // AUDIT 3: COORDINATION LEADERS (RFI & ISSUE RESOLUTION CHAMPIONS)
    // Find which users are completing/closing the most RFIs and Issues.
    // ==========================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" [AUDIT 3] COORDINATION CHAMPIONS: RFI & ISSUE INTERACTIONS");
    console.log("--------------------------------------------------------------------------");

    // Let's do a broad count of RFI and Issue updates to find the most active coordinator
    const broadCoordinators = await prisma.$queryRaw`
      SELECT 
        LOWER(a."userEmail") as "userEmail", 
        COUNT(*)::int as cnt
      FROM "AccActivity" a
      WHERE (a."rawAction" LIKE 'issue-%' OR a."rawAction" LIKE 'rfi-%')
        AND a."userEmail" IS NOT NULL
      GROUP BY LOWER(a."userEmail")
      ORDER BY cnt DESC
      LIMIT 10
    `;

    if (broadCoordinators.length > 0) {
      console.log("Top Design Coordinators (Most RFI/Issue Interactions):");
      broadCoordinators.forEach((champ, idx) => {
        console.log(`  #${idx + 1}. Coordinator: <${champ.userEmail}> | Interactions: ${champ.cnt.toLocaleString()}`);
      });
    } else {
      console.log("✅ No coordinator interactions found in the current activity log.");
    }
    console.log("==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
