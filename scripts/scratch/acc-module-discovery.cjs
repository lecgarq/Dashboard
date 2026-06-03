#!/usr/bin/env node
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // 1. Distinct services in AccActivity
    console.log("=== DISTINCT SERVICES IN AccActivity ===");
    const services = await prisma.$queryRaw`
      SELECT "service", COUNT(*)::int as cnt
      FROM "AccActivity"
      GROUP BY "service"
      ORDER BY cnt DESC
    `;
    services.forEach(s => console.log(`  ${s.service || "(null)"}: ${s.cnt.toLocaleString()}`));

    // 2. Check AccProjectMember for module/product access
    console.log("\n=== AccProjectMember SAMPLE (first 5) ===");
    const members = await prisma.$queryRaw`
      SELECT email, "projectId", "products", "roles"
      FROM "AccProjectMember"
      WHERE products IS NOT NULL
      LIMIT 5
    `;
    console.log(JSON.stringify(members, null, 2));

    // 3. Check AccMemberCache for product/module data
    console.log("\n=== AccMemberCache product data sample ===");
    const cache = await prisma.$queryRaw`
      SELECT email, data->>'products' as products, data->'accessLevels' as "accessLevels"
      FROM "AccMemberCache"
      WHERE data->>'products' IS NOT NULL OR data->'accessLevels' IS NOT NULL
      LIMIT 3
    `;
    console.log(JSON.stringify(cache, null, 2));

    // 4. Distinct products in AccProjectMember
    console.log("\n=== DISTINCT PRODUCTS IN AccProjectMember ===");
    const products = await prisma.$queryRaw`
      SELECT DISTINCT unnest(products) as product
      FROM "AccProjectMember"
      WHERE products IS NOT NULL
      ORDER BY product
    `;
    products.forEach(p => console.log(`  - ${p.product}`));

    // 5. Service × rawAction distribution
    console.log("\n=== SERVICE × rawAction TOP COMBINATIONS ===");
    const serviceActions = await prisma.$queryRaw`
      SELECT "service", "rawAction", COUNT(*)::int as cnt
      FROM "AccActivity"
      WHERE "service" IS NOT NULL
      GROUP BY "service", "rawAction"
      ORDER BY cnt DESC
      LIMIT 20
    `;
    serviceActions.forEach(s => console.log(`  ${s.service} → ${s.rawAction}: ${s.cnt.toLocaleString()}`));

  } finally { await prisma.$disconnect(); await pool.end(); }
}
main().catch(console.error);
