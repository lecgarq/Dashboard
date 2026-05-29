"use client";
import { useMemo, useState } from "react";
import { useSliders, type DimensionId } from "./SliderContext";
import { DimensionSlider } from "./DimensionSlider";
import { CatalogTreeSection, DisabledRow } from "./CatalogTreeSection";
import { DimensionSearchBox } from "./DimensionSearchBox";
import { getCatalogSections } from "./dimensionCatalog";
import { filterSections } from "./catalogSearch";
import type { CatalogDimension } from "./dimensionCatalog.types";

export function CatalogSliderSidebar({ catalog }: { catalog: readonly CatalogDimension[] }): React.JSX.Element {
  const { values, setSliderValue, resetAll, resetOne } = useSliders();
  // The catalog uses open `string` ids; SliderContext uses the narrower `DimensionId` union.
  // At runtime both are plain strings — cast at the boundary so TypeScript is satisfied.
  const setSlider = (id: string, v: number) => setSliderValue(id as DimensionId, v);
  const resetSlider = (id: string) => resetOne(id as DimensionId);
  const [query, setQuery] = useState("");
  const sections = useMemo(() => filterSections(getCatalogSections(catalog), query), [catalog, query]);
  const searching = query.trim() !== "";

  const structural = sections.find((s) => s.kind === "structural");
  const activity = sections.find((s) => s.kind === "activity");
  const folder = sections.find((s) => s.kind === "folder");

  return (
    <aside data-testid="catalog-slider-sidebar" className="flex w-96 shrink-0 flex-col border-l bg-card">
      <header className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Dimensions</h2>
        <button type="button" onClick={resetAll} data-testid="reset-all"
          className="rounded-md border px-2 py-1 text-xs hover:bg-accent">Reset all</button>
      </header>
      <div className="border-b p-4"><DimensionSearchBox query={query} onChange={setQuery} /></div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        {structural && structural.dims && structural.dims.length > 0 ? (
          <section data-testid="catalog-section-structural" className="flex flex-col gap-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{structural.label}</h3>
            {structural.dims.map((d) =>
              d.available && d.surfaces.includes("slider") ? (
                <DimensionSlider key={d.id} dimId={d.id} label={d.label} value={values[d.id] ?? 0}
                  onChange={(v) => setSlider(d.id, v)} onReset={() => resetSlider(d.id)} />
              ) : (
                <DisabledRow key={d.id} label={d.label} />
              ),
            )}
          </section>
        ) : null}
        {activity && activity.modules && activity.modules.length > 0 ? (
          <section data-testid="catalog-section-activity" className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{activity.label}</h3>
            <CatalogTreeSection modules={activity.modules} values={values}
              onChange={setSlider} onReset={resetSlider} forceOpen={searching} />
          </section>
        ) : null}
        {folder && folder.dims && folder.dims.length > 0 ? (
          <section data-testid="catalog-section-folder" className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{folder.label}</h3>
            {folder.dims.map((d) => <DisabledRow key={d.id} label={d.label} />)}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
