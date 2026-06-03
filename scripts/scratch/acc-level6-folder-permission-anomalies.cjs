#!/usr/bin/env node
/**
 * scripts/scratch/acc-level6-folder-permission-anomalies.cjs
 *
 * LEVEL 6 — DEEP FOLDER NAMING × PERMISSION CROSS-REFERENTIAL ENGINE
 *
 *  37. NAMING CONVENTION VIOLATIONS — Folders without standard number prefixes (01_, 02_)
 *  38. FOLDER NAME COLLISION — Same name, different permissions across projects
 *  39. INVISIBLE FOLDERS — Folders with zero permission entries (no role can see them)
 *  40. PERMISSION FRAGMENTATION — Parent where every child has a DIFFERENT permission config
 *  41. LANGUAGE MIXING — English and Spanish folder names within the same project level
 *  42. ORPHAN FOLDERS — Folders referencing a non-existent parent
 *  43. HIDDEN DEEP ESCALATION — Deep folders with Upload/Edit buried under View-Only parents
 *  44. SENSITIVE CONTENT IN GENERIC PATHS — Financial/legal folder names inside non-restricted paths
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
    console.log("    LECG / HERMOSILLO LEVEL 6 — FOLDER NAMING × PERMISSION DEEP ENGINE    ");
    console.log("==========================================================================\n");

    // ======================================================================
    // 37. NAMING CONVENTION VIOLATIONS
    // Top-level folders under "Project Files" that don't follow 01_, 02_ prefix
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 📝 [WARNING 37] NAMING VIOLATIONS: MISSING STANDARD NUMBER PREFIX");
    console.log("--------------------------------------------------------------------------");

    const namingViolations = await prisma.$queryRaw`
      SELECT f.name, f."fullPath", p.name as "projectName"
      FROM "AccFolder" f
      JOIN "AccFolder" parent ON f."parentId" = parent.id
      JOIN "AccProject" p ON p.id = f."projectId"
      WHERE parent.name = 'Project Files'
        AND f.name !~ '^[0-9]{1,2}[_ .]'
        AND f.name !~ '^[0-9]{1,2}-'
        AND f.name NOT IN ('Plans', 'Shared', 'Photos', 'ProjectTb', 'specs')
        AND f.name NOT LIKE '%-%-%-%-%'
      ORDER BY p.name, f.name
      LIMIT 15
    `;

    if (namingViolations.length > 0) {
      console.log("Top-level folders under /Project Files/ without standard numbering prefix:");
      namingViolations.forEach((item, idx) => {
        console.log(`  #${idx + 1}. 📁 "${item.name}" in "${item.projectName}"`);
        console.log(`       Path: ${item.fullPath}`);
      });
    } else {
      console.log("✅ All top-level folders follow the standard numbering convention.");
    }

    // ======================================================================
    // 38. FOLDER NAME COLLISION — Same folder name, different permissions across projects
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 💥 [WARNING 38] FOLDER NAME COLLISION: SAME NAME, DIFFERENT PERMS ACROSS PROJECTS");
    console.log("--------------------------------------------------------------------------");

    const collisions = await prisma.$queryRaw`
      WITH folder_perms AS (
        SELECT f.name as folder_name, f."projectId",
               r.name as role_name, fp."permType"
        FROM "AccFolderPermission" fp
        JOIN "AccFolder" f ON f.id = fp."folderId"
        JOIN "AccRole" r ON r.id = fp."roleId"
        JOIN "AccFolder" parent ON f."parentId" = parent.id
        WHERE parent.name = 'Project Files'
          AND r.name = 'Architect'
      )
      SELECT folder_name, COUNT(DISTINCT "permType")::int as perm_variants,
             COUNT(DISTINCT "projectId")::int as project_count,
             ARRAY_AGG(DISTINCT "permType") as perms
      FROM folder_perms
      GROUP BY folder_name
      HAVING COUNT(DISTINCT "permType") >= 3
      ORDER BY perm_variants DESC
      LIMIT 10
    `;

    if (collisions.length > 0) {
      console.log("Same folder name has different 'Architect' permissions depending on project:");
      collisions.forEach((item, idx) => {
        console.log(`  #${idx + 1}. 📁 "${item.folder_name}" across ${item.project_count} projects`);
        console.log(`       Architect permission variants: [${item.perms.join(", ")}]`);
      });
    } else {
      console.log("✅ No folder name collisions detected.");
    }

    // ======================================================================
    // 39. INVISIBLE FOLDERS — Folders with ZERO permission entries
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 👁️ [WARNING 39] INVISIBLE FOLDERS: ZERO PERMISSION ENTRIES (NO ROLE CAN SEE)");
    console.log("--------------------------------------------------------------------------");

    const invisible = await prisma.$queryRaw`
      SELECT f.name, f."fullPath", p.name as "projectName"
      FROM "AccFolder" f
      JOIN "AccProject" p ON p.id = f."projectId"
      LEFT JOIN "AccFolderPermission" fp ON fp."folderId" = f.id
      WHERE fp.id IS NULL
        AND f."fullPath" IS NOT NULL
        AND LENGTH(f."fullPath") > 15
      ORDER BY p.name
      LIMIT 15
    `;

    if (invisible.length > 0) {
      console.log(`Folders with absolutely zero permission entries assigned:`);
      invisible.forEach((item, idx) => {
        console.log(`  #${idx + 1}. 📁 "${item.name}" in "${item.projectName}"`);
        console.log(`       Path: ${item.fullPath}`);
      });
    } else {
      console.log("✅ All folders have at least one permission entry.");
    }

    // ======================================================================
    // 40. PERMISSION FRAGMENTATION
    // Parent folders where EVERY child has a DIFFERENT permission configuration
    // (no inheritance, every folder is custom-configured)
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🧩 [WARNING 40] PERMISSION FRAGMENTATION: EVERY CHILD HAS DIFFERENT PERMS");
    console.log("--------------------------------------------------------------------------");

    const fragmentation = await prisma.$queryRaw`
      WITH child_perms AS (
        SELECT f."parentId", fp."roleId", fp."permType",
               COUNT(DISTINCT f.id)::int as child_count
        FROM "AccFolder" f
        JOIN "AccFolderPermission" fp ON fp."folderId" = f.id
        WHERE f."parentId" IS NOT NULL
        GROUP BY f."parentId", fp."roleId", fp."permType"
      ),
      parent_stats AS (
        SELECT "parentId", "roleId",
               COUNT(DISTINCT "permType")::int as unique_perms,
               SUM(child_count)::int as total_children
        FROM child_perms
        GROUP BY "parentId", "roleId"
        HAVING COUNT(DISTINCT "permType") >= 3 AND SUM(child_count) >= 5
      )
      SELECT parent.name as "parentName", parent."fullPath",
             r.name as "roleName",
             ps.unique_perms, ps.total_children,
             p.name as "projectName"
      FROM parent_stats ps
      JOIN "AccFolder" parent ON parent.id = ps."parentId"
      JOIN "AccRole" r ON r.id = ps."roleId"
      JOIN "AccProject" p ON p.id = parent."projectId"
      ORDER BY ps.unique_perms DESC, ps.total_children DESC
      LIMIT 10
    `;

    if (fragmentation.length > 0) {
      console.log("Parent folders where children have heavily fragmented permission configs:");
      fragmentation.forEach((item, idx) => {
        console.log(`  #${idx + 1}. 📁 "${item.parentName}" in "${item.projectName}"`);
        console.log(`       Role: "${item.roleName}" has ${item.unique_perms} different perm levels across ${item.total_children} child folders`);
        console.log(`       Path: ${item.fullPath || "N/A"}`);
      });
    } else {
      console.log("✅ No extreme permission fragmentation detected.");
    }

    // ======================================================================
    // 41. LANGUAGE MIXING — English and Spanish folder names at the same level
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🌐 [WARNING 41] LANGUAGE MIXING: ENGLISH + SPANISH AT SAME DIRECTORY LEVEL");
    console.log("--------------------------------------------------------------------------");

    // Detect by checking siblings under "Project Files" for Spanish-specific keywords
    const spanishKeywords = ['documentos', 'planos', 'seguridad', 'calidad', 'entrega', 'contrato', 'presupuesto'];
    const englishKeywords = ['documents', 'drawings', 'safety', 'quality', 'delivery', 'contract', 'budget'];

    const projectFolders = await prisma.$queryRaw`
      SELECT f."projectId", p.name as "projectName",
             ARRAY_AGG(f.name ORDER BY f.name) as siblings
      FROM "AccFolder" f
      JOIN "AccFolder" parent ON f."parentId" = parent.id
      JOIN "AccProject" p ON p.id = f."projectId"
      WHERE parent.name = 'Project Files'
      GROUP BY f."projectId", p.name
      HAVING COUNT(*) >= 3
      LIMIT 50
    `;

    const mixedResults = [];
    for (const proj of projectFolders) {
      const names = (proj.siblings || []).map(n => n.toLowerCase());
      const hasSpanish = names.some(n => spanishKeywords.some(kw => n.includes(kw)));
      const hasEnglish = names.some(n => englishKeywords.some(kw => n.includes(kw)));
      if (hasSpanish && hasEnglish) {
        const spanishFolders = (proj.siblings || []).filter(n => spanishKeywords.some(kw => n.toLowerCase().includes(kw)));
        const englishFolders = (proj.siblings || []).filter(n => englishKeywords.some(kw => n.toLowerCase().includes(kw)));
        mixedResults.push({ project: proj.projectName, spanish: spanishFolders, english: englishFolders });
      }
    }

    if (mixedResults.length > 0) {
      console.log(`${mixedResults.length} projects mixing English and Spanish folder names:`);
      mixedResults.slice(0, 8).forEach((item, idx) => {
        console.log(`  #${idx + 1}. "${item.project}"`);
        console.log(`       🇪🇸 Spanish: [${item.spanish.join(", ")}]`);
        console.log(`       🇺🇸 English: [${item.english.join(", ")}]`);
      });
    } else {
      console.log("✅ No language mixing detected at the top folder level.");
    }

    // ======================================================================
    // 42. ORPHAN FOLDERS — Folders referencing a non-existent parent
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔗 [WARNING 42] ORPHAN FOLDERS: BROKEN PARENT REFERENCES");
    console.log("--------------------------------------------------------------------------");

    const orphans = await prisma.$queryRaw`
      SELECT f.name, f."fullPath", f."parentId", p.name as "projectName"
      FROM "AccFolder" f
      JOIN "AccProject" p ON p.id = f."projectId"
      LEFT JOIN "AccFolder" parent ON f."parentId" = parent.id
      WHERE f."parentId" IS NOT NULL AND parent.id IS NULL
      LIMIT 10
    `;

    if (orphans.length > 0) {
      console.log("Folders with broken parent references (orphaned in the tree):");
      orphans.forEach((item, idx) => {
        console.log(`  #${idx + 1}. 📁 "${item.name}" | Parent ID: ${item.parentId} (NOT FOUND)`);
        console.log(`       Project: "${item.projectName}" | Path: ${item.fullPath || "N/A"}`);
      });
    } else {
      console.log("✅ All folder parent references are valid.");
    }

    // ======================================================================
    // 43. HIDDEN DEEP ESCALATION
    // Deep folders (depth >= 4) with Upload/Edit buried under View-Only ancestors
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔓 [WARNING 43] HIDDEN DEEP ESCALATION: WRITE ACCESS BURIED UNDER VIEW-ONLY");
    console.log("--------------------------------------------------------------------------");

    const deepEscalation = await prisma.$queryRaw`
      WITH deep_write AS (
        SELECT f.id, f.name, f."fullPath", f."parentId", f."projectId",
               fp."permType", r.name as "roleName"
        FROM "AccFolder" f
        JOIN "AccFolderPermission" fp ON fp."folderId" = f.id
        JOIN "AccRole" r ON r.id = fp."roleId"
        WHERE fp."permType" IN ('View+Download+Upload', 'View+Download+Upload+Edit', 'Full Controller')
          AND LENGTH(f."fullPath") - LENGTH(REPLACE(f."fullPath", '/', '')) >= 5
      )
      SELECT dw.name, dw."fullPath", dw."roleName", dw."permType",
             parent_fp."permType" as "parentPerm",
             parent.name as "parentName",
             p.name as "projectName"
      FROM deep_write dw
      JOIN "AccFolder" parent ON dw."parentId" = parent.id
      JOIN "AccFolderPermission" parent_fp ON parent_fp."folderId" = parent.id
        AND parent_fp."roleId" = (
          SELECT fp2."roleId" FROM "AccFolderPermission" fp2
          JOIN "AccRole" r2 ON r2.id = fp2."roleId"
          WHERE fp2."folderId" = dw.id AND r2.name = dw."roleName"
          LIMIT 1
        )
      JOIN "AccProject" p ON p.id = dw."projectId"
      WHERE parent_fp."permType" = 'View Only'
      LIMIT 10
    `;

    if (deepEscalation.length > 0) {
      console.log("Deep folders with write access hidden under View-Only parents:");
      deepEscalation.forEach((item, idx) => {
        console.log(`  #${idx + 1}. 📁 "${item.name}" | Role: "${item.roleName}"`);
        console.log(`       Parent "${item.parentName}" = ${item.parentPerm} → Child = ${item.permType}`);
        console.log(`       Project: "${item.projectName}" | Path: ${item.fullPath}`);
      });
    } else {
      console.log("✅ No hidden deep permission escalations detected.");
    }

    // ======================================================================
    // 44. SENSITIVE CONTENT IN GENERIC PATHS
    // Financial/legal folder names buried inside non-restricted generic paths
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔍 [WARNING 44] SENSITIVE NAMES INSIDE GENERIC UNRESTRICTED PATHS");
    console.log("--------------------------------------------------------------------------");

    const sensitiveInGeneric = await prisma.$queryRaw`
      SELECT f.name, f."fullPath", p.name as "projectName",
             fp."permType", r.name as "roleName"
      FROM "AccFolder" f
      JOIN "AccProject" p ON p.id = f."projectId"
      JOIN "AccFolderPermission" fp ON fp."folderId" = f.id
      JOIN "AccRole" r ON r.id = fp."roleId"
      WHERE (
        LOWER(f.name) LIKE '%salario%' OR LOWER(f.name) LIKE '%sueldo%'
        OR LOWER(f.name) LIKE '%nomina%' OR LOWER(f.name) LIKE '%payroll%'
        OR LOWER(f.name) LIKE '%bonus%' OR LOWER(f.name) LIKE '%confidencial%'
        OR LOWER(f.name) LIKE '%password%' OR LOWER(f.name) LIKE '%credential%'
        OR LOWER(f.name) LIKE '%fianza%' OR LOWER(f.name) LIKE '%garantia%'
        OR LOWER(f.name) LIKE '%poliza%' OR LOWER(f.name) LIKE '%seguro %'
        OR LOWER(f.name) LIKE '%estimacion%' OR LOWER(f.name) LIKE '%anticipo%'
        OR LOWER(f.name) LIKE '%penalizacion%' OR LOWER(f.name) LIKE '%deductiva%'
      )
      AND fp."permType" NOT IN ('No Access')
      ORDER BY f.name
      LIMIT 15
    `;

    if (sensitiveInGeneric.length > 0) {
      console.log("Highly sensitive folders (payroll, insurance, penalties) with access:");
      sensitiveInGeneric.forEach((item, idx) => {
        console.log(`  #${idx + 1}. 📁 "${item.name}" | Role: "${item.roleName}" → "${item.permType}"`);
        console.log(`       Project: "${item.projectName}" | Path: ${item.fullPath || "N/A"}`);
      });
    } else {
      console.log("✅ No sensitive financial/HR folders found with open access.");
    }

    console.log("\n==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
