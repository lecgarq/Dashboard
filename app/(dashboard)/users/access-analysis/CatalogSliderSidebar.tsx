"use client";
import { useMemo, useState } from "react";
import { useSliders } from "./SliderContext";
import { DimensionSlider } from "./DimensionSlider";
import { CatalogTreeSection, DisabledRow } from "./CatalogTreeSection";
import { DimensionSearchBox } from "./DimensionSearchBox";
import { getCatalogSections } from "./dimensionCatalog";
import { filterSections } from "./catalogSearch";
import { curatedSliderDimensions } from "./curatedSliders";
import type { CatalogDimension } from "./dimensionCatalog.types";

/** Shared render rule for the flat (structural / folder) sections.
 *  Returns null for available color-only dims (they belong to the color picker, not the slider list). */
export function renderFlatDim(
  d: CatalogDimension,
  values: Record<string, number>,
  setSlider: (id: string, v: number) => void,
  resetSlider: (id: string) => void,
): React.JSX.Element | null {
  const isSlider = d.surfaces.includes("slider");
  if (isSlider && d.available) {
    return (
      <DimensionSlider key={d.id} dimId={d.id} label={d.label} value={values[d.id] ?? 0}
        onChange={(v) => setSlider(d.id, v)} onReset={() => resetSlider(d.id)} />
    );
  }
  if (!d.available) {
    return <DisabledRow key={d.id} label={d.label} reason={d.note ?? d.source} />;
  }
  return null; // available but color-only → not a slider
}

export function CatalogSliderSidebar({ catalog }: { catalog: readonly CatalogDimension[] }): React.JSX.Element {
  const { values, setSliderValue, resetAll, resetOne } = useSliders();
  const setSlider = setSliderValue;
  const resetSlider = resetOne;
  const [query, setQuery] = useState("");
  // Surface only the curated sliders (Project / Role / User name). The rest of the
  // catalog stays defined but hidden ("safe") — re-enable via CURATED_SLIDER_IDS.
  const curated = useMemo(() => curatedSliderDimensions(catalog), [catalog]);
  const sections = useMemo(() => filterSections(getCatalogSections(curated), query), [curated, query]);
  const searching = query.trim() !== "";

  const structural = sections.find((s) => s.kind === "structural");
  const activity = sections.find((s) => s.kind === "activity");
  const folder = sections.find((s) => s.kind === "folder");

  const headerCls = "sticky top-0 z-10 bg-card py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <aside data-testid="catalog-slider-sidebar" className="flex w-96 shrink-0 flex-col border-l bg-card">
      <header className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Dimensions</h2>
        <button type="button" onClick={resetAll} data-testid="reset-all"
          className="rounded-md border px-2 py-1 text-xs transition-colors hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-300">
          Reset all
        </button>
      </header>
      <div className="border-b p-4"><DimensionSearchBox query={query} onChange={setQuery} /></div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        {structural && structural.dims && structural.dims.length > 0 ? (
          <section data-testid="catalog-section-structural" className="flex flex-col gap-4">
            <h3 className={headerCls}>{structural.label}</h3>
            {structural.dims.map((d) => renderFlatDim(d, values, setSlider, resetSlider))}
          </section>
        ) : null}
        {activity && activity.modules && activity.modules.length > 0 ? (
          <section data-testid="catalog-section-activity" className="flex flex-col gap-3">
            <h3 className={headerCls}>{activity.label}</h3>
            <CatalogTreeSection modules={activity.modules} values={values}
              onChange={setSlider} onReset={resetSlider} forceOpen={searching} />
          </section>
        ) : null}
        {folder && folder.dims && folder.dims.length > 0 ? (
          <section data-testid="catalog-section-folder" className="flex flex-col gap-3">
            <h3 className={headerCls}>{folder.label}</h3>
            {folder.dims.map((d) => renderFlatDim(d, values, setSlider, resetSlider))}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
