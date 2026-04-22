import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Get access token from DB
  const account = await prisma.account.findFirst({
    where: { provider: "autodesk" },
    select: { access_token: true, user: { select: { email: true } } },
  });

  if (!account?.access_token) {
    console.error("❌ No Autodesk access token in DB. Link Autodesk first.");
    process.exit(1);
  }

  console.log(`Using token from: ${account.user?.email}`);

  // Fetch hubs from APS Data Management API
  const res = await fetch("https://developer.api.autodesk.com/project/v1/hubs", {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });

  if (!res.ok) {
    console.error(`❌ APS hubs API failed: ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.error(text);
    process.exit(1);
  }

  const { data: hubs } = await res.json();

  if (!hubs?.length) {
    console.error("❌ No hubs found for this Autodesk account.");
    process.exit(1);
  }

  console.log(`\nFound ${hubs.length} hub(s):`);
  for (const hub of hubs) {
    console.log(`  id: ${hub.id}  name: ${hub.attributes?.name}  type: ${hub.attributes?.extension?.type}`);
  }

  // Use the first ACC hub (type contains "hubs:autodesk.bim360")
  const accHub = hubs.find(h =>
    h.attributes?.extension?.type?.includes("autodesk.bim360") ||
    h.attributes?.extension?.type?.includes("autodesk.acc")
  ) ?? hubs[0];

  const hubId = accHub.id; // e.g. "b.XXXXXXXX-..."
  console.log(`\n✅ Using hub: "${accHub.attributes?.name}" → ${hubId}`);

  // Update the Project row
  const project = await prisma.project.findFirst();
  if (!project) {
    console.error("❌ No project row in DB.");
    process.exit(1);
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { apsHubId: hubId },
  });

  console.log(`✅ Updated project "${project.name}" with apsHubId: ${hubId}`);
  console.log(`\n📋 Also add this to Railway env vars:`);
  console.log(`   APS_HUB-ID=${hubId}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
