"use client";

/**
 * MapClusterLabels.tsx — HTML overlay naming the colored clusters on the 2D map.
 *
 * Anchors each label at its cluster's FOOTPRINT CENTER (the packed-blob center the
 * layout descriptor pins it to), projected to screen via the cosmos 2D handle's
 * spaceToScreen each ~30Hz frame so it tracks pan/zoom. Colors come from the legend
 * (so chips match the dots); only the colored (non-"Other") clusters are labeled.
 * Renders only in 2D. Theme-aware, non-interactive.
 */
import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import type { GraphCanvasHandle } from "./GraphCanvas";
import type { LegendEntry, RGB } from "./bucketedColors";

const MAX_LABELS = 16;     // cap on rendered chips (top colored clusters)
const MIN_SEP_PX = 20;     // basic vertical de-clutter

function rgbCss([r, g, b]: RGB): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/**
 * Pure: which cluster indices get a chip — those whose label matches a non-"Other"
 * legend entry — ranked by that entry's member count (largest first), capped at `max`.
 */
export function visibleLabelClusters(
  labels: ReadonlyArray<string>,
  legend: ReadonlyArray<LegendEntry>,
  max = MAX_LABELS,
): number[] {
  const byLabel = new Map<string, LegendEntry>();
  for (const e of legend) if (!e.isOther) byLabel.set(e.label, e);
  const idx: number[] = [];
  for (let c = 0; c < labels.length; c++) if (byLabel.has(labels[c])) idx.push(c);
  idx.sort((a, b) => (byLabel.get(labels[b])!.count) - (byLabel.get(labels[a])!.count));
  return idx.slice(0, max);
}

export interface MapClusterLabelsProps {
  graphRef: React.RefObject<GraphCanvasHandle | null>;
  mode: "2d" | "3d";
  /** Per-cluster footprint centers (cosmos space, stride-1), aligned to `labels`. */
  centersX: Float32Array | null;
  centersY: Float32Array | null;
  /** Cluster id → display label (DominantClustering.labels). */
  labels: ReadonlyArray<string>;
  /** Legend rows — supply per-cluster color + which clusters are colored (non-Other). */
  legend: ReadonlyArray<LegendEntry>;
}

export function MapClusterLabels({
  graphRef, mode, centersX, centersY, labels, legend,
}: MapClusterLabelsProps): React.JSX.Element | null {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  const colorByLabel = useMemo(() => {
    const m = new Map<string, RGB>();
    for (const e of legend) if (!e.isOther) m.set(e.label, e.color);
    return m;
  }, [legend]);

  const renderIds = useMemo(() => visibleLabelClusters(labels, legend), [labels, legend]);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (mode !== "2d" || renderIds.length === 0 || !centersX || !centersY) return;
    let active = true;
    let raf = 0;
    let last = 0;
    const tick = (ts: number): void => {
      if (!active) return;
      if (ts - last < 33) { raf = requestAnimationFrame(tick); return; }
      last = ts;
      const gh = graphRef.current;
      const handle = gh && gh.mode === "2d" ? gh.handle : null;
      if (handle?.spaceToScreen) {
        const placed: number[] = [];
        renderIds.forEach((c, t) => {
          const el = itemRefs.current[t];
          if (!el) return;
          const [sx, sy] = handle.spaceToScreen([centersX[c], centersY[c]]);
          const collide = placed.some((y) => Math.abs(y - sy) < MIN_SEP_PX);
          if (collide) { el.style.opacity = "0"; return; }
          placed.push(sy);
          el.style.opacity = "1";
          el.style.transform = `translate(-50%, -50%) translate(${sx}px, ${sy}px)`;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(raf); };
  }, [mode, renderIds, centersX, centersY, graphRef]);

  if (mode !== "2d" || renderIds.length === 0) return null;

  const chipBg = dark ? "rgba(9,9,11,0.55)" : "rgba(255,255,255,0.82)";
  const chipColor = dark ? "#fafafa" : "#1f2937";
  const chipShadow = dark ? "0 1px 2px rgba(0,0,0,0.7)" : "0 1px 3px rgba(0,0,0,0.18)";

  return (
    <div
      data-testid="map-cluster-labels"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 6 }}
    >
      {renderIds.map((c, t) => (
        <div
          key={`${c}:${labels[c]}`}
          data-testid="map-cluster-label"
          ref={(el) => { itemRefs.current[t] = el; }}
          style={{
            position: "absolute", left: 0, top: 0, transform: "translate(-50%,-50%)",
            display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
            fontSize: 12, fontWeight: 600, lineHeight: 1.2,
            color: chipColor, background: chipBg, borderRadius: 6, padding: "2px 7px",
            opacity: 0, transition: "opacity 150ms ease", textShadow: chipShadow,
            backdropFilter: "blur(2px)",
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flex: "0 0 auto",
            background: rgbCss(colorByLabel.get(labels[c]) ?? [0.5, 0.5, 0.5]),
          }} />
          {labels[c]}
        </div>
      ))}
    </div>
  );
}
