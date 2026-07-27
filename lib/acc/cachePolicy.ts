export const ACC_SNAPSHOT_STALE_TIME_MS = 10 * 60_000;

// PERF-03/PERF-05: the /users directory's bulkUsers input, shared by the
// server prefetch (acc-route-hydration.ts) and the client query
// (useUsersDirectoryData.ts) so the tRPC/React-Query cache key is identical
// on both sides and the hydration cache is always hit on mount.
//
// It MUST live in this directive-free module. It originally lived in
// useUsersDirectoryData.ts ("use client"): importing any export of a
// "use client" module from server code yields a client-reference proxy, not
// the object — the SSR prefetch then errored on input parse and the client
// silently refetched the full payload (masked until PERF-05 fixed hydration).
export const BULK_USERS_LEAN_INPUT = { leanProjects: true } as const;
