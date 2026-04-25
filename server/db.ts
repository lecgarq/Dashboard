import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const isProduction = process.env.NODE_ENV === "production";

function readPoolNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRuntimeDatabaseUrl() {
  const pooledUrl = process.env.DATABASE_URL?.trim();
  const directUrl = process.env.DIRECT_URL?.trim();

  // Railway runs a long-lived Node process, so prefer the session/direct URL when available.
  const url = isProduction ? directUrl || pooledUrl : pooledUrl || directUrl;
  if (!url) {
    throw new Error("DATABASE_URL or DIRECT_URL must be set");
  }
  return url;
}

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: getRuntimeDatabaseUrl(),
    max: readPoolNumber("PG_POOL_MAX", isProduction ? 5 : 10),
    idleTimeoutMillis: readPoolNumber("PG_IDLE_TIMEOUT_MS", isProduction ? 120_000 : 10_000),
    connectionTimeoutMillis: readPoolNumber("PG_CONNECTION_TIMEOUT_MS", 5_000),
    // Prevents Railway NAT / Supabase pooler from silently dropping idle connections
    keepAlive: true,
    keepAliveInitialDelayMillis: 30_000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
