"use client";

import { useEffect, useMemo, useState } from "react";
import { CatalogPreviewRow, CatalogTreeSection } from "./CatalogTreeSection";
import { DimensionSearchBox } from "./DimensionSearchBox";
import { filterSections } from "./catalogSearch";
import { catalogPreviewDimensions, sliderDimensions } from "./catalogSliders";
import { buildDimensionCatalog, getCatalogSections } from "./dimensionCatalog";
import { buildCatalogTargets } from "./catalogTargets";
import { buildCatalogWeights } from "./catalogWeights";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { PhysicsLayer } from "./physicsLayer";

export function CatalogSliderSidebar({
  features,
  physics,
  onCatalogReady,
}: {
  features: ReadonlyArray<NodeFeatureSnapshot>;
  physics: PhysicsLayer | null;
  onCatalogReady?: (catalog: readonly CatalogDimension[]) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const catalog = useMemo(
    () => catalogPreviewDimensions(buildDimensionCatalog(features)),
    [features],
  );
  const unavailableCount = useMemo(() => catalog.filter((dim) => !dim.available).length, [catalog]);
  const sections = useMemo(() => filterSections(getCatalogSections(catalog), query), [catalog, query]);
  const searching = query.trim() !== "";

  useEffect(() => {
    onCatalogReady?.(catalog);
    if (!physics?.registerTargets) return;
    const existing = physics.getTargets();
    const missing = sliderDimensions(catalog).filter((dimension) => !existing[dimension.id]);
    if (missing.length === 0) return;
    physics.registerTargets(
      buildCatalogTargets(features, missing),
      buildCatalogWeights(features, missing),
    );
  }, [catalog, features, onCatalogReady, physics]);

  const structural = sections.find((section) => section.kind === "structural");
  const activity = sections.find((section) => section.kind === "activity");
  const folder = sections.find((section) => section.kind === "folder");
  const hasMatches = sections.some(
    (section) => (section.dims?.length ?? 0) > 0 || (section.modules?.length ?? 0) > 0,
  );
  const headerClass = "sticky top-0 z-10 bg-card py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <aside
      data-testid="catalog-slider-sidebar"
      data-catalog-count={catalog.length}
      data-unavailable-count={unavailableCount}
      className="flex w-full shrink-0 flex-col border-l bg-card"
    >
      <header className="border-b p-4">
        <h2 className="text-sm font-semibold">Dimensions</h2>
        <p className="mt-1 text-xs text-muted-foreground">Adjust advanced anchors intentionally. The strongest active dimension sets the layout.</p>
      </header>
      <div className="border-b p-4">
        <DimensionSearchBox query={query} onChange={setQuery} />
      </div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        {!hasMatches ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No dimensions match “{query.trim()}”.</p>
        ) : null}
        {structural?.dims?.length ? (
          <section data-testid="catalog-section-structural" className="flex flex-col gap-2">
            <h3 className={headerClass}>{structural.label}</h3>
            {structural.dims.map((dim) => <CatalogPreviewRow key={dim.id} dim={dim} />)}
          </section>
        ) : null}
        {activity?.modules?.length ? (
          <section data-testid="catalog-section-activity" className="flex flex-col gap-3">
            <h3 className={headerClass}>{activity.label}</h3>
            <CatalogTreeSection modules={activity.modules} forceOpen={searching} />
          </section>
        ) : null}
        {folder?.dims?.length ? (
          <section data-testid="catalog-section-folder" className="flex flex-col gap-2">
            <h3 className={headerClass}>{folder.label}</h3>
            {folder.dims.map((dim) => <CatalogPreviewRow key={dim.id} dim={dim} />)}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
