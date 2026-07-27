import { describe, expect, it } from "vitest";
import type { DehydratedState } from "@tanstack/react-query";
import superjson from "superjson";
import { deserializeHydrationState } from "./hydrationState";

// PERF-05 pin: the App Router <HydrationBoundary> needs a RAW DehydratedState.
// createServerSideHelpers({ transformer: superjson }).dehydrate() returns a
// superjson-wrapped { json, meta } object instead — this helper must unwrap it
// and must NOT touch an already-raw state. If either branch breaks, prefetched
// queries silently refetch on mount app-wide (the v2.4 PERF-04 bug class).

const updatedAt = new Date("2026-07-16T12:00:00Z");

const rawState: DehydratedState = {
  mutations: [],
  queries: [
    {
      queryKey: [["accDcGraph", "bulkUsers"], { input: { lean: true }, type: "query" }],
      queryHash: '[["accDcGraph","bulkUsers"],{"input":{"lean":true},"type":"query"}]',
      state: {
        data: { rows: [{ id: "u1::p1", updatedAt }], total: 1 },
        dataUpdateCount: 1,
        dataUpdatedAt: updatedAt.getTime(),
        error: null,
        errorUpdateCount: 0,
        errorUpdatedAt: 0,
        fetchFailureCount: 0,
        fetchFailureReason: null,
        fetchMeta: null,
        isInvalidated: false,
        status: "success",
        fetchStatus: "idle",
      },
    },
  ],
} as unknown as DehydratedState;

describe("deserializeHydrationState (PERF-05)", () => {
  it("unwraps a superjson-wrapped dehydrated state back to the raw shape", () => {
    const wrapped = superjson.serialize(rawState);
    // Sanity: the wrapper is what dehydrate() actually emits — { json, meta }.
    expect((wrapped as { json?: unknown }).json).toBeDefined();

    const result = deserializeHydrationState(wrapped);

    expect(result).toStrictEqual(rawState);
    // The superjson-sensitive value survives as a real Date, proving genuine
    // deserialization rather than a passthrough of the wrapper.
    const data = result.queries[0]?.state.data as { rows: Array<{ updatedAt: unknown }> };
    expect(data.rows[0]?.updatedAt).toBeInstanceOf(Date);
  });

  it("passes an already-raw dehydrated state through unchanged (same reference)", () => {
    expect(deserializeHydrationState(rawState)).toBe(rawState);
  });
});
