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
import { quantizePositions3 } from "../lib/acc/positions3Quant";
import {
  WEEK_UNKNOWN,
  weekFloorFromMonthFloor,
  weekFloorMs,
  weekIdFor,
} from "../lib/acc/activityWeeks";
import {
  ID_ANCHOR_STRIDE,
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
  x3: number | null;
  y3: number | null;
  z3: number | null;
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
  /** Source event timestamp joined back from AccActivity / AccActivityAccds. */
  ts: Date | null;
}

/**
 * Embedding ids live in two spaces ("accds:"+accdsActivityId | AccActivity.id),
 * and neither table's timestamp survives into AccActivityEmbedding — monthId is
 * all the Python pipeline keeps. Week granularity therefore joins the source
 * rows back by primary key (both sides index-seek; ~2s per 200k chunk).
 */
const TS_JOIN = `
  LEFT JOIN "AccActivity" a ON a.id = e.id
  LEFT JOIN "AccActivityAccds" ac ON ac."accdsActivityId" = substr(e.id, 7)`;
const TS_SELECT = `COALESCE(a."createdAt", ac."createdAt") AS ts`;

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

    // Optional 3D sidecar (compute_activity_embeddings.py --components 3).
    // Emitted only on a FULL id match — a partial sidecar would silently render
    // a wrong universe, so it is disclosed and dropped instead.
    const [{ exists3d }] = await db.$queryRawUnsafe<Array<{ exists3d: boolean }>>(
      `SELECT to_regclass('"AccActivityEmbedding3D"') IS NOT NULL AS exists3d`,
    );
    let n3 = 0;
    if (exists3d) {
      const [{ c }] = await db.$queryRawUnsafe<Array<{ c: bigint }>>(
        'SELECT COUNT(*)::bigint AS c FROM "AccActivityEmbedding3D"',
      );
      n3 = Number(c);
    }
    const with3d = n3 === n;
    if (exists3d && !with3d) {
      console.warn(`AccActivityEmbedding3D has ${n3} rows != ${n} — positions3 SKIPPED`);
    }

    // Dicts are read BEFORE the stream now: the week floor derives from the
    // corpus monthFloor, and weekId is filled inline as rows arrive.
    const embDir = join(process.cwd(), ".embedding");
    const dicts = JSON.parse(
      readFileSync(join(embDir, "activity-universe-dicts.json"), "utf8"),
    ) as Record<string, unknown>;
    const weekFloor = weekFloorFromMonthFloor(String(dicts.monthFloor ?? ""));
    const weekBase = weekFloorMs(weekFloor);
    if (!Number.isFinite(weekBase)) {
      throw new Error(`monthFloor "${String(dicts.monthFloor)}" yielded no week floor`);
    }

    const positions = new Float32Array(n * 2);
    const positions3f = with3d ? new Float32Array(n * 3) : null;
    const verbId = new Uint16Array(n);
    const objectTypeId = new Uint16Array(n);
    const moduleId = new Uint16Array(n);
    const monthId = new Uint16Array(n);
    const weekId = new Uint16Array(n);
    const roleId = new Uint16Array(n);
    const companyId = new Uint16Array(n);
    const projectId = new Uint32Array(n);
    const authorId = new Uint32Array(n);
    const folderId = new Uint32Array(n);

    let i = 0;
    let lastId = "";
    let runId = "";
    // ACT-04: record every ID_ANCHOR_STRIDE-th id (rows 0, 10000, …) so the
    // eventDetail procedure can resolve a payload row index to its id with an
    // anchor seek + ≤10k OFFSET — anchors are build-consistent by construction.
    const idAnchors: string[] = [];
    let maxWeek = 0;
    let unknownWeek = 0;
    for (;;) {
      const rows = await db.$queryRawUnsafe<EmbeddingRow[]>(
        with3d
          ? `SELECT e.*, e3.x AS x3, e3.y AS y3, e3.z AS z3, ${TS_SELECT}
             FROM "AccActivityEmbedding" e
             LEFT JOIN "AccActivityEmbedding3D" e3 ON e3.id = e.id${TS_JOIN}
             WHERE e.id > $1 ORDER BY e.id LIMIT ${CHUNK}`
          : `SELECT e.*, ${TS_SELECT}
             FROM "AccActivityEmbedding" e${TS_JOIN}
             WHERE e.id > $1 ORDER BY e.id LIMIT ${CHUNK}`,
        lastId,
      );
      if (rows.length === 0) break;
      for (const r of rows) {
        if (i % ID_ANCHOR_STRIDE === 0) idAnchors.push(r.id);
        positions[i * 2] = r.x;
        positions[i * 2 + 1] = r.y;
        if (positions3f) {
          positions3f[i * 3] = r.x3 ?? 0;
          positions3f[i * 3 + 1] = r.y3 ?? 0;
          positions3f[i * 3 + 2] = r.z3 ?? 0;
        }
        verbId[i] = r.verbId;
        objectTypeId[i] = r.objectTypeId;
        moduleId[i] = r.moduleId;
        monthId[i] = r.monthId;
        if (r.ts === null) {
          weekId[i] = WEEK_UNKNOWN;
          unknownWeek += 1;
        } else {
          const w = weekIdFor(weekBase, r.ts);
          weekId[i] = w;
          if (w > maxWeek) maxWeek = w;
        }
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

    // u16-quantize the 3D column (codec has no f32x3 discount; ~29 MB vs 59 MB).
    let positions3HalfExtent = 0;
    const columns: Record<string, ColumnArray> = {
      positions,
      verbId,
      objectTypeId,
      moduleId,
      monthId,
      weekId,
      roleId,
      companyId,
      projectId,
      authorId,
      folderId,
    };
    if (positions3f) {
      for (let j = 0; j < positions3f.length; j++) {
        const a = Math.abs(positions3f[j]);
        if (a > positions3HalfExtent) positions3HalfExtent = a;
      }
      columns.positions3 = quantizePositions3(positions3f, positions3HalfExtent);
      console.log(`positions3: joined ${n} 3D rows, halfExtent ${positions3HalfExtent.toFixed(2)}`);
    }

    const buf = encodeColumnarPayload(n, columns);

    if (positions3f) dicts.positions3HalfExtent = positions3HalfExtent;
    dicts.weekFloor = weekFloor;
    dicts.weekCount = maxWeek + 1;
    dicts.weekUnknownCount = unknownWeek;
    console.log(
      `weeks: floor ${weekFloor}, ${maxWeek + 1} buckets, ${unknownWeek} rows with no source timestamp`,
    );
    const coverage = JSON.parse(
      readFileSync(join(embDir, "activity-author-coverage.json"), "utf8"),
    ) as ActivityUniverseCoverage;
    const meta = assembleActivityUniverseMeta({
      embeddingRunId: runId,
      generatedAt: new Date().toISOString(),
      count: n,
      dicts,
      coverage,
      idAnchors,
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
