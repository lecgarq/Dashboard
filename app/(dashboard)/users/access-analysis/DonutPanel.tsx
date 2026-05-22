"use client";

import { ChartPanel } from "./ChartPanel";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export interface DonutPanelProps {
  title: string;
  subtitle?: string;
  finding?: string;
  data: DonutSlice[];
  /** Big number drawn in the donut center. */
  centerValue?: string | number;
  centerLabel?: string;
  onSliceClick?: (slice: DonutSlice) => void;
}

const SIZE = 200;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUTER = 84;
const R_INNER = 58;

function arcPath(startAngle: number, endAngle: number): string {
  const x1 = CX + Math.cos(startAngle - Math.PI / 2) * R_OUTER;
  const y1 = CY + Math.sin(startAngle - Math.PI / 2) * R_OUTER;
  const x2 = CX + Math.cos(endAngle - Math.PI / 2) * R_OUTER;
  const y2 = CY + Math.sin(endAngle - Math.PI / 2) * R_OUTER;
  const xi1 = CX + Math.cos(endAngle - Math.PI / 2) * R_INNER;
  const yi1 = CY + Math.sin(endAngle - Math.PI / 2) * R_INNER;
  const xi2 = CX + Math.cos(startAngle - Math.PI / 2) * R_INNER;
  const yi2 = CY + Math.sin(startAngle - Math.PI / 2) * R_INNER;
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${R_OUTER} ${R_OUTER} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${xi1.toFixed(2)} ${yi1.toFixed(2)}`,
    `A ${R_INNER} ${R_INNER} 0 ${largeArc} 0 ${xi2.toFixed(2)} ${yi2.toFixed(2)}`,
    "Z",
  ].join(" ");
}

/**
 * Compositional donut chart — pure SVG, no Mosaic. Use for 3-7 category
 * breakdowns (status, recency buckets, permission tiers) where a horizontal
 * bar chart wastes vertical space and a heatmap is overkill.
 *
 * Renders a full circle if a single slice has all the weight; renders
 * nothing if every slice is zero.
 */
export function DonutPanel({
  title,
  subtitle,
  finding,
  data,
  centerValue,
  centerLabel,
  onSliceClick,
}: DonutPanelProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const validData = data.filter((d) => d.value > 0);

  let cumulative = 0;
  const slices = validData.map((d) => {
    const start = (cumulative / total) * Math.PI * 2;
    cumulative += d.value;
    const end = (cumulative / total) * Math.PI * 2;
    // Render a full circle as a hollow disk when one slice is 100%
    const path = end - start >= Math.PI * 2 - 1e-6
      ? `M ${CX - R_OUTER} ${CY} A ${R_OUTER} ${R_OUTER} 0 1 0 ${CX + R_OUTER} ${CY} A ${R_OUTER} ${R_OUTER} 0 1 0 ${CX - R_OUTER} ${CY} Z M ${CX - R_INNER} ${CY} A ${R_INNER} ${R_INNER} 0 1 1 ${CX + R_INNER} ${CY} A ${R_INNER} ${R_INNER} 0 1 1 ${CX - R_INNER} ${CY} Z`
      : arcPath(start, end);
    return { ...d, path, share: d.value / total };
  });

  return (
    <ChartPanel
      title={title}
      subtitle={subtitle}
      insight={finding ? { text: finding } : undefined}
      affordance={onSliceClick ? "click-to-filter" : undefined}
    >
      {total === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
          No data
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="shrink-0"
            role="img"
            aria-label={title}
          >
            {slices.map((s, i) => (
              <path
                key={`${s.label}-${i}`}
                d={s.path}
                fill={s.color}
                fillRule="evenodd"
                stroke="var(--background, white)"
                strokeWidth={1.5}
                onClick={() => onSliceClick?.(s)}
                className={onSliceClick ? "cursor-pointer hover:opacity-85 transition-all" : ""}
              >
                <title>{`${s.label}: ${s.value.toLocaleString()} (${(s.share * 100).toFixed(1)}%)`}</title>
              </path>
            ))}
            {centerValue !== undefined ? (
              <>
                <text
                  x={CX}
                  y={CY - 4}
                  textAnchor="middle"
                  className="fill-foreground"
                  style={{ fontSize: 22, fontWeight: 600 }}
                >
                  {centerValue}
                </text>
                {centerLabel ? (
                  <text
                    x={CX}
                    y={CY + 16}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}
                  >
                    {centerLabel}
                  </text>
                ) : null}
              </>
            ) : null}
          </svg>
          <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
            {slices.map((s, i) => (
              <li
                key={`${s.label}-${i}`}
                onClick={() => onSliceClick?.(s)}
                className={`flex items-center justify-between gap-2 rounded-sm p-0.5 ${
                  onSliceClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="truncate font-medium" title={s.label}>{s.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{s.value.toLocaleString()}</span>
                  <span> · {(s.share * 100).toFixed(0)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartPanel>
  );
}
