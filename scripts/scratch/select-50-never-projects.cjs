#!/usr/bin/env node
// Read-only: pick 50 active AccProject rows with folderCrawlStatus='never'.
// Stride sample across alphabetical ordering so prefixes diversify
// (alphabetical first-50 was 100% CDMX; stride avoids that).
"use strict";

require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

(async () => {
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!url) throw new Error("DATABASE_URL/DIRECT_URL not set");
  const adapter = new PrismaPg({ connectionString: url, max: 2 });
  const prisma = new PrismaClient({ adapter });
  try {
    const all = await prisma.accProject.findMany({
      where: { status: "active", folderCrawlStatus: "never" },
      select: { id: true, name: true, folderCrawlStatus: true },
      orderBy: { name: "asc" },
    });
    console.log(`Total active never-projects available: ${all.length}`);
    const N = 50;
    if (all.length < N) throw new Error(`pool < ${N}`);
    const stride = Math.floor(all.length / N);
    const picked = [];
    for (let i = 0; i < N; i++) {
      const idx = Math.min(i * stride, all.length - 1);
      picked.push(all[idx]);
    }
    // Sanity: all unique & all 'never'
    const ids = new Set(picked.map((p) => p.id));
    if (ids.size !== N) throw new Error(`duplicates in stride; got ${ids.size}`);
    if (picked.some((p) => p.folderCrawlStatus !== "never"))
      throw new Error("non-never picked");

    // Prefix distribution
    const prefix = {};
    for (const p of picked) {
      const k = (p.name.split(/\s+/)[0] || "?").toUpperCase();
      prefix[k] = (prefix[k] || 0) + 1;
    }
    console.log(`Selected: ${picked.length}`);
    console.log("Prefix distribution:", prefix);
    for (const p of picked) console.log(`  ${p.id}\t${p.name}`);
    console.log("---FOLDER_CRAWL_PROJECT_IDS---");
    console.log(picked.map((p) => p.id).join(","));
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
