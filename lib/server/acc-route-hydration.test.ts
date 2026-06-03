import { describe, expect, it, vi } from "vitest";
import {
  ACC_SNAPSHOT_STALE_TIME_MS,
  prefetchAccessAnalysisRouteData,
  prefetchUsersRouteAccData,
} from "./acc-route-hydration";

function makeHelpers() {
  return {
    users: {
      bulkAccSummary: { prefetch: vi.fn(async () => undefined) },
      getOrgDirectory: { prefetch: vi.fn(async () => undefined) },
      getDirectory: { prefetch: vi.fn(async () => undefined) },
    },
    accDcGraph: {
      bulkUsers: { prefetch: vi.fn(async () => undefined) },
    },
    accMembers: {
      enrichedUsers: { prefetch: vi.fn(async () => undefined) },
    },
  };
}

describe("ACC route hydration", () => {
  it("prefetches the exact /users ACC and directory queries used by useMergedAccUsers", async () => {
    const helpers = makeHelpers();

    await prefetchUsersRouteAccData(helpers as never);

    expect(helpers.users.bulkAccSummary.prefetch).toHaveBeenCalledWith(undefined, {
      staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
    });
    expect(helpers.accDcGraph.bulkUsers.prefetch).toHaveBeenCalledWith(undefined, {
      staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
    });
    expect(helpers.accMembers.enrichedUsers.prefetch).toHaveBeenCalledWith(undefined, {
      staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
    });
    expect(helpers.users.getOrgDirectory.prefetch).toHaveBeenCalled();
    expect(helpers.users.getDirectory.prefetch).toHaveBeenCalled();
  });

  it("prefetches the DC graph snapshot with the SAME input the client query uses (hydration-key parity)", async () => {
    const helpers = makeHelpers();

    await prefetchAccessAnalysisRouteData(helpers as never);

    // The input is part of the React-Query/tRPC cache key. It MUST match the
    // client query in AccessAnalysisShell.tsx — `{ includePermissionSummary:
    // true, includeActivityMix: true }` — or the dehydrated cache misses and the
    // client re-fetches the whole heavy payload over the network after mount.
    expect(helpers.accDcGraph.bulkUsers.prefetch).toHaveBeenCalledWith(
      { includePermissionSummary: true, includeActivityMix: true },
      { staleTime: ACC_SNAPSHOT_STALE_TIME_MS },
    );
    expect(helpers.users.bulkAccSummary.prefetch).not.toHaveBeenCalled();
    expect(helpers.accMembers.enrichedUsers.prefetch).not.toHaveBeenCalled();
  });
});
