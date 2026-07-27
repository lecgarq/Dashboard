// Quick count script using raw pg connection
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Parse DATABASE_URL from .env
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const dbUrlMatch = envContent.match(/^DATABASE_URL="?([^"\n]+)"?/m);
if (!dbUrlMatch) { console.error('DATABASE_URL not found'); process.exit(1); }
const connectionString = dbUrlMatch[1];

async function main() {
  // DB-02: local trust-auth Postgres (no SSL/TLS bypass needed; sslmode inherits from DATABASE_URL)
  const client = new Client({ connectionString });
  await client.connect();

  const tables = [
    ['AccProject (live API)',              '"AccProject"'],
    ['AccDcProject (Data Connector)',      '"AccDcProject"'],
    ['AccFolder',                          '"AccFolder"'],
    ['AccFolderPermission',                '"AccFolderPermission"'],
    ['AccProjectMember (live API)',        '"AccProjectMember"'],
    ['AccDcUser (Data Connector)',         '"AccDcUser"'],
    ['AccDcProjectUser',                   '"AccDcProjectUser"'],
    ['AccDcProjectUserRole',               '"AccDcProjectUserRole"'],
    ['AccDcProjectUserProduct',            '"AccDcProjectUserProduct"'],
    ['AccDcProjectUserService',            '"AccDcProjectUserService"'],
    ['AccRole (live API)',                 '"AccRole"'],
    ['AccDcRole (Data Connector)',         '"AccDcRole"'],
    ['AccDcCompany',                       '"AccDcCompany"'],
    ['AccActivity (total events)',         '"AccActivity"'],
    ['AccMemberCache',                     '"AccMemberCache"'],
    ['AccDcIngestRun',                     '"AccDcIngestRun"'],
  ];

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║       LECG Dashboard — Extracted ACC Data Census         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Run all counts in parallel
  const counts = await Promise.all(
    tables.map(([label, table]) =>
      client.query(`SELECT COUNT(*) FROM ${table}`).then(r => [label, parseInt(r.rows[0].count)])
    )
  );

  // Folder crawl breakdown
  const crawl = await client.query(`
    SELECT "folderCrawlStatus", COUNT(*) as n 
    FROM "AccProject" 
    GROUP BY "folderCrawlStatus" 
    ORDER BY n DESC
  `);

  // Activity source breakdown
  const actSrc = await client.query(`
    SELECT "sourceFile", COUNT(*) as n 
    FROM "AccActivity" 
    GROUP BY "sourceFile"
    ORDER BY n DESC
  `);

  // Latest ingest run
  const lastRun = await client.query(`
    SELECT "startedAt", "status", "projectsProcessed", "rowsByModule"
    FROM "AccDcIngestRun"
    ORDER BY "startedAt" DESC
    LIMIT 1
  `);

  const pad = (s, n) => s.toString().padEnd(n);
  const num = n => n.toLocaleString().padStart(8);

  console.log('📁  PROJECTS');
  const [, apiProj] = counts.find(([l]) => l.startsWith('AccProject (live'));
  const [, dcProj]  = counts.find(([l]) => l.startsWith('AccDcProject'));
  console.log(`    ${pad('Live API (AccProject)', 38)} ${num(apiProj)}`);
  console.log(`    ${pad('Data Connector (AccDcProject)', 38)} ${num(dcProj)}`);
  console.log(`    Folder-crawl status breakdown:`);
  crawl.rows.forEach(r => console.log(`      • ${r.folderCrawlStatus}: ${parseInt(r.n)}`));

  console.log('\n📂  FOLDERS');
  const [, folders] = counts.find(([l]) => l === 'AccFolder');
  const [, perms]   = counts.find(([l]) => l === 'AccFolderPermission');
  console.log(`    ${pad('Folders (AccFolder)', 38)} ${num(folders)}`);
  console.log(`    ${pad('Folder Permissions', 38)} ${num(perms)}`);

  console.log('\n👥  USERS / MEMBERS');
  const [, liveMembers] = counts.find(([l]) => l.startsWith('AccProjectMember'));
  const [, dcUsers]     = counts.find(([l]) => l.startsWith('AccDcUser'));
  const [, memCache]    = counts.find(([l]) => l === 'AccMemberCache');
  const [, projUsers]   = counts.find(([l]) => l === 'AccDcProjectUser');
  console.log(`    ${pad('Project Members (live API)', 38)} ${num(liveMembers)}`);
  console.log(`    ${pad('DC Users', 38)} ${num(dcUsers)}`);
  console.log(`    ${pad('Member Cache (AccMemberCache)', 38)} ${num(memCache)}`);
  console.log(`    ${pad('DC Project↔User links', 38)} ${num(projUsers)}`);

  console.log('\n🔐  ROLES & PERMISSIONS');
  const [, liveRoles] = counts.find(([l]) => l.startsWith('AccRole (live'));
  const [, dcRoles]   = counts.find(([l]) => l.startsWith('AccDcRole'));
  const [, userRoles] = counts.find(([l]) => l === 'AccDcProjectUserRole');
  console.log(`    ${pad('AccRole (live API)', 38)} ${num(liveRoles)}`);
  console.log(`    ${pad('DC Roles', 38)} ${num(dcRoles)}`);
  console.log(`    ${pad('DC Project↔User↔Role assignments', 38)} ${num(userRoles)}`);

  console.log('\n📦  PRODUCTS / SERVICES / COMPANIES (DC)');
  const [, products]  = counts.find(([l]) => l === 'AccDcProjectUserProduct');
  const [, services]  = counts.find(([l]) => l === 'AccDcProjectUserService');
  const [, companies] = counts.find(([l]) => l === 'AccDcCompany');
  console.log(`    ${pad('Project↔User↔Product', 38)} ${num(products)}`);
  console.log(`    ${pad('Project↔User↔Service', 38)} ${num(services)}`);
  console.log(`    ${pad('Companies', 38)} ${num(companies)}`);

  console.log('\n📊  ACTIVITY LOG');
  const [, activities] = counts.find(([l]) => l.startsWith('AccActivity'));
  console.log(`    ${pad('Total activity events', 38)} ${num(activities)}`);
  actSrc.rows.forEach(r =>
    console.log(`      • source=${r.sourceFile}: ${parseInt(r.n).toLocaleString()}`)
  );

  console.log('\n🔄  INGEST HISTORY');
  const [, ingestRuns] = counts.find(([l]) => l === 'AccDcIngestRun');
  console.log(`    ${pad('Total ingest runs', 38)} ${num(ingestRuns)}`);
  if (lastRun.rows[0]) {
    const r = lastRun.rows[0];
    console.log(`    Last run: ${new Date(r.startedAt).toLocaleString()} [${r.status}]`);
    console.log(`    Projects processed: ${r.projectsProcessed}`);
    if (r.rowsByModule && typeof r.rowsByModule === 'object') {
      console.log('    Rows by module:');
      Object.entries(r.rowsByModule).forEach(([k, v]) =>
        console.log(`      • ${k}: ${v}`)
      );
    }
  }

  console.log('\n══════════════════════════════════════════════════════════\n');

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
