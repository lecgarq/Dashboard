/**
 * build-activity-universe-payload.ts — v2.7 Phase 38 (SCALE-02).
 *
 * Materializes the servable binary columnar artifact from AccActivityEmbedding:
 * streams the table in keyset-paginated chunks (never one 4.9M findMany), fills
 * typed-array columns, encodes with the Phase-37 columnar codec (reused, not
 * forked), and writes .embedding/activity-universe.bin + -meta.json (dicts from
 * the pipeline + ACT-02 coverage). Run after every compute_activity_embeddings.py.
 */
import fs from "node:fs";
import { readFileSync, writeFileSync } from "node:fs";
import path, { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  encodeColumnarPayload,
  type ColumnArray,
} from "../lib/acc/columnarPayload";
import {
  activityUniversePaths,
  assembleActivityUniverseMeta,
  type ActivityUniverseCoverage,
} from "../lib/server/activityUniversePayload";

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

interface EmbeddingRow {
  id: string;
  x: number;
  y: number;
  verbId: number;
  objectTypeId: number;
  moduleId: number;
  monthId: number;
  roleId: number;
  companyId: number;
  projectId: number;
  authorId: number;
  folderId: number;
  embeddingRunId: string;
}

const CHUNK = 200_000;

async function main(): Promise<void> {
  const t0 = Date.now();
  const db = createPrisma();
  try {
    const [{ count }] = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM "AccActivityEmbedding"',
    );
    const n = Number(count);
    if (n === 0) throw new Error("AccActivityEmbedding is empty — run compute_activity_embeddings.py first");

    const positions = new Float32Array(n * 2);
    const verbId = new Uint16Array(n);
    const objectTypeId = new Uint16Array(n);
    const moduleId = new Uint16Array(n);
    const monthId = new Uint16Array(n);
    const roleId = new Uint16Array(n);
    const companyId = new Uint16Array(n);
    const projectId = new Uint32Array(n);
    const authorId = new Uint32Array(n);
    const folderId = new Uint32Array(n);

    let i = 0;
    let lastId = "";
    let runId = "";
    for (;;) {
      const rows = await db.$queryRawUnsafe<EmbeddingRow[]>(
        `SELECT * FROM "AccActivityEmbedding" WHERE id > $1 ORDER BY id LIMIT ${CHUNK}`,
        lastId,
      );
      if (rows.length === 0) break;
      for (const r of rows) {
        positions[i * 2] = r.x;
        positions[i * 2 + 1] = r.y;
        verbId[i] = r.verbId;
        objectTypeId[i] = r.objectTypeId;
        moduleId[i] = r.moduleId;
        monthId[i] = r.monthId;
        roleId[i] = r.roleId;
        companyId[i] = r.companyId;
        projectId[i] = r.projectId;
        authorId[i] = r.authorId;
        folderId[i] = r.folderId;
        i++;
      }
      lastId = rows[rows.length - 1].id;
      runId = rows[rows.length - 1].embeddingRunId;
      if (i % 1_000_000 < CHUNK) console.log(`  ${i}/${n} rows…`);
    }
    if (i !== n) throw new Error(`streamed ${i} != count ${n}`);

    const columns: Record<string, ColumnArray> = {
      positions,
      verbId,
      objectTypeId,
      moduleId,
      monthId,
      roleId,
      companyId,
      projectId,
      authorId,
      folderId,
    };
    const buf = encodeColumnarPayload(n, columns);

    const embDir = join(process.cwd(), ".embedding");
    const dicts = JSON.parse(
      readFileSync(join(embDir, "activity-universe-dicts.json"), "utf8"),
    ) as Record<string, unknown>;
    const coverage = JSON.parse(
      readFileSync(join(embDir, "activity-author-coverage.json"), "utf8"),
    ) as ActivityUniverseCoverage;
    const meta = assembleActivityUniverseMeta({
      embeddingRunId: runId,
      generatedAt: new Date().toISOString(),
      count: n,
      dicts,
      coverage,
    });

    const { bin, meta: metaPath } = activityUniversePaths();
    writeFileSync(bin, Buffer.from(buf));
    writeFileSync(metaPath, JSON.stringify(meta), "utf8");
    console.log(
      `activity-universe.bin: ${n} rows, ${(buf.byteLength / 1_048_576).toFixed(1)} MB, ` +
        `run ${runId}, in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
  } finally {
    await db.$disconnect().catch(() => {});
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
