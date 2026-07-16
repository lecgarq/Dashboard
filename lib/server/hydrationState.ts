import type { DehydratedState } from "@tanstack/react-query";
import superjson from "superjson";

/**
 * PERF-05 (v2.5 Phase 33): shared hydration-boundary fix.
 *
 * createServerSideHelpers({ transformer: superjson }) serializes the whole
 * dehydrated state with superjson (a Pages-Router idiom), returning a wrapped
 * `{ json, meta }` object. The App Router passes `state` straight to
 * <HydrationBoundary>, which expects a RAW DehydratedState — so without
 * deserializing here the boundary hydrates nothing and every prefetched query
 * silently refetches on mount (multi-MB payloads on the graph/users routes,
 * families/kpi/clash/sim/exam/trello on the layout). Deserialize to restore
 * the prefetch hydration. Guarded on the superjson `{ json }` wrapper so a
 * raw state passes through unchanged.
 *
 * Root-cause record: MILESTONES.md v2.4 trap #2, CONCERNS §Ph28.1(1).
 */
export function deserializeHydrationState(state: unknown): DehydratedState {
  if ((state as { json?: unknown }).json !== undefined) {
    return superjson.deserialize(state as never) as DehydratedState;
  }
  return state as DehydratedState;
}
