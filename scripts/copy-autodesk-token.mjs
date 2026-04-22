import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const source = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: "luis.cortes@hermosillo.com" } },
  });

  if (!source) { console.error("❌ No autodesk account on hermosillo user"); process.exit(1); }
  console.log("✅ Source autodesk token found (hermosillo)");

  const gmailUser = await prisma.user.findUnique({ where: { email: "luis.ecorteg@gmail.com" } });
  if (!gmailUser) { console.error("❌ Gmail user not found"); process.exit(1); }

  await prisma.account.upsert({
    where: { provider_providerAccountId: { provider: "autodesk", providerAccountId: source.providerAccountId } },
    update: {
      userId: gmailUser.id,
      access_token: source.access_token,
      refresh_token: source.refresh_token,
      expires_at: source.expires_at,
      scope: source.scope,
      token_type: source.token_type,
    },
    create: {
      userId: gmailUser.id,
      type: source.type,
      provider: "autodesk",
      providerAccountId: source.providerAccountId,
      access_token: source.access_token,
      refresh_token: source.refresh_token,
      expires_at: source.expires_at,
      scope: source.scope,
      token_type: source.token_type,
    },
  });

  console.log("✅ Autodesk token copied to gmail user. Both users now have valid tokens.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
