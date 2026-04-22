import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = await prisma.user.findMany({
    include: { accounts: { select: { provider: true, access_token: true, expires_at: true } } },
  });

  console.log("\n=== ALL USERS & LINKED ACCOUNTS ===");
  for (const u of users) {
    console.log(`\n👤 ${u.email} | role: ${u.role} | id: ${u.id}`);
    if (u.accounts.length === 0) {
      console.log("   (no linked accounts)");
    }
    for (const a of u.accounts) {
      const nowSec = Math.floor(Date.now() / 1000);
      const expired = a.expires_at ? a.expires_at < nowSec : false;
      console.log(`   provider: ${a.provider} | token: ${a.access_token ? "✅" : "❌ NULL"} | ${a.expires_at ? (expired ? "❌ EXPIRED" : "✅ valid") : "no expiry"}`);
    }
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
