import "server-only";

import { createServerSideHelpers } from "@trpc/react-query/server";
import superjson from "superjson";
// PERF-03/PERF-05: BULK_USERS_LEAN_INPUT is the input constant shared with
// the client query (useUsersDirectoryData re-exports it) so the
// tRPC/React-Query cache key is identical on both sides and the hydration
// cache is always hit on mount. It must be imported from the directive-free
// cachePolicy module: its previous home was the "use client"
// useUsersDirectoryData.ts, and importing a client module's export from this
// server file yielded a client-reference proxy — the prefetch input failed to
// parse, the SSR prefetch errored, and the client silently refetched the full
// payload on every /users mount.
import { ACC_SNAPSHOT_STALE_TIME_MS, BULK_USERS_LEAN_INPUT } from "@/lib/acc/cachePolicy";
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
    // PERF-03: BULK_USERS_LEAN_INPUT is the same constant the client query
    // uses — sharing it makes it structurally impossible for the prefetch and
    // client cache keys to drift (a mismatch silently misses the hydration
    // cache and forces a full re-fetch on mount).
    helpers.accDcGraph.bulkUsers.prefetch(BULK_USERS_LEAN_INPUT, snapshotOptions),
    helpers.accMembers.enrichedUsers.prefetch(undefined, snapshotOptions),
    helpers.users.getOrgDirectory.prefetch(undefined, { staleTime: 5 * 60_000 }),
    helpers.users.getDirectory.prefetch(undefined, { staleTime: 5 * 60_000 }),
    // G1/G5: per-user last-file-activity map drives the "Last active" column +
    // Active-30d KPI. Prefetch it here (staleTime matches the client useQuery in
    // useUsersDirectoryData) so it's hydrated on mount rather than a post-mount
    // fetch — keeps the column instant and avoids regressing first-paint speed.
    helpers.accActivity.lastFileActivityByEmailAll.prefetch(undefined, { staleTime: 5 * 60_000 }),
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
