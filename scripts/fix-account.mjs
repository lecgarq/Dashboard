/**
 * One-time script to fix luis.cortes@hermosillo.com:
 *  1. Set a new password (bcrypt-hashed)
 *  2. Unlink the Google OAuth provider
 *
 * Usage:
 *   node scripts/fix-account.mjs
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TARGET_EMAIL = "luis.cortes@hermosillo.com";
const NEW_PASSWORD = "PerritoQuemandose123";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    include: { accounts: true },
  });

  if (!user) {
    console.error(`❌  User not found: ${TARGET_EMAIL}`);
    process.exit(1);
  }

  console.log(`✅  Found user: ${user.email} (id: ${user.id})`);
  console.log(`   Linked providers: ${user.accounts.map((a) => a.provider).join(", ") || "none"}`);

  // 1. Hash and set new password
  const hashed = await bcrypt.hash(NEW_PASSWORD, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed },
  });
  console.log("✅  Password updated.");

  // 2. Unlink Google
  const googleAccount = user.accounts.find((a) => a.provider === "google");
  if (googleAccount) {
    await prisma.account.delete({ where: { id: googleAccount.id } });
    console.log("✅  Google account unlinked.");
  } else {
    console.log("ℹ️   No Google account was linked — nothing to unlink.");
  }

  console.log("\nDone. The user can now log in with email + password.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
