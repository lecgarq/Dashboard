#!/usr/bin/env node
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

async function safeCount(model) {
  if (!model) return 0;
  try {
    return await model.count();
  } catch (err) {
    return 0;
  }
}

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const [
      // Auth / Core Models
      users,
      accounts,
      sessions,
      approvedEmails,
      pendingRequests,
      userModuleAccess,
      
      // Project & Relational Live Models
      projects,
      projectMembers,
      roles,
      projectRoles,
      folders,
      folderPermissions,
      activities,
      unresolvedAttributions,
      dcJobs,
      
      // DC Snapshot Parallel Tables
      dcUsers,
      dcCompanies,
      dcProjects,
      dcAccounts,
      dcBusinessUnits,
      dcRoles,
      dcProjectUsers,
      dcProjectUserRoles,
      dcProjectUserProducts,
      dcProjectUserCompanies,
      dcProjectUserServices,
      dcProjectRoles,
      dcProjectProducts,
      dcProjectCompanies,
      dcProjectServices,
      dcAccountServices,
      dcIngestRuns,
      dcBackfillProgress,
      
      // Module 1: Parametric Families
      families,
      familyChangelog,
      familyAttachments,
      familyDeliverables,
      
      // Module 2: Clash Detection
      clashWikis,
      clashTasks,
      clashReleases,
      
      // Module 3: Sim Automation & Revit Exams
      simWikis,
      simTasks,
      simReleases,
      revitExams,
      examBuildTasks,
      examResults,
      
      // Tasks & LOD Checker
      userTasks,
      taskAttachments,
      lodFamilies,
      lodEmbeddings,
      lodGraphNodes,
      lodCategories,
      
      // Caches
      accMemberCache,
      accHubRoleCache,
      accGraphLayoutCache
    ] = await Promise.all([
      safeCount(prisma.user),
      safeCount(prisma.account),
      safeCount(prisma.session),
      safeCount(prisma.approvedEmail),
      safeCount(prisma.pendingRequest),
      safeCount(prisma.userModuleAccess),
      
      safeCount(prisma.accProject),
      safeCount(prisma.accProjectMember),
      safeCount(prisma.accRole),
      safeCount(prisma.accProjectRole),
      safeCount(prisma.accFolder),
      safeCount(prisma.accFolderPermission),
      safeCount(prisma.accActivity),
      safeCount(prisma.unresolvedAttribution),
      safeCount(prisma.accDataConnectorJob),
      
      safeCount(prisma.accDcUser),
      safeCount(prisma.accDcCompany),
      safeCount(prisma.accDcProject),
      safeCount(prisma.accDcAccount),
      safeCount(prisma.accDcBusinessUnit),
      safeCount(prisma.accDcRole),
      safeCount(prisma.accDcProjectUser),
      safeCount(prisma.accDcProjectUserRole),
      safeCount(prisma.accDcProjectUserProduct),
      safeCount(prisma.accDcProjectUserCompany),
      safeCount(prisma.accDcProjectUserService),
      safeCount(prisma.accDcProjectRole),
      safeCount(prisma.accDcProjectProduct),
      safeCount(prisma.accDcProjectCompany),
      safeCount(prisma.accDcProjectService),
      safeCount(prisma.accDcAccountService),
      safeCount(prisma.accDcIngestRun),
      safeCount(prisma.accDcBackfillProgress),
      
      safeCount(prisma.family),
      safeCount(prisma.familyChangelog),
      safeCount(prisma.familyAttachment),
      safeCount(prisma.familyDeliverable),
      
      safeCount(prisma.clashWiki),
      safeCount(prisma.clashTask),
      safeCount(prisma.clashToolRelease),
      
      safeCount(prisma.simWiki),
      safeCount(prisma.simTask),
      safeCount(prisma.simToolRelease),
      safeCount(prisma.revitExam),
      safeCount(prisma.examBuildTask),
      safeCount(prisma.examResult),
      
      safeCount(prisma.userTask),
      safeCount(prisma.taskAttachment),
      safeCount(prisma.lodFamily),
      safeCount(prisma.lodEmbedding),
      safeCount(prisma.lodGraphNode),
      safeCount(prisma.lodCategory),
      
      safeCount(prisma.accMemberCache),
      safeCount(prisma.accHubRoleCache),
      safeCount(prisma.accGraphLayoutCache)
    ]);

    const categories = [
      {
        name: "1. Core & Auth System",
        tables: [
          { name: "User", count: users },
          { name: "Account", count: accounts },
          { name: "Session", count: sessions },
          { name: "ApprovedEmail", count: approvedEmails },
          { name: "PendingRequest", count: pendingRequests },
          { name: "UserModuleAccess", count: userModuleAccess }
        ]
      },
      {
        name: "2. Live ACC Relational Layer",
        tables: [
          { name: "AccProject (Live)", count: projects },
          { name: "AccProjectMember (Live)", count: projectMembers },
          { name: "AccRole (Live)", count: roles },
          { name: "AccProjectRole (Live)", count: projectRoles },
          { name: "AccFolder (Live Filesystem)", count: folders },
          { name: "AccFolderPermission (Live Permissions)", count: folderPermissions },
          { name: "AccActivity (All-Time Activity Logs)", count: activities },
          { name: "UnresolvedAttribution", count: unresolvedAttributions },
          { name: "AccDataConnectorJob (Sync Telemetry)", count: dcJobs }
        ]
      },
      {
        name: "3. Autodesk Data Connector (DC) Snapshots",
        tables: [
          { name: "AccDcUser", count: dcUsers },
          { name: "AccDcCompany", count: dcCompanies },
          { name: "AccDcProject", count: dcProjects },
          { name: "AccDcAccount", count: dcAccounts },
          { name: "AccDcBusinessUnit", count: dcBusinessUnits },
          { name: "AccDcRole", count: dcRoles },
          { name: "AccDcProjectUser", count: dcProjectUsers },
          { name: "AccDcProjectUserRole", count: dcProjectUserRoles },
          { name: "AccDcProjectUserProduct", count: dcProjectUserProducts },
          { name: "AccDcProjectUserCompany", count: dcProjectUserCompanies },
          { name: "AccDcProjectUserService", count: dcProjectUserServices },
          { name: "AccDcProjectRole", count: dcProjectRoles },
          { name: "AccDcProjectProduct", count: dcProjectProducts },
          { name: "AccDcProjectCompany", count: dcProjectCompanies },
          { name: "AccDcProjectService", count: dcProjectServices },
          { name: "AccDcAccountService", count: dcAccountServices },
          { name: "AccDcIngestRun", count: dcIngestRuns },
          { name: "AccDcBackfillProgress", count: dcBackfillProgress }
        ]
      },
      {
        name: "4. Parametric Families (Module 1)",
        tables: [
          { name: "Family", count: families },
          { name: "FamilyChangelog", count: familyChangelog },
          { name: "FamilyAttachment", count: familyAttachments },
          { name: "FamilyDeliverable", count: familyDeliverables }
        ]
      },
      {
        name: "5. Clash Detection & Sim Automation",
        tables: [
          { name: "ClashWiki", count: clashWikis },
          { name: "ClashTask", count: clashTasks },
          { name: "ClashToolRelease", count: clashReleases },
          { name: "SimWiki", count: simWikis },
          { name: "SimTask", count: simTasks },
          { name: "SimToolRelease", count: simReleases }
        ]
      },
      {
        name: "6. Revit Exams & Tasks",
        tables: [
          { name: "RevitExam", count: revitExams },
          { name: "ExamBuildTask", count: examBuildTasks },
          { name: "ExamResult", count: examResults },
          { name: "UserTask", count: userTasks },
          { name: "TaskAttachment", count: taskAttachments }
        ]
      },
      {
        name: "7. LOD Checker",
        tables: [
          { name: "LodFamily", count: lodFamilies },
          { name: "LodEmbedding", count: lodEmbeddings },
          { name: "LodGraphNode", count: lodGraphNodes },
          { name: "LodCategory", count: lodCategories }
        ]
      },
      {
        name: "8. Graph Layouts & Caches",
        tables: [
          { name: "AccMemberCache", count: accMemberCache },
          { name: "AccHubRoleCache", count: accHubRoleCache },
          { name: "AccGraphLayoutCache", count: accGraphLayoutCache }
        ]
      }
    ];

    let grandTotal = 0;
    console.log("=========================================");
    console.log("      ALL-TIME SYSTEM DATA INVENTORY     ");
    console.log("=========================================");

    categories.forEach((cat) => {
      console.log(`\n${cat.name}:`);
      let catTotal = 0;
      cat.tables.forEach((t) => {
        if (t.count > 0) {
          console.log(`  - ${t.name.padEnd(45)}: ${t.count.toLocaleString()}`);
          catTotal += t.count;
        }
      });
      console.log(`  > ${"Subtotal (Active Tables)".padEnd(45)}: ${catTotal.toLocaleString()}`);
      grandTotal += catTotal;
    });

    console.log("\n=========================================");
    console.log(` GRAND TOTAL OF ACTIVE DATA RECORDS      : ${grandTotal.toLocaleString()}`);
    console.log("=========================================");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
