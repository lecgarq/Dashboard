"use client";

import { MosaicCoordinatorProvider } from "./MosaicCoordinatorContext";
import { HybridAnalyticsSurface } from "./HybridAnalyticsSurface";

export function DeferredAnalyticsSection() {
  return (
    <MosaicCoordinatorProvider>
      <HybridAnalyticsSurface />
    </MosaicCoordinatorProvider>
  );
}
