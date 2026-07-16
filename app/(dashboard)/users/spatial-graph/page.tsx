import { HydrationBoundary } from "@tanstack/react-query";
import {
  createAccRouteHelpers,
  prefetchAccessAnalysisRouteData,
} from "@/lib/server/acc-route-hydration";
import { deserializeHydrationState } from "@/lib/server/hydrationState";
import { AccessAnalysisShellClient } from "../access-analysis/AccessAnalysisShellClient";

// "Spatial Graph" (nav: Organization → Spatial Graph) now renders the access-analysis
// similarity graph. The previous force-directed SpatialGraphOnly view is retired.
export default async function Page(): Promise<React.JSX.Element> {
  const helpers = await createAccRouteHelpers();
  await prefetchAccessAnalysisRouteData(helpers);

  return (
    <HydrationBoundary state={deserializeHydrationState(helpers.dehydrate())}>
      <div className="h-screen">
        <AccessAnalysisShellClient />
      </div>
    </HydrationBoundary>
  );
}
