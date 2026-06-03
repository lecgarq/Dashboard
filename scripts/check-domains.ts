/**
 * Quick diagnostic: domain breakdown of cached ACC users + companyRole fill rate.
 * Run: node --env-file=.env --import tsx scripts/check-domains.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrisma(): PrismaClient {
  const url =
    (process.env.DIRECT_URL && process.env.DIRECT_URL.trim()) ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  const adapter = new PrismaPg({ connectionString: url, max: 2 });
  return new PrismaClient({ adapter, log: ["error"] }) as unknown as PrismaClient;
}

async function main() {
  const prisma = createPrisma();
  const rows = await prisma.accMemberCache.findMany({
    select: { email: true, data: true },
  });

  const domains = new Map<string, number>();
  let companyRoleFilled = 0;
  let companyRoleEmpty = 0;
  let foundCount = 0;
  let notFoundCount = 0;

  for (const row of rows) {
    const domain = row.email.split("@")[1]?.toLowerCase() ?? "(no domain)";
    domains.set(domain, (domains.get(domain) ?? 0) + 1);

    const data = row.data as { found?: boolean; companyRole?: unknown } | null;
    if (data?.found === true) {
      foundCount++;
      if (typeof data.companyRole === "string" && data.companyRole.length > 0) {
        companyRoleFilled++;
      } else {
        companyRoleEmpty++;
      }
    } else {
      notFoundCount++;
    }
  }

  const sortedDomains = [...domains.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`Total cached rows: ${rows.length}`);
  console.log(`  Found (in ACC):    ${foundCount}`);
  console.log(`  Not found:         ${notFoundCount}`);
  console.log(``);
  console.log(`companyRole populated: ${companyRoleFilled} / ${foundCount} (${((companyRoleFilled / Math.max(1, foundCount)) * 100).toFixed(1)}%)`);
  console.log(`companyRole empty:     ${companyRoleEmpty}`);
  console.log(``);
  console.log(`Top 20 email domains:`);
  for (const [domain, count] of sortedDomains.slice(0, 20)) {
    const pct = ((count / rows.length) * 100).toFixed(1);
    console.log(`  ${count.toString().padStart(5)} (${pct.padStart(4)}%)  ${domain}`);
  }
  if (sortedDomains.length > 20) {
    const rest = sortedDomains.slice(20).reduce((s, [, c]) => s + c, 0);
    console.log(`  ${rest.toString().padStart(5)}         (${sortedDomains.length - 20} more domains)`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
