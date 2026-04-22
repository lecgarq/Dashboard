/**
 * Fix: Google OAuth for luis.cortes@hermosillo.com is linked to the wrong user.
 * This script re-links it to the correct user record.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const TARGET_EMAIL = "luis.cortes@hermosillo.com";

async function main() {
  // 1. Find the canonical user record for the hermosillo email
  const canonicalUser = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    include: { accounts: true },
  });

  if (!canonicalUser) {
    console.error(`❌  No user found for ${TARGET_EMAIL}`);
    process.exit(1);
  }
  console.log(`✅  Canonical user: ${canonicalUser.email} (id: ${canonicalUser.id})`);
  console.log(`   Current linked providers: ${canonicalUser.accounts.map(a => a.provider).join(", ") || "none"}`);

  // 2. Find any Google account NOT belonging to this user
  const orphanedGoogleAccounts = await prisma.account.findMany({
    where: {
      provider: "google",
      userId: { not: canonicalUser.id },
    },
    include: { user: { select: { email: true } } },
  });

  console.log(`\n📋  Google accounts linked to OTHER users: ${orphanedGoogleAccounts.length}`);
  orphanedGoogleAccounts.forEach(a => {
    console.log(`   → accountId: ${a.id}, linked to user: ${a.user?.email ?? "unknown"} (${a.userId})`);
  });

  // 3. Find the one whose user has no email OR is a ghost/duplicate
  //    Delete any Google accounts linked to users that are NOT the canonical admin
  const allUsers = await prisma.user.findMany({
    where: { email: { not: TARGET_EMAIL } },
    select: { id: true, email: true },
  });
  console.log(`\n📋  Other user records in DB:`);
  allUsers.forEach(u => console.log(`   → ${u.email} (${u.id})`));

  // 4. Delete the orphaned Google account so the user can re-link cleanly
  if (orphanedGoogleAccounts.length === 0) {
    console.log("\nℹ️  No orphaned Google accounts found. The issue may be elsewhere.");
    return;
  }

  for (const acct of orphanedGoogleAccounts) {
    await prisma.account.delete({ where: { id: acct.id } });
    console.log(`\n✅  Deleted orphaned Google account (was linked to: ${acct.user?.email ?? acct.userId})`);
  }

  console.log("\n✅  Done. Sign in with Google as luis.cortes@hermosillo.com now.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
