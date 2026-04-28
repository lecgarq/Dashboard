/**
 * Utility to check for synchronization drift between yjsState (binary)
 * and content (text/xml) fields in Wiki records.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkDrift() {
  console.log("--- Sync Drift Analysis ---");

  const tables = ["clashWiki", "simWiki"];
  let totalDrifts = 0;

  for (const table of tables) {
    console.log(`\nChecking ${table}...`);
    const records = await prisma[table].findMany({
      select: { id: true, title: true, yjsState: true, content: true },
    });

    for (const record of records) {
      const hasState = !!record.yjsState;
      const hasContent = !!record.content && record.content.length > 5; // Basic threshold

      if (hasState && !hasContent) {
        console.warn(`[DRIFT] ${record.id} (${record.title}): Has binary state but empty content!`);
        totalDrifts++;
      } else if (!hasState && hasContent) {
        console.warn(`[STALE] ${record.id} (${record.title}): Has content but no binary state (legacy?).`);
      } else if (hasState && hasContent) {
        // Basic length sanity check (approximate)
        if (Math.abs(record.yjsState.length - record.content.length) > 5000) {
          console.log(`[INFO] ${record.id}: High length difference (${record.yjsState.length} bytes vs ${record.content.length} chars)`);
        }
      }
    }
  }

  console.log(`\nScan complete. Found ${totalDrifts} critical drifts.`);
  await prisma.$disconnect();
}

checkDrift().catch(err => {
  console.error("Scan failed:", err);
  process.exit(1);
});
