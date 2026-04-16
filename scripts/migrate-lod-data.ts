/**
 * One-time LOD data migration script.
 *
 * Reads master_registry.json (streaming — 831 MB) and graph_data.json (28 MB),
 * then batch-upserts everything into PostgreSQL via Prisma.
 *
 * Usage:
 *   npx tsx scripts/migrate-lod-data.ts [--dry-run] [--limit N] [--start N]
 *
 * Options:
 *   --dry-run   Parse and log without writing to DB
 *   --limit N   Stop after N families
 *   --start N   Skip first N families (for resuming)
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { parser as makeParser } from "stream-json";
import { streamArray } from "stream-json/streamers/StreamArray";

// ── Config ──────────────────────────────────────────────────────────────────

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

// ── Types (raw JSON shapes) ──────────────────────────────────────────────────

interface RawFamily {
  id: string;
  name_of_image: string;
  name_of_file: string;
  original_file?: string;
  full_description?: string;
  confidence_level?: number;
  final_category?: string;
  possible_categories?: string[];
  level_of_detail?: number;
  lod_label?: string;
  provider?: string;
  output_path?: string;
  file_size_kb?: number;
  simplified_description?: string;
  image_embedding?: number[];
}

interface GraphNode {
  idx: number;
  id: string;
  x: number;
  y: number;
  neighbors: number[];
  family_name?: string;
  img?: string;
}

interface GraphData {
  nodes: GraphNode[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function confidenceToLabel(v?: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (v >= 0.8) return "HIGH";
  if (v >= 0.5) return "MEDIUM";
  return "LOW";
}

// Extract just the filename from a local Windows path
function imageFilename(outputPath?: string, nameOfFile?: string): string | undefined {
  if (outputPath) return path.basename(outputPath);
  if (nameOfFile) return nameOfFile;
  return undefined;
}

// ── Load graph data (28 MB — fits in memory) ─────────────────────────────────

function loadGraphData(): Map<string, GraphNode> {
  console.log("Loading graph_data.json...");
  const raw = fs.readFileSync(GRAPH_DATA, "utf8");
  const data: GraphData = JSON.parse(raw);
  const map = new Map<string, GraphNode>();
  for (const node of data.nodes) {
    map.set(node.id, node);
  }
  console.log(`  → ${map.size} graph nodes loaded`);
  return map;
}

// ── Load categories ───────────────────────────────────────────────────────────

function loadCategories(): Array<{ name: string; group?: string }> {
  if (!fs.existsSync(CATEGORIES_FILE)) return [];
  const raw = fs.readFileSync(CATEGORIES_FILE, "utf8");
  const data = JSON.parse(raw);
  // Handle either array of strings or object
  if (Array.isArray(data)) {
    return data.map((c: unknown) =>
      typeof c === "string" ? { name: c } : (c as { name: string; group?: string })
    );
  }
  if (typeof data === "object") {
    return Object.entries(data as Record<string, unknown>).map(([name, group]) => ({
      name,
      group: typeof group === "string" ? group : undefined,
    }));
  }
  return [];
}

// ── Batch processing ─────────────────────────────────────────────────────────

let processed = 0;
let skipped = 0;
let upserted = 0;
let errors = 0;

async function processBatch(
  db: PrismaClient,
  batch: RawFamily[],
  graphMap: Map<string, GraphNode>
) {
  if (DRY_RUN) {
    upserted += batch.length;
    return;
  }

  for (const item of batch) {
    try {
      const graphNode = graphMap.get(item.id);

      const familyData = {
        nameOfFile: item.name_of_file,
        familyName: graphNode?.family_name ?? item.name_of_image ?? null,
        finalCategory: item.final_category ?? null,
        lodLabel: item.lod_label ?? null,
        provider: item.provider ?? null,
        caption: item.simplified_description ?? null,
        fullDescription: item.full_description ?? null,
        confidenceLevel: confidenceToLabel(item.confidence_level),
        fileSizeKb: item.file_size_kb ?? null,
        possibleCategories: item.possible_categories ?? [],
        originalFile: item.original_file ?? null,
        imagePath: imageFilename(item.output_path, item.name_of_file) ?? null,
      };

      const family = await db.lodFamily.upsert({
        where: { nameOfFile: item.name_of_file },
        create: familyData,
        update: familyData,
        select: { id: true },
      });

      // Upsert embedding
      if (item.image_embedding && item.image_embedding.length > 0) {
        await db.lodEmbedding.upsert({
          where: { familyId: family.id },
          create: { familyId: family.id, vector: item.image_embedding },
          update: { vector: item.image_embedding },
        });
      }

      // Upsert graph node
      if (graphNode) {
        await db.lodGraphNode.upsert({
          where: { familyId: family.id },
          create: {
            familyId: family.id,
            x: graphNode.x,
            y: graphNode.y,
            neighbors: graphNode.neighbors,
          },
          update: {
            x: graphNode.x,
            y: graphNode.y,
            neighbors: graphNode.neighbors,
          },
        });
      }

      upserted++;
    } catch (err) {
      errors++;
      console.error(`Error upserting ${item.name_of_file}:`, err);
    }
  }
}

// ── pgvector column update ────────────────────────────────────────────────────

async function updatePgvectorColumn(db: PrismaClient) {
  console.log("\nUpdating pgvector column from float array...");
  // Convert the stored Float[] to an actual pgvector column for ANN search
  // This requires the LodEmbedding table to have a `pgvector` vector(768) column.
  // We use raw SQL since Prisma doesn't manage this column.
  try {
    await db.$executeRaw`
      UPDATE "LodEmbedding"
      SET pgvector = (
        '[' || array_to_string(vector::text[], ',') || ']'
      )::vector(768)
      WHERE pgvector IS NULL
        AND vector IS NOT NULL
        AND array_length(vector, 1) = 768
    `;
    console.log("  → pgvector column updated");
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("column") && err.message.includes("does not exist")) {
      console.log("  → pgvector column not yet created (run pgvector SQL migration first)");
    } else {
      throw err;
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== LOD Data Migration ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  if (START > 0) console.log(`Starting at index: ${START}`);
  if (LIMIT !== Infinity) console.log(`Limit: ${LIMIT}`);
  console.log();

  const graphMap = loadGraphData();

  // Upsert categories
  const db = new PrismaClient();
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
  let batch: RawFamily[] = [];
  let index = 0;

  await new Promise<void>((resolve, reject) => {
    const fileStream = fs.createReadStream(MASTER_REGISTRY);
    const pipeline = fileStream.pipe(makeParser()).pipe(streamArray());

    pipeline.on("data", async ({ value }: { value: RawFamily }) => {
      index++;

      if (index <= START) {
        skipped++;
        return;
      }

      if (processed >= LIMIT) {
        pipeline.destroy();
        resolve();
        return;
      }

      batch.push(value);
      processed++;

      if (batch.length >= BATCH_SIZE) {
        pipeline.pause();
        const current = [...batch];
        batch = [];
        try {
          await processBatch(db, current, graphMap);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = (upserted / parseFloat(elapsed)).toFixed(1);
          process.stdout.write(
            `\r  Processed: ${processed + skipped} | Upserted: ${upserted} | Errors: ${errors} | ${rate}/s  `
          );
        } catch (err) {
          reject(err);
          return;
        }
        pipeline.resume();
      }
    });

    pipeline.on("end", async () => {
      // Flush remaining batch
      if (batch.length > 0) {
        await processBatch(db, batch, graphMap);
      }
      resolve();
    });

    pipeline.on("error", reject);
    fileStream.on("error", reject);
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n");
  console.log("=== Migration Complete ===");
  console.log(`  Total scanned: ${index}`);
  console.log(`  Skipped (start offset): ${skipped}`);
  console.log(`  Upserted: ${upserted}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Time: ${elapsed}s`);

  if (!DRY_RUN) {
    await updatePgvectorColumn(db);
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
