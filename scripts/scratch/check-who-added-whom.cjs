#!/usr/bin/env node
/**
 * scripts/scratch/check-who-added-whom.cjs
 *
 * Direct Database Invitation / Addition Tracker.
 * Parses "assign-member" and "assign-admin" activity logs
 * to trace exactly WHO added WHOM, on which date, and for which project.
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
    console.log("             LECG / HERMOSILLO ACC INVITATION AUDIT: WHO ADDED WHOM       ");
    console.log("==========================================================================\n");

    // Fetch raw invitation actions
    console.log("[audit] Querying 'assign-member' and 'assign-admin' activity logs...");
    const invitations = await prisma.accActivity.findMany({
      where: {
        rawAction: {
          in: ["assign-member", "assign-admin"]
        },
        details: {
          not: null
        }
      },
      select: {
        id: true,
        autodeskId: true, // The Inviter's Autodesk ID
        userEmail: true,   // The Inviter's resolved Email
        projectId: true,
        rawAction: true,
        details: true,     // The Invitee's Name
        createdAt: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 15
    });

    console.log(`[audit] Mapped ${invitations.length} recent invitation logs. Resolving actor details...\n`);

    if (invitations.length === 0) {
      console.log("✅ No invitation logs found in the current date range.");
      return;
    }

    for (let i = 0; i < invitations.length; i++) {
      const item = invitations[i];
      const inviteeName = item.details;

      // 1. Resolve Inviter details (from AccMemberCache)
      let inviterName = "Unknown Inviter";
      const inviterRow = await prisma.$queryRaw`
        SELECT data->>'name' as name
        FROM "AccMemberCache"
        WHERE LOWER("email") = LOWER(${item.userEmail || ""}) 
           OR "id" = ${item.autodeskId}
        LIMIT 1
      `;
      if (inviterRow.length > 0 && inviterRow[0].name) {
        inviterName = inviterRow[0].name;
      }

      // 2. Try to find invitee email from AccMemberCache using name
      let inviteeEmail = "unknown-email";
      const inviteeRow = await prisma.$queryRaw`
        SELECT email
        FROM "AccMemberCache"
        WHERE LOWER(data->>'name') = LOWER(${inviteeName})
        LIMIT 1
      `;
      if (inviteeRow.length > 0 && inviteeRow[0].email) {
        inviteeEmail = inviteeRow[0].email;
      }

      // 3. Resolve Project Name
      const proj = await prisma.accProject.findUnique({
        where: { id: item.projectId || "" },
        select: { name: true }
      });
      const dcProj = await prisma.accDcProject.findUnique({
        where: { id: item.projectId || "" },
        select: { name: true }
      });
      const pName = proj?.name || dcProj?.name || item.projectId || "Hub Administration";

      // Output clean invitation relationship
      console.log(`📍 Addition #${i + 1} [Joined: ${item.createdAt.toISOString().split('T')[0]}]`);
      console.log(`   Project : "${pName}"`);
      console.log(`   Action  : "${item.rawAction}"`);
      console.log(`   👤 INVITER (Added by) : ${inviterName} <${item.userEmail || "unknown-email"}>`);
      console.log(`   👤 INVITEE (New User) : ${inviteeName} <${inviteeEmail}>`);
      console.log("--------------------------------------------------------------------------");
    }

    console.log("\n==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
