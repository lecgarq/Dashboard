import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { existsSync } from "node:fs";

// Load .env file if it exists and we're in a supported Node version
if (typeof process.loadEnvFile === "function" && existsSync(".env")) {
  process.loadEnvFile(".env");
}

/**
 * Secures Supabase by enabling Row Level Security (RLS) on all tables.
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is not defined.");
    return;
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  
  console.log("🚀 Starting Supabase Security Hardening...");

  const tables = [
    "User", "Account", "Session", "VerificationToken", "ApprovedEmail", 
    "PendingRequest", "UserModuleAccess", "PasswordResetToken",
    "Project", "Family", "FamilyChangelog", "FamilyAttachment", "FamilyDeliverable",
    "ClashWiki", "ClashTask", "ClashToolRelease",
    "SimWiki", "SimTask", "SimToolRelease",
    "RevitExam", "ExamBuildTask", "ExamResult",
    "UserTask", "TaskAttachment",
    "LodFamily", "LodEmbedding", "LodGraphNode", "LodCategory"
  ];

  for (const table of tables) {
    try {
      console.log(`🔒 Enabling RLS for table: ${table}...`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
      console.log(`✅ ${table} secured.`);
    } catch (err) {
      console.error(`❌ Failed to secure ${table}:`, err.message);
    }
  }

  console.log("\n✨ Supabase Security Hardening Complete.");
  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
