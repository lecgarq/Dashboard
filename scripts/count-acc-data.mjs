import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [
    accProjects,
    dcProjects,
    folders,
    folderPerms,
    projectMembers,
    dcUsers,
    dcProjectUsers,
    dcProjectUserRoles,
    dcProjectUserProducts,
    dcProjectUserServices,
    accRoles,
    dcRoles,
    activities,
    ingestRuns,
    memberCache,
    accDcCompanies,
  ] = await Promise.all([
    prisma.accProject.count(),
    prisma.accDcProject.count(),
    prisma.accFolder.count(),
    prisma.accFolderPermission.count(),
    prisma.accProjectMember.count(),
    prisma.accDcUser.count(),
    prisma.accDcProjectUser.count(),
    prisma.accDcProjectUserRole.count(),
    prisma.accDcProjectUserProduct.count(),
    prisma.accDcProjectUserService.count(),
    prisma.accRole.count(),
    prisma.accDcRole.count(),
    prisma.accActivity.count(),
    prisma.accDcIngestRun.count(),
    prisma.accMemberCache.count(),
    prisma.accDcCompany.count(),
  ]);

  // Folder crawl breakdown
  const crawlStatus = await prisma.accProject.groupBy({
    by: ['folderCrawlStatus'],
    _count: { id: true },
  });

  // Activity breakdown by source
  const activitySources = await prisma.accActivity.groupBy({
    by: ['sourceFile'],
    _count: { id: true },
  });

  // Latest ingest run
  const lastIngest = await prisma.accDcIngestRun.findFirst({
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true, status: true, projectsProcessed: true, rowsByModule: true },
  });

  console.log('\n========================================');
  console.log('  LECG Dashboard — Extracted Data Counts');
  console.log('========================================\n');

  console.log('📁  ACC PROJECTS');
  console.log(`    Live API (AccProject):        ${accProjects.toLocaleString()}`);
  console.log(`    Data Connector (AccDcProject): ${dcProjects.toLocaleString()}`);
  console.log(`    Folder crawl status:`);
  crawlStatus.forEach(s => console.log(`      • ${s.folderCrawlStatus}: ${s._count.id}`));

  console.log('\n📂  FOLDERS & PERMISSIONS');
  console.log(`    Folders (AccFolder):           ${folders.toLocaleString()}`);
  console.log(`    Folder Permissions:            ${folderPerms.toLocaleString()}`);

  console.log('\n👥  USERS & MEMBERS');
  console.log(`    Project Members (live API):    ${projectMembers.toLocaleString()}`);
  console.log(`    DC Users:                      ${dcUsers.toLocaleString()}`);
  console.log(`    Member Cache (AccMemberCache): ${memberCache.toLocaleString()}`);
  console.log(`    DC Project↔User links:        ${dcProjectUsers.toLocaleString()}`);

  console.log('\n🔐  ROLES & PERMISSIONS');
  console.log(`    AccRole (live API):            ${accRoles.toLocaleString()}`);
  console.log(`    DC Roles:                      ${dcRoles.toLocaleString()}`);
  console.log(`    DC Project↔User↔Role:         ${dcProjectUserRoles.toLocaleString()}`);

  console.log('\n📦  PRODUCTS / SERVICES (DC)');
  console.log(`    Project↔User↔Product:         ${dcProjectUserProducts.toLocaleString()}`);
  console.log(`    Project↔User↔Service:         ${dcProjectUserServices.toLocaleString()}`);
  console.log(`    Companies (DC):                ${dcDcCompanies.toLocaleString()}`);

  console.log('\n📊  ACTIVITY LOG');
  console.log(`    Total AccActivity events:      ${activities.toLocaleString()}`);
  activitySources.forEach(s => console.log(`      • source=${s.sourceFile}: ${s._count.id.toLocaleString()}`));

  console.log('\n🔄  DATA CONNECTOR INGEST');
  console.log(`    Ingest runs completed:         ${ingestRuns.toLocaleString()}`);
  if (lastIngest) {
    console.log(`    Last run: ${lastIngest.startedAt.toISOString()} [${lastIngest.status}]`);
    console.log(`    Projects processed: ${lastIngest.projectsProcessed}`);
    if (lastIngest.rowsByModule) {
      console.log('    Rows by module:');
      Object.entries(lastIngest.rowsByModule).forEach(([k, v]) =>
        console.log(`      • ${k}: ${v}`)
      );
    }
  }

  console.log('\n========================================\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
