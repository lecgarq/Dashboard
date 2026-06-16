import "server-only";

import { createServerSideHelpers } from "@trpc/react-query/server";
import superjson from "superjson";
import { ACC_SNAPSHOT_STALE_TIME_MS } from "@/lib/acc/cachePolicy";
import { appRouter } from "@/server/routers/root";
import { createTRPCContext } from "@/server/trpc";

export { ACC_SNAPSHOT_STALE_TIME_MS };

export async function createAccRouteHelpers() {
  return createServerSideHelpers({
    router: appRouter,
    ctx: await createTRPCContext(),
    transformer: superjson,
  });
}

export async function prefetchUsersRouteAccData(helpers: any) {
  const snapshotOptions = { staleTime: ACC_SNAPSHOT_STALE_TIME_MS };
  // NOTE: users.bulkAccSummary is deliberately NOT prefetched. The directory uses
  // it only as a FALLBACK source when accDcGraph.bulkUsers is empty (see
  // selectAccSummarySource); whenever the DC snapshot has data — i.e. always in
  // production — it's discarded. Prefetching it dehydrated a redundant ~7 MB of
  // superjson into the page HTML. The client query is gated to fetch it lazily
  // only when the DC snapshot is genuinely empty.
  await Promise.allSettled([
    helpers.accDcGraph.bulkUsers.prefetch(undefined, snapshotOptions),
    helpers.accMembers.enrichedUsers.prefetch(undefined, snapshotOptions),
    helpers.users.getOrgDirectory.prefetch(undefined, { staleTime: 5 * 60_000 }),
    helpers.users.getDirectory.prefetch(undefined, { staleTime: 5 * 60_000 }),
  ]);
}

export async function prefetchAccessAnalysisRouteData(helpers: any) {
  // The input MUST match the client query in AccessAnalysisShell.tsx exactly —
  // tRPC/React-Query include the input in the cache key, so a mismatch silently
  // misses the hydration cache and forces the client to re-fetch the whole
  // multi-MB bulkUsers payload over the network after mount. Keep these in sync.
  await Promise.allSettled([
    helpers.accDcGraph.bulkUsers.prefetch(
      { includePermissionSummary: true, includeActivityMix: true },
      { staleTime: ACC_SNAPSHOT_STALE_TIME_MS },
    ),
    helpers.accDcGraph.instanceEmbedding.prefetch(undefined, {
      staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
    }),
  ]);
}
