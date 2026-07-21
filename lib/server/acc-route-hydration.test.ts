import { describe, expect, it, vi } from "vitest";
import {
  ACC_SNAPSHOT_STALE_TIME_MS,
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
      graphSnapshot: { prefetch: vi.fn(async () => undefined) },
      instanceEmbedding: { prefetch: vi.fn(async () => undefined) },
    },
    accMembers: {
      enrichedUsers: { prefetch: vi.fn(async () => undefined) },
    },
    accActivity: {
      lastFileActivityByEmailAll: { prefetch: vi.fn(async () => undefined) },
    },
  };
}

describe("ACC route hydration", () => {
  it("prefetches the /users ACC + directory queries but NOT the fallback-only bulkAccSummary", async () => {
    const helpers = makeHelpers();

    await prefetchUsersRouteAccData(helpers as never);

    // bulkAccSummary is a fallback source (used only when the DC snapshot is
    // empty) — prefetching it dehydrated ~7 MB of redundant superjson, so it is
    // intentionally left to the client's gated lazy query.
    expect(helpers.users.bulkAccSummary.prefetch).not.toHaveBeenCalled();
    // leanProjects:true must match the UsersDirectoryClient query key (hydration parity).
    expect(helpers.accDcGraph.bulkUsers.prefetch).toHaveBeenCalledWith(
      { leanProjects: true },
      { staleTime: ACC_SNAPSHOT_STALE_TIME_MS },
    );
    expect(helpers.accMembers.enrichedUsers.prefetch).toHaveBeenCalledWith(undefined, {
      staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
    });
    expect(helpers.users.getOrgDirectory.prefetch).toHaveBeenCalled();
    expect(helpers.users.getDirectory.prefetch).toHaveBeenCalled();
    // G1/G5: the per-user last-file-activity map must be prefetched (undefined
    // input, matching the client useQuery) so the "Last active" column hydrates
    // on mount instead of refetching after hydration.
    expect(helpers.accActivity.lastFileActivityByEmailAll.prefetch).toHaveBeenCalledWith(
      undefined,
      { staleTime: 5 * 60_000 },
    );
  });
});
