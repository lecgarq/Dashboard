"use client";

import { DimensionSlider } from "./DimensionSlider";

interface SliderGroupRow {
  id: string;
  label: string;
  value: number;
}

export interface SliderGroupProps {
  title: string;
  rows: ReadonlyArray<SliderGroupRow>;
  open: boolean;
  collapsible: boolean;
  /** Number of dims in the FULL group with value > 0 (independent of search filter). */
  activeCount: number;
  onToggleOpen: () => void;
  onChange: (dimId: string, v: number) => void;
  onReset: (dimId: string) => void;
}

export function SliderGroup({
  title, rows, open, collapsible, activeCount, onToggleOpen, onChange, onReset,
}: SliderGroupProps): React.JSX.Element {
  // Active-count badge: surfaces a hidden-but-active dim (e.g. module at 0.15) while
  // its group is collapsed, so layout-affecting state is never invisible (decision 2).
  const badge =
    activeCount > 0 ? (
      <span className="ml-2 rounded-full bg-blue-500/15 px-1.5 text-[10px] font-medium text-blue-400">
        {activeCount} active
      </span>
    ) : null;

  return (
    <section data-testid={`slider-group-${title}`} className="flex flex-col gap-3">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center">{title}{badge}</span>
          <span aria-hidden>{open ? "−" : "+"}</span>
        </button>
      ) : (
        <h3 className="flex items-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}{badge}</h3>
      )}
      {open && rows.length > 0 ? (
        <div className="flex flex-col gap-4">
          {rows.map((r) => (
            <DimensionSlider
              key={r.id}
              dimId={r.id}
              label={r.label}
              value={r.value}
              onChange={(v) => onChange(r.id, v)}
              onReset={() => onReset(r.id)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
