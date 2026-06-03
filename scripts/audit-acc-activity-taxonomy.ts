import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { classifyActivity, inferActivityService } from "../lib/acc/activityCategories";

type CountMap = Record<string, number>;

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

function bump(map: CountMap, key: string, count: number) {
  map[key] = (map[key] ?? 0) + count;
}

function sortedMap(map: CountMap) {
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]));
}

async function main() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");

  const json = process.argv.includes("--json");
  const strict = process.argv.includes("--strict");
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 2, connectionTimeoutMillis: 5_000 }),
    log: ["error"],
  });

  try {
    const [totalRows, attributedRows, actionRows, serviceRows] = await Promise.all([
      prisma.accActivity.count(),
      prisma.accActivity.count({ where: { userEmail: { not: null } } }),
      prisma.accActivity.groupBy({
        by: ["rawAction", "service"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
      prisma.accActivity.groupBy({
        by: ["service"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
    ]);

    const category: CountMap = {};
    const subCategory: CountMap = {};
    const domain: CountMap = {};
    const entity: CountMap = {};
    const operation: CountMap = {};
    const impact: CountMap = {};
    const confidence: CountMap = {};
    const stream: CountMap = {};
    const unknownActions: Array<{ rawAction: string; service: string | null; count: number }> = [];
    const missingService: Array<{ rawAction: string; count: number; inferredService: string | null }> = [];

    for (const row of actionRows) {
      const count = row._count.id;
      const classified = classifyActivity(row.rawAction, row.service);
      bump(category, classified.category, count);
      bump(subCategory, classified.subCategory, count);
      bump(domain, classified.domain, count);
      bump(entity, classified.entity, count);
      bump(operation, classified.operation, count);
      bump(impact, classified.impact, count);
      bump(confidence, classified.confidence, count);
      bump(stream, classified.stream ?? "none", count);

      if (classified.confidence === "unknown") {
        unknownActions.push({ rawAction: row.rawAction, service: row.service, count });
      }
      if (!row.service) {
        missingService.push({
          rawAction: row.rawAction,
          count,
          inferredService: inferActivityService(row.rawAction),
        });
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      totals: {
        activityRows: totalRows,
        attributedRows,
        unattributedRows: totalRows - attributedRows,
        distinctRawActionServicePairs: actionRows.length,
        distinctServices: serviceRows.length,
      },
      services: serviceRows.map((row) => ({ service: row.service ?? "null", count: row._count.id })),
      category: sortedMap(category),
      subCategory: sortedMap(subCategory),
      domain: sortedMap(domain),
      entity: sortedMap(entity),
      operation: sortedMap(operation),
      impact: sortedMap(impact),
      confidence: sortedMap(confidence),
      stream: sortedMap(stream),
      unknownActions,
      missingService,
    };

    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("ACC Activity Taxonomy Audit");
      console.log(`Generated: ${report.generatedAt}`);
      console.log(`Rows: ${totalRows.toLocaleString()} total, ${attributedRows.toLocaleString()} attributed`);
      console.log(`Unknown taxonomy rows: ${unknownActions.reduce((sum, row) => sum + row.count, 0).toLocaleString()}`);
      console.log(`Rows missing service: ${missingService.reduce((sum, row) => sum + row.count, 0).toLocaleString()}`);
      console.log("\nBy service:");
      for (const row of report.services) console.log(`  ${row.service}: ${row.count.toLocaleString()}`);
      console.log("\nBy category:");
      for (const [key, count] of Object.entries(report.category)) console.log(`  ${key}: ${count.toLocaleString()}`);
      console.log("\nBy confidence:");
      for (const [key, count] of Object.entries(report.confidence)) console.log(`  ${key}: ${count.toLocaleString()}`);
      if (unknownActions.length > 0) {
        console.log("\nUnknown raw actions:");
        for (const row of unknownActions) {
          console.log(`  ${row.rawAction} (${row.service ?? "null"}): ${row.count.toLocaleString()}`);
        }
      }
    }

    if (strict && (unknownActions.length > 0 || missingService.length > 0)) {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
