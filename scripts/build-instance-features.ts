import fs from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import path, { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCachedAccDcBulkUsers } from "../lib/server/acc-hot-cache";
import { buildGraphNodesFromUsers } from "../app/(dashboard)/users/access-analysis/graphNodesFromUsers";
import { instanceFeatureTokens } from "../app/(dashboard)/users/access-analysis/instanceFeatureTokens";

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
  const db = createPrisma();
  try {
    const users = await getCachedAccDcBulkUsers(db as never, {
      includePermissionSummary: true,
      includeActivityMix: true,
    });
    const { nodeIds, features } = buildGraphNodesFromUsers(users);
    const outDir = join(process.cwd(), ".embedding");
    mkdirSync(outDir, { recursive: true });
    const lines = features.map((f, i) =>
      JSON.stringify({ nodeId: nodeIds[i], tokens: instanceFeatureTokens(f) }),
    );
    writeFileSync(join(outDir, "instance-features.jsonl"), lines.join("\n") + "\n", "utf8");
    console.log(`Wrote ${lines.length} instance feature rows to .embedding/instance-features.jsonl`);
  } finally {
    await db.$disconnect().catch(() => {});
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
