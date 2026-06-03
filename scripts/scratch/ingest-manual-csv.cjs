#!/usr/bin/env node
/**
 * scripts/scratch/ingest-manual-csv.cjs
 *
 * A robust utility script to parse and ingest manually exported ACC Account Admin Activity logs.
 * Supports passing either a SINGLE CSV file or a DIRECTORY containing multiple 31-day CSV exports.
 * Uses Prisma's skipDuplicates to consolidate overlapping windows seamlessly.
 *
 * Usage:
 *   node scripts/scratch/ingest-manual-csv.cjs <path-to-csv-file-or-directory> [optional-projectId]
 */

const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse/sync");
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node scripts/scratch/ingest-manual-csv.cjs <path-to-csv-file-or-directory> [optional-projectId]");
    process.exit(1);
  }

  const targetPath = path.resolve(args[0]);
  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Path not found at ${targetPath}`);
    process.exit(1);
  }

  const defaultProjectId = args[1] || "";
  const isDirectory = fs.statSync(targetPath).isDirectory();

  const csvFiles = [];
  if (isDirectory) {
    const files = fs.readdirSync(targetPath);
    files.forEach(f => {
      if (f.toLowerCase().endsWith(".csv")) {
        csvFiles.push(path.join(targetPath, f));
      }
    });
    console.log(`[manual-ingest] Found ${csvFiles.length} CSV files in directory: ${targetPath}`);
  } else {
    csvFiles.push(targetPath);
  }

  if (csvFiles.length === 0) {
    console.error("[manual-ingest] Error: No CSV files to process.");
    process.exit(1);
  }

  // Initialize DB Client
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Cache project names to IDs map for fast lookup
    const projects = await prisma.accProject.findMany({ select: { id: true, name: true } });
    const projectNameToId = new Map();
    projects.forEach(p => {
      projectNameToId.set(p.name.toLowerCase().trim(), p.id);
    });

    console.log(`[manual-ingest] Loaded ${projects.length} existing project references for URN mapping.`);

    let grandTotalParsed = 0;
    let grandTotalInserted = 0;

    for (let fileIdx = 0; fileIdx < csvFiles.length; fileIdx++) {
      const csvPath = csvFiles[fileIdx];
      const filename = path.basename(csvPath);
      console.log(`\n--------------------------------------------------`);
      console.log(`[manual-ingest] [File ${fileIdx + 1}/${csvFiles.length}] Processing: ${filename}`);
      
      const csvContent = fs.readFileSync(csvPath, "utf-8");

      // Parse CSV
      let records;
      try {
        records = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
      } catch (err) {
        console.error(`[manual-ingest] Failed to parse ${filename}:`, err.message);
        continue;
      }

      console.log(`[manual-ingest] Parsed ${records.length.toLocaleString()} rows.`);
      if (records.length === 0) continue;

      grandTotalParsed += records.length;

      // Auto-detect header columns
      const first = records[0];
      const keys = Object.keys(first);

      const dateKey = keys.find(k => /date|created_at|time/i.test(k));
      const memberKey = keys.find(k => /member|user|by/i.test(k));
      const productKey = keys.find(k => /product|service|tool/i.test(k));
      const actionKey = keys.find(k => /activity type|action|type/i.test(k));
      const detailsKey = keys.find(k => /detail|description|event/i.test(k));
      const projectKey = keys.find(k => /project|obra/i.test(k));

      if (!dateKey || !actionKey) {
        console.error(`[manual-ingest] Error in ${filename}: Could not auto-detect critical columns.`);
        continue;
      }

      // Map rows to schema
      const toInsert = [];
      let unmappedProjectsCount = 0;

      for (const row of records) {
        const dateVal = new Date(row[dateKey]);
        if (isNaN(dateVal.getTime())) continue;

        const rawAction = (row[actionKey] || "").trim();
        if (!rawAction) continue;

        const userEmail = (row[memberKey] || "").includes("@") ? row[memberKey].trim() : null;
        const userName = (row[memberKey] || "").trim();
        const service = (row[productKey] || "").trim();
        const details = (row[detailsKey] || "").trim();

        // Resolve projectId
        let projectId = defaultProjectId;
        if (projectKey && row[projectKey]) {
          const pName = row[projectKey].toLowerCase().trim();
          projectId = projectNameToId.get(pName) || defaultProjectId;
          if (!projectId) {
            unmappedProjectsCount++;
          }
        }

        toInsert.push({
          createdAt: dateVal,
          rawAction,
          service: service || "unknown",
          userEmail,
          userName: userEmail ? null : userName || "Unknown User",
          details: details || "",
          projectId: projectId || "",
          sourceFile: "manual_backfill",
        });
      }

      console.log(`[manual-ingest] Prepared ${toInsert.length.toLocaleString()} rows for database.`);
      if (unmappedProjectsCount > 0) {
        console.warn(`[manual-ingest] ⚠️ Note: ${unmappedProjectsCount} rows could not match an existing Project URN (will use default/empty ID).`);
      }

      // Insert in batches of 5000
      const BATCH_SIZE = 5000;
      let fileInsertedCount = 0;

      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        const res = await prisma.accActivity.createMany({
          data: batch,
          skipDuplicates: true,
        });
        fileInsertedCount += res.count;
      }

      grandTotalInserted += fileInsertedCount;
      console.log(`[manual-ingest] Ingested ${fileInsertedCount.toLocaleString()} new records from ${filename}. (Overlap skipped: ${(toInsert.length - fileInsertedCount).toLocaleString()})`);
    }

    console.log(`\n==================================================`);
    console.log(`     BATCH MANUAL INGESTION RUN COMPLETE        `);
    console.log(`==================================================`);
    console.log(`Total CSV Files Processed  : ${csvFiles.length}`);
    console.log(`Total Rows Parsed          : ${grandTotalParsed.toLocaleString()}`);
    console.log(`Total New Rows Inserted    : ${grandTotalInserted.toLocaleString()}`);
    console.log(`Total Duplicates Skipped   : ${(grandTotalParsed - grandTotalInserted).toLocaleString()}`);
    console.log(`==================================================`);

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
