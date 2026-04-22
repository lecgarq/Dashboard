import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const result = await prisma.account.deleteMany({
    where: { provider: "autodesk", user: { email: "luis.ecorteg@gmail.com" } },
  });
  console.log(`✅ Deleted ${result.count} autodesk account(s) from luis.ecorteg@gmail.com`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
