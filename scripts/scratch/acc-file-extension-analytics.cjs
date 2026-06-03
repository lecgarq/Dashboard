#!/usr/bin/env node
/**
 * scripts/scratch/acc-file-extension-analytics.cjs
 *
 * Advanced File Extension & Discipline Analytics Tool.
 * Parses filenames inside the "details" payload across the 214,080+ activity logs
 * to measure true digital engineering activity shares (BIM vs CAD vs PDF vs Admin).
 */

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("==========================================================================");
    console.log("             LECG / HERMOSILLO ACC FILE DISCIPLINE ANALYTICS REPORT        ");
    console.log("==========================================================================\n");

    // Fetch all logs that look like file actions (have details and have file extensions or standard file operations)
    console.log("[analytics] Scanning database for file-based activity logs...");
    const logs = await prisma.$queryRaw`
      SELECT "rawAction", "details", COUNT(*)::int as cnt
      FROM "AccActivity"
      WHERE "details" IS NOT NULL
      GROUP BY "rawAction", "details"
    `;

    console.log(`[analytics] Found ${logs.length} distinct action-file combinations. Calculating stats...\n`);

    const extensionStats = {
      RVT: { label: "BIM / 3D Models (.rvt)", count: 0, files: new Map() },
      DWG: { label: "CAD / 2D Drawings (.dwg)", count: 0, files: new Map() },
      PDF: { label: "PDF Plans & Sheets (.pdf)", count: 0, files: new Map() },
      ADMIN: { label: "Administrative Documents (.xlsx, .docx, .pptx, .csv)", count: 0, files: new Map() },
      MEDIA: { label: "Visual / Photos (.png, .jpg, .mp4)", count: 0, files: new Map() },
      SYSTEM: { label: "System / Workflows / Admin Actions", count: 0, files: new Map() }
    };

    let totalFileLogs = 0;

    for (const log of logs) {
      const details = String(log.details || "").trim();
      const count = log.cnt;
      
      // Parse file extension using regex
      const match = details.match(/\.([a-zA-Z0-9]{3,4})$/);
      const ext = match ? match[1].toLowerCase() : null;

      let cat = "SYSTEM";
      if (ext) {
        if (ext === "rvt" || ext === "nwd" || ext === "nwf" || ext === "ifc") {
          cat = "RVT";
        } else if (ext === "dwg" || ext === "dxf" || ext === "dwf") {
          cat = "DWG";
        } else if (ext === "pdf") {
          cat = "PDF";
        } else if (["xlsx", "xls", "docx", "doc", "pptx", "csv", "txt"].includes(ext)) {
          cat = "ADMIN";
        } else if (["png", "jpg", "jpeg", "gif", "mp4", "mov"].includes(ext)) {
          cat = "MEDIA";
        }
      }

      extensionStats[cat].count += count;
      totalFileLogs += count;

      // Track top files in each category
      if (details.length > 5 && cat !== "SYSTEM") {
        const fileMap = extensionStats[cat].files;
        fileMap.set(details, (fileMap.get(details) || 0) + count);
      }
    }

    // Print breakdown
    console.log("--------------------------------------------------------------------------");
    console.log("  FILE DISCIPLINE BREAKDOWN & DIGITAL UTILIZATION SHARE");
    console.log("--------------------------------------------------------------------------");
    
    Object.keys(extensionStats).forEach(key => {
      const cat = extensionStats[key];
      const percent = totalFileLogs > 0 ? ((cat.count / totalFileLogs) * 100).toFixed(1) : "0.0";
      console.log(` 📂 ${cat.label.padEnd(52)} : ${cat.count.toLocaleString().padStart(8)} logs (${percent}%)`);
    });

    console.log("--------------------------------------------------------------------------");
    console.log(` Total Analyzed File Interactions: ${totalFileLogs.toLocaleString()} logs\n`);

    // Print Top Files per engineering discipline
    console.log("--------------------------------------------------------------------------");
    console.log("  TOP 3 INTERACTED FILES BY ENGINEERING DISCIPLINE");
    console.log("--------------------------------------------------------------------------");

    ["RVT", "DWG", "PDF", "ADMIN"].forEach(key => {
      const cat = extensionStats[key];
      console.log(`\n🔹 ${cat.label}:`);
      
      const sortedFiles = Array.from(cat.files.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      if (sortedFiles.length > 0) {
        sortedFiles.forEach(([filename, count], idx) => {
          console.log(`   #${idx + 1}. [${count.toLocaleString()} actions] ${filename}`);
        });
      } else {
        console.log("   (No specific files logged in this category)");
      }
    });

    console.log("\n==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
