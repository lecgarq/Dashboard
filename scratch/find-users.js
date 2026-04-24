const { PrismaClient } = require("@prisma/client");

// Manually override the environment variable for this script
process.env.DATABASE_URL = "postgresql://postgres.mehehwxnhcsnugfkqyis:Xzmedt%2F4592@aws-1-us-west-2.pooler.supabase.com:6543/postgres";

const prisma = new PrismaClient();

async function main() {
  console.log("Connecting to database...");
  const users = await prisma.user.findMany({
    where: { role: "EDITOR" },
    select: { email: true, role: true },
    take: 5
  });
  console.log("Editors found:", JSON.stringify(users, null, 2));
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
