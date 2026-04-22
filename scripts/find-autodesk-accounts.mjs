import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const accounts = await prisma.account.findMany({
    where: { provider: "autodesk" },
    include: { user: { select: { email: true } } },
  });

  console.log(`Found ${accounts.length} autodesk account(s):`);
  for (const a of accounts) {
    console.log(`  id: ${a.id}`);
    console.log(`  userId: ${a.userId}`);
    console.log(`  email: ${a.user?.email ?? "NO USER"}`);
    console.log(`  providerAccountId: ${a.providerAccountId}`);
    console.log();
  }

  // Also check for orphaned accounts (userId not in users table)
  const allUserIds = (await prisma.user.findMany({ select: { id: true } })).map(u => u.id);
  const orphaned = accounts.filter(a => !allUserIds.includes(a.userId));
  if (orphaned.length > 0) {
    console.log(`⚠️  ${orphaned.length} ORPHANED autodesk account(s) with no matching user:`);
    orphaned.forEach(a => console.log(`  userId: ${a.userId}, id: ${a.id}`));
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
