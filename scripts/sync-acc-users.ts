/**
 * Standalone bulk ACC user sync — refreshes the AccMemberCache from ACC HQ v1,
 * which is the only path that populates `companyRole`, `lastSignIn`, and
 * `isAccountAdmin`. Same logic as the in-app `users.bulkAccSync` mutation,
 * extracted to a script for manual / scheduled refreshes now that Railway's
 * release cron is retired.
 *
 * Usage (PowerShell, Node 22+ for --env-file):
 *   node --env-file=.env --import tsx scripts/sync-acc-users.ts
 *
 * Requires env vars (loaded from .env automatically by tsx):
 *   - DATABASE_URL (or DIRECT_URL)
 *   - APS_CLIENT_ID, APS_CLIENT_SECRET, APS_HUB_ID
 *
 * Exit codes:
 *   0 — sync succeeded
 *   1 — sync failed (token, account-id, or unrecoverable API error)
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pLimit from "p-limit";
import { get2LeggedAutodeskToken } from "../lib/server/aps-user-token";
import { getAccountId } from "../lib/server/acc-helpers";
import {
  fetchAllAccUsers,
  fetchAccUserProjects,
  fetchAccUserRoles,
  fetchAccUserProducts,
  type AccProject,
} from "../lib/server/acc-admin";
import { rebuildAccGraphCache } from "../lib/server/graph-rebuild";

function createPrisma(): PrismaClient {
  const url =
    (process.env.DIRECT_URL && process.env.DIRECT_URL.trim()) ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!url) {
    throw new Error("DATABASE_URL or DIRECT_URL must be set");
  }
  const adapter = new PrismaPg({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter, log: ["error"] }) as unknown as PrismaClient;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const prisma = createPrisma();

  console.log("[sync-acc-users] starting");

  let accessToken: string;
  try {
    accessToken = await get2LeggedAutodeskToken();
  } catch (err) {
    console.error("[sync-acc-users] failed to acquire APS token:", err);
    process.exitCode = 1;
    return;
  }

  let accountId: string;
  try {
    accountId = await getAccountId(prisma);
  } catch (err) {
    console.error("[sync-acc-users] failed to resolve accountId — is APS_HUB_ID set?", err);
    process.exitCode = 1;
    return;
  }

  // 1. Prefetch the entire ACC user list once and build an email → user map.
  let accUserByEmail: Map<string, Awaited<ReturnType<typeof fetchAllAccUsers>>[number]>;
  try {
    const allAccUsers = await fetchAllAccUsers(accountId, accessToken);
    accUserByEmail = new Map(allAccUsers.map((u) => [u.email.toLowerCase(), u]));
    console.log(`[sync-acc-users] prefetched ${allAccUsers.length} ACC hub users`);
  } catch (err) {
    console.error("[sync-acc-users] failed to prefetch ACC user list:", err);
    process.exitCode = 1;
    return;
  }

  // 2. Sync the full set — ACC hub users plus any locally-registered users
  //    that may not be in ACC (those get cached as notFound so the UI still
  //    shows them with that status).
  const emails = Array.from(
    new Set([
      ...Array.from(accUserByEmail.values(), (u) => u.email),
      ...(await prisma.user.findMany({ select: { email: true } })).map((u) => u.email),
    ]),
  );
  console.log(`[sync-acc-users] sync target: ${emails.length} emails`);

  let found = 0;
  let notFound = 0;
  let errors = 0;
  let processed = 0;

  // 3. Concurrency 3 — each found user fans out to 3 paginated API calls.
  //    Higher concurrency blew past ACC rate limits in earlier sync runs.
  const limit = pLimit(3);
  await Promise.all(
    emails.map((email) =>
      limit(async () => {
        try {
          const accUser = accUserByEmail.get(email.toLowerCase());

          if (!accUser) {
            const result = { found: false as const, syncedAt: new Date().toISOString() };
            await prisma.accMemberCache.upsert({
              where: { email },
              create: { email, data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
              update: { data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
            });
            notFound++;
            return;
          }

          const [projects, rolesByProject, productsByProject] = await Promise.all([
            fetchAccUserProjects(accountId, accUser.id, accessToken).catch(() => [] as AccProject[]),
            fetchAccUserRoles(accountId, accUser.id, accessToken).catch(() => new Map<string, string[]>()),
            fetchAccUserProducts(accountId, accUser.id, accessToken).catch(() => new Map<string, string[]>()),
          ]);

          const enrichedProjects: AccProject[] = projects.map((proj) => ({
            ...proj,
            roles: rolesByProject.get(proj.id) ?? proj.roles,
            modules: productsByProject.get(proj.id) ?? [],
          }));

          let normalizedAddedOn: string | null = null;
          if (typeof accUser.addedOn === "string" && accUser.addedOn.length > 0) {
            const ts = Date.parse(accUser.addedOn);
            normalizedAddedOn = Number.isFinite(ts) && ts > 0 ? new Date(ts).toISOString() : null;
          }

          const result = {
            found: true as const,
            autodeskId: accUser.id,
            name: accUser.name,
            status: accUser.status,
            role: accUser.role,
            company: accUser.company,
            addedOn: normalizedAddedOn,
            companyRole: accUser.companyRole,
            lastSignIn: accUser.lastSignIn,
            isAccountAdmin: accUser.isAccountAdmin,
            projects: enrichedProjects,
            syncedAt: new Date().toISOString(),
          };

          await prisma.accMemberCache.upsert({
            where: { email },
            create: { email, data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
            update: { data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
          });
          found++;
        } catch (err) {
          console.error(`[sync-acc-users] failed for ${email}:`, err instanceof Error ? err.message : err);
          errors++;
        } finally {
          processed++;
          // Cheap progress signal every 100 emails so a 1000-user sync isn't silent.
          if (processed % 100 === 0) {
            console.log(`[sync-acc-users] progress ${processed}/${emails.length}`);
          }
        }
      }),
    ),
  );

  console.log(`[sync-acc-users] sync complete: found=${found} notFound=${notFound} errors=${errors}`);

  // 4. Rebuild the graph cache so the spatial view picks up fresh nodes.
  try {
    const graph = await rebuildAccGraphCache(prisma);
    console.log(
      `[sync-acc-users] graph rebuilt: ${graph.stats.nodeCount} nodes, ${graph.stats.totalProjectInstances} instances, ${graph.stats.uniqueProjects} projects`,
    );
  } catch (err) {
    console.error("[sync-acc-users] graph rebuild failed (cache still updated):", err);
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[sync-acc-users] done in ${elapsedSec}s`);
}

main()
  .catch((err) => {
    console.error("[sync-acc-users] fatal:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    // PrismaPg holds connections; exit explicitly so the script doesn't hang.
    setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
  });
