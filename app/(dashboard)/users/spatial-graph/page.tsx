import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query";
import superjson from "superjson";
import {
  createAccRouteHelpers,
  prefetchAccessAnalysisRouteData,
} from "@/lib/server/acc-route-hydration";
import { AccessAnalysisShellClient } from "../access-analysis/AccessAnalysisShellClient";

// "Spatial Graph" (nav: Organization → Spatial Graph) now renders the access-analysis
// similarity graph. The previous force-directed SpatialGraphOnly view is retired.
export default async function Page(): Promise<React.JSX.Element> {
  const helpers = await createAccRouteHelpers();
  await prefetchAccessAnalysisRouteData(helpers);

  // createServerSideHelpers({ transformer: superjson }) serializes the whole
  // dehydrated state with superjson (a pages-router idiom). The App Router passes
  // `state` straight to HydrationBoundary, which expects a RAW DehydratedState —
  // so without deserializing here the boundary hydrates nothing and the client
  // refetches the multi-MB bulkUsers/instanceEmbedding payload on mount (~2 s on
  // the graph's critical path). Deserialize to restore the prefetch hydration.
  // Guarded on the superjson `{ json }` wrapper so a raw state passes through.
  const dehydrated = helpers.dehydrate();
  const state =
    (dehydrated as unknown as { json?: unknown }).json !== undefined
      ? (superjson.deserialize(dehydrated as never) as DehydratedState)
      : (dehydrated as DehydratedState);

  return (
    <HydrationBoundary state={state}>
      <div className="h-screen">
        <AccessAnalysisShellClient />
      </div>
    </HydrationBoundary>
  );
}
