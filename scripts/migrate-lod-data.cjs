/**
 * One-time LOD data migration script.
 *
 * Canonical runner:
 *   node scripts/migrate-lod-data.cjs [--dry-run] [--limit N] [--start N]
 *
 * Streams master_registry.json, loads graph_data.json in memory, and writes:
 * - LodFamily rows
 * - LodEmbedding.vector float arrays
 * - LodEmbedding.pgvector search vectors
 * - LodGraphNode rows
 * - LodCategory rows
 */

const fs = require("fs");
const path = require("path");

try {
  const envPath = path.join(__dirname, "../.env");
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  const envMap = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    envMap[key] = value;
    if (!process.env[key]) process.env[key] = value;
  }

  if (envMap.DIRECT_URL) {
    process.env.DATABASE_URL = envMap.DIRECT_URL;
  }
} catch {
  // .env is optional for dry runs in already-configured shells.
}

const { PrismaClient } = require("@prisma/client");
const { chain } = require("stream-chain");
const { parser: makeParser } = require("stream-json");
const { streamArray } = require(path.join(
  __dirname,
  "../node_modules/stream-json/src/streamers/stream-array.js"
));

const MASTER_REGISTRY = "C:/LECG/LOD Checker/00_data/vectors/master_registry.json";
const GRAPH_DATA = "C:/LECG/LOD Checker/00_data/vectors/graph_data.json";
const CATEGORIES_FILE = "C:/LECG/LOD Checker/00_data/Categories.json";
const BATCH_SIZE = 50;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i !== -1 ? parseInt(args[i + 1], 10) : Infinity;
})();
const START = (() => {
  const i = args.indexOf("--start");
  return i !== -1 ? parseInt(args[i + 1], 10) : 0;
})();

function confidenceToLabel(value) {
  if (typeof value === "string" && value.trim()) return value.trim().toUpperCase();
  if (value === undefined || value === null) return undefined;
  if (value >= 0.8) return "HIGH";
  if (value >= 0.5) return "MEDIUM";
  return "LOW";
}

function imageFilename(outputPath, nameOfFile) {
  if (outputPath) return path.basename(outputPath);
  if (nameOfFile) return nameOfFile;
  return undefined;
}

function isValidEmbedding(vector) {
  return (
    Array.isArray(vector) &&
    vector.length === 768 &&
    vector.every((value) => Number.isFinite(value))
  );
}

function loadGraphData() {
  console.log("Loading graph_data.json...");
  const raw = fs.readFileSync(GRAPH_DATA, "utf8");
  const data = JSON.parse(raw);
  const map = new Map();

  for (const node of data.nodes) {
    map.set(node.id, node);
  }

  console.log(`  -> ${map.size} graph nodes loaded`);
  return map;
}

function loadCategories() {
  if (!fs.existsSync(CATEGORIES_FILE)) return [];

  const raw = fs.readFileSync(CATEGORIES_FILE, "utf8");
  const data = JSON.parse(raw);

  if (Array.isArray(data)) {
    return data.map((entry) => (typeof entry === "string" ? { name: entry } : entry));
  }

  if (typeof data === "object" && data) {
    return Object.entries(data).map(([name, group]) => ({
      name,
      group: typeof group === "string" ? group : undefined,
    }));
  }

  return [];
}

async function ensurePgvectorInfrastructure(db) {
  if (DRY_RUN) return;

  console.log("Ensuring pgvector infrastructure...");

  try {
    await db.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  } catch (error) {
    console.log(`  -> Could not create vector extension automatically: ${error.message}`);
  }

  try {
    await db.$executeRawUnsafe(
      `ALTER TABLE "LodEmbedding" ADD COLUMN IF NOT EXISTS "pgvector" vector(768)`
    );
  } catch (error) {
    console.log(`  -> Could not ensure LodEmbedding.pgvector automatically: ${error.message}`);
  }
}

async function populatePgvector(db) {
  console.log("\nPopulating pgvector column from float arrays...");

  try {
    const updated = await db.$executeRaw`
      UPDATE "LodEmbedding"
      SET "pgvector" = (
        '[' || array_to_string("vector"::text[], ',') || ']'
      )::vector(768)
      WHERE "vector" IS NOT NULL
        AND cardinality("vector") = 768
    `;
    console.log(`  -> Updated ${updated} rows`);
  } catch (error) {
    console.log(`  -> pgvector update failed: ${error.message}`);
  }
}

async function ensurePgvectorIndex(db) {
  if (DRY_RUN) return;

  console.log("Creating pgvector index...");

  try {
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "lod_embedding_pgvector_idx"
       ON "LodEmbedding"
       USING ivfflat ("pgvector" vector_cosine_ops)
       WITH (lists = 100)`
    );
    await db.$executeRawUnsafe(`ANALYZE "LodEmbedding"`);
    console.log("  -> pgvector index ready");
  } catch (error) {
    console.log(`  -> Could not create pgvector index automatically: ${error.message}`);
  }
}

let processed = 0;
let skipped = 0;
let upserted = 0;
let errors = 0;

async function processBatch(db, batch, graphMap) {
  if (DRY_RUN) {
    upserted += batch.length;
    return;
  }

  try {
    const familyRows = batch.map((item) => {
      const graphNode = graphMap.get(item.id);
      const imagePath = imageFilename(item.output_path, item.name_of_file) ?? null;

      return {
        nameOfFile: item.name_of_file,
        familyName: graphNode?.family_name ?? item.name_of_image ?? null,
        finalCategory: item.final_category ?? null,
        lodLabel: item.lod_label ?? null,
        provider: item.provider ?? null,
        caption: item.simplified_description ?? null,
        fullDescription: item.full_description ?? null,
        confidenceLevel: confidenceToLabel(item.confidence_level) ?? null,
        fileSizeKb: item.file_size_kb ?? null,
        possibleCategories: item.possible_categories ?? [],
        originalFile: item.original_file ?? null,
        imagePath,
        thumbPath: imagePath,
      };
    });

    await db.lodFamily.createMany({
      data: familyRows,
      skipDuplicates: true,
    });

    const families = await db.lodFamily.findMany({
      where: {
        nameOfFile: {
          in: batch.map((item) => item.name_of_file),
        },
      },
      select: {
        id: true,
        nameOfFile: true,
      },
    });

    const familyIdByFile = new Map(families.map((family) => [family.nameOfFile, family.id]));

    const embeddingRows = batch
      .filter((item) => isValidEmbedding(item.image_embedding))
      .map((item) => {
        const familyId = familyIdByFile.get(item.name_of_file);
        if (!familyId) return null;
        return {
          familyId,
          vector: item.image_embedding,
        };
      })
      .filter(Boolean);

    if (embeddingRows.length > 0) {
      await db.lodEmbedding.createMany({
        data: embeddingRows,
        skipDuplicates: true,
      });
    }

    const graphRows = batch
      .map((item) => {
        const familyId = familyIdByFile.get(item.name_of_file);
        const graphNode = graphMap.get(item.id);
        if (!familyId || !graphNode) return null;

        return {
          familyId,
          x: graphNode.x,
          y: graphNode.y,
          neighbors: Array.isArray(graphNode.neighbors) ? graphNode.neighbors : [],
        };
      })
      .filter(Boolean);

    if (graphRows.length > 0) {
      await db.lodGraphNode.createMany({
        data: graphRows,
        skipDuplicates: true,
      });
    }

    upserted += batch.length;
  } catch (error) {
    errors += batch.length;
    console.error("\nBatch error:", error.message);
  }
}

async function main() {
  console.log("=== LOD Data Migration ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  if (START > 0) console.log(`Starting at index: ${START}`);
  if (LIMIT !== Infinity) console.log(`Limit: ${LIMIT}`);
  console.log();

  const graphMap = loadGraphData();
  const db = new PrismaClient();

  await ensurePgvectorInfrastructure(db);

  if (!DRY_RUN) {
    const categories = loadCategories();
    if (categories.length > 0) {
      console.log(`Upserting ${categories.length} categories...`);
      for (const category of categories) {
        await db.lodCategory.upsert({
          where: { name: category.name },
          create: category,
          update: category,
        });
      }
    }
  }

  console.log("Streaming master_registry.json...");
  const startedAt = Date.now();
  let index = 0;
  let batch = [];

  const pipeline = chain([
    fs.createReadStream(MASTER_REGISTRY),
    makeParser(),
    streamArray(),
  ]);

  for await (const { value } of pipeline) {
    index++;

    if (index <= START) {
      skipped++;
      continue;
    }

    if (processed >= LIMIT) break;

    batch.push(value);
    processed++;

    if (batch.length >= BATCH_SIZE) {
      const current = batch;
      batch = [];
      await processBatch(db, current, graphMap);

      const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 1);
      const rate = (upserted / elapsedSeconds).toFixed(1);
      process.stdout.write(
        `\r  idx: ${index} | upserted: ${upserted} | errors: ${errors} | ${rate}/s     `
      );
    }
  }

  if (batch.length > 0) {
    await processBatch(db, batch, graphMap);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("\n");
  console.log("=== Migration Complete ===");
  console.log(`  Total scanned: ${index}`);
  console.log(`  Skipped (start offset): ${skipped}`);
  console.log(`  Upserted: ${upserted}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Time: ${elapsed}s`);

  if (!DRY_RUN) {
    await populatePgvector(db);
    await ensurePgvectorIndex(db);
  }

  await db.$disconnect();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
