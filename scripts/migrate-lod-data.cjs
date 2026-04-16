/**
 * One-time LOD data migration script (CJS, run with: node scripts/migrate-lod-data.cjs)
 *
 * Streams master_registry.json (831 MB) + loads graph_data.json (28 MB),
 * then batch-upserts into PostgreSQL via Prisma.
 *
 * Usage:
 *   node scripts/migrate-lod-data.cjs [--dry-run] [--limit N] [--start N]
 */

const fs = require("fs");
const path = require("path");

// Load .env into process.env (no dotenv dependency needed)
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
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envMap[key] = val;
    if (!process.env[key]) process.env[key] = val;
  }
  // Use DIRECT_URL for migration (bypasses pgbouncer prepared-statement limits)
  if (envMap.DIRECT_URL) process.env.DATABASE_URL = envMap.DIRECT_URL;
} catch { /* .env not found */ }
const { PrismaClient } = require("@prisma/client");

// stream-json v2 requires stream-chain for pipeline composition
const { chain } = require("stream-chain");
const { parser: makeParser } = require("stream-json");
const { streamArray } = require(path.join(
  __dirname,
  "../node_modules/stream-json/src/streamers/stream-array.js"
));

// ── Config ───────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceToLabel(v) {
  if (v === undefined || v === null) return undefined;
  if (v >= 0.8) return "HIGH";
  if (v >= 0.5) return "MEDIUM";
  return "LOW";
}

function imageFilename(outputPath, nameOfFile) {
  if (outputPath) return path.basename(outputPath);
  if (nameOfFile) return nameOfFile;
  return undefined;
}

// ── Load graph data (28 MB — fits in memory) ─────────────────────────────────

function loadGraphData() {
  console.log("Loading graph_data.json...");
  const raw = fs.readFileSync(GRAPH_DATA, "utf8");
  const data = JSON.parse(raw);
  const map = new Map();
  for (const node of data.nodes) {
    map.set(node.id, node);
  }
  console.log(`  → ${map.size} graph nodes loaded`);
  return map;
}

// ── Load categories ────────────────────────────────────────────────────────

function loadCategories() {
  if (!fs.existsSync(CATEGORIES_FILE)) return [];
  const raw = fs.readFileSync(CATEGORIES_FILE, "utf8");
  const data = JSON.parse(raw);
  if (Array.isArray(data)) {
    return data.map((c) => (typeof c === "string" ? { name: c } : c));
  }
  if (typeof data === "object") {
    return Object.entries(data).map(([name, group]) => ({
      name,
      group: typeof group === "string" ? group : undefined,
    }));
  }
  return [];
}

// ── Counters ──────────────────────────────────────────────────────────────────

let processed = 0;
let skipped = 0;
let upserted = 0;
let errors = 0;

// ── Process a batch ────────────────────────────────────────────────────────

async function processBatch(db, batch, graphMap) {
  if (DRY_RUN) {
    upserted += batch.length;
    return;
  }

  try {
    // Step 1: bulk-insert families (skip duplicates for re-run safety)
    const familyRows = batch.map((item) => {
      const graphNode = graphMap.get(item.id);
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
        imagePath: imageFilename(item.output_path, item.name_of_file) ?? null,
      };
    });

    await db.lodFamily.createMany({ data: familyRows, skipDuplicates: true });

    // Step 2: fetch the IDs we just inserted (needed for FK relations)
    const nameOfFiles = batch.map((item) => item.name_of_file);
    const inserted = await db.lodFamily.findMany({
      where: { nameOfFile: { in: nameOfFiles } },
      select: { id: true, nameOfFile: true },
    });
    const idMap = new Map(inserted.map((f) => [f.nameOfFile, f.id]));

    // Step 3: bulk-insert embeddings
    const embeddingRows = batch
      .filter((item) => item.image_embedding && item.image_embedding.length > 0)
      .map((item) => {
        const familyId = idMap.get(item.name_of_file);
        if (!familyId) return null;
        return { familyId, vector: item.image_embedding };
      })
      .filter(Boolean);

    if (embeddingRows.length > 0) {
      await db.lodEmbedding.createMany({ data: embeddingRows, skipDuplicates: true });
    }

    // Step 4: bulk-insert graph nodes
    const graphRows = batch
      .map((item) => {
        const familyId = idMap.get(item.name_of_file);
        const graphNode = graphMap.get(item.id);
        if (!familyId || !graphNode) return null;
        return { familyId, x: graphNode.x, y: graphNode.y, neighbors: graphNode.neighbors };
      })
      .filter(Boolean);

    if (graphRows.length > 0) {
      await db.lodGraphNode.createMany({ data: graphRows, skipDuplicates: true });
    }

    upserted += batch.length;
  } catch (err) {
    errors += batch.length;
    console.error(`\nBatch error:`, err.message);
  }
}

// ── pgvector population ────────────────────────────────────────────────────

async function populatePgvector(db) {
  console.log("\nPopulating pgvector column from float arrays...");
  try {
    const result = await db.$executeRaw`
      UPDATE "LodEmbedding"
      SET pgvector = (
        '[' || array_to_string(vector::text[], ',') || ']'
      )::vector(768)
      WHERE pgvector IS NULL
        AND vector IS NOT NULL
        AND array_length(vector, 1) = 768
    `;
    console.log(`  → Updated ${result} rows`);
  } catch (err) {
    console.error("  pgvector update failed:", err.message);
    console.log("  → Run the pgvector SQL setup manually if not done yet");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== LOD Data Migration ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  if (START > 0) console.log(`Starting at index: ${START}`);
  if (LIMIT !== Infinity) console.log(`Limit: ${LIMIT}`);
  console.log();

  const graphMap = loadGraphData();
  const db = new PrismaClient();

  // Upsert categories first
  if (!DRY_RUN) {
    const categories = loadCategories();
    if (categories.length > 0) {
      console.log(`Upserting ${categories.length} categories...`);
      for (const cat of categories) {
        await db.lodCategory.upsert({
          where: { name: cat.name },
          create: cat,
          update: cat,
        });
      }
    }
  }

  console.log("Streaming master_registry.json...");
  const startTime = Date.now();
  let batch = [];
  let index = 0;

  // Use for-await to process items one at a time with proper backpressure.
  // Async event handlers (.on("data", async...)) race on shared state — avoid them.
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
      const current = [...batch];
      batch = [];
      await processBatch(db, current, graphMap);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = elapsed > 0 ? (upserted / parseFloat(elapsed)).toFixed(1) : "—";
      process.stdout.write(
        `\r  idx: ${index} | upserted: ${upserted} | errors: ${errors} | ${rate}/s     `
      );
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    await processBatch(db, batch, graphMap);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n");
  console.log("=== Migration Complete ===");
  console.log(`  Total scanned: ${index}`);
  console.log(`  Skipped (start offset): ${skipped}`);
  console.log(`  Upserted: ${upserted}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Time: ${elapsed}s`);

  if (!DRY_RUN) {
    await populatePgvector(db);
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
