import fs from "node:fs";
import { readFileSync } from "node:fs";
import path, { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function loadEnvFile(file: string) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

function createPrisma(): PrismaClient {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] }) as unknown as PrismaClient;
}

async function main(): Promise<void> {
  const sql = readFileSync(join(process.cwd(), "prisma/migrations-raw/2026-06-08-acc-instance-embedding.sql"), "utf8");
  const prisma = createPrisma();
  try {
    // Run each statement separately — $executeRawUnsafe is single-command.
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(stmt);
    }
    console.log("AccInstanceEmbedding table + cluster column ensured.");
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
