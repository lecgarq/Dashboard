"use client";

/**
 * Legend.tsx — Infographic legend overlay for the 2D access map.
 * One row per colored cluster (swatch + label + count) plus an optional grey
 * "Other" row. Reflects the COLOR dimension. Theme-aware via semantic tokens.
 * Renders nothing for an empty model (ordered/ramp dims have no discrete legend).
 */
import type { LegendEntry } from "./bucketedColors";

function rgbCss([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export function Legend({ entries }: { entries: LegendEntry[] }): React.JSX.Element | null {
  if (entries.length === 0) return null;
  return (
    <div
      data-testid="graph-legend"
      className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[60%] rounded-lg border bg-card/85 px-3 py-2 text-xs text-foreground shadow-sm backdrop-blur"
    >
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {entries.map((e) => (
          <span key={e.label} className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="inline-block h-2.5 w-2.5 flex-none rounded-full"
              style={{ background: rgbCss(e.color) }}
            />
            <span className={e.isOther ? "text-muted-foreground" : ""}>{e.label}</span>
            <span className="text-muted-foreground">{e.count.toLocaleString("en-US")}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
