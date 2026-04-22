import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const accounts = await prisma.account.findMany({
    where: { provider: "autodesk" },
    include: { user: { select: { email: true, id: true } } },
  });

  if (accounts.length === 0) {
    console.log("❌  No autodesk accounts in DB at all.");
    return;
  }

  for (const acct of accounts) {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = acct.expires_at;
    const expired = expiresAt ? expiresAt < nowSec : null;
    console.log(`\n📋  Autodesk account for: ${acct.user?.email} (userId: ${acct.userId})`);
    console.log(`   access_token:  ${acct.access_token ? "✅ present" : "❌ NULL"}`);
    console.log(`   refresh_token: ${acct.refresh_token ? "✅ present" : "❌ NULL"}`);
    console.log(`   expires_at:    ${expiresAt ?? "null"} (${expired === null ? "no expiry" : expired ? "❌ EXPIRED" : "✅ valid"})`);
    console.log(`   scope:         ${acct.scope ?? "null"}`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
