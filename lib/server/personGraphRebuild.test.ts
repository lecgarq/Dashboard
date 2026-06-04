import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPersonFeatures } from "@/lib/acc/embedding/buildPersonFeatures";

// ---------------------------------------------------------------------------
// Env loading — mirrors rebuild-person-graph.ts so DATABASE_URL is populated
// with the real local PG URL even when vitest.setup.ts has injected a fake one.
// ---------------------------------------------------------------------------
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
    // Always overwrite — must stomp the fake URL injected by vitest.setup.ts
    process.env[key] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

// ---------------------------------------------------------------------------
// Build a fresh Prisma client pointing at the real DB (avoids the singleton
// `db` that was instantiated with the fake URL from vitest.setup.ts).
// ---------------------------------------------------------------------------
function createTestPrisma() {
  const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");
  const url =
    (process.env.DIRECT_URL && process.env.DIRECT_URL.trim()) ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  const adapter = new PrismaPg({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter, log: ["error"] }) as unknown as import("@prisma/client").PrismaClient;
}

const RUN = process.env.RUN_DB_TESTS === "1";
describe.runIf(RUN)("buildPersonFeatures (live DB)", () => {
  it("returns ~3,367 people each with at least one feature", async () => {
    const prisma = createTestPrisma();
    try {
      const bags = await buildPersonFeatures(prisma);
      expect(bags.length).toBeGreaterThan(3000);
      expect(bags.every((b) => b.features.size > 0)).toBe(true);
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  }, 120_000);
});
