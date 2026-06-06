"use client";

/**
 * MapClusterLabels.tsx — HTML overlay naming the colored clusters on the 2D map.
 * Anchors each label at its cluster's LIVE centroid (mean node position), projected
 * to screen via the cosmos 2D handle's spaceToScreen each ~30Hz frame so it tracks
 * the settle + pan/zoom. Colors match the bucketed legend; the chip flips with the
 * theme. Renders only in 2D. Only the top-N (by member count) clusters get a chip.
 */
import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import type { GraphCanvasHandle } from "./GraphCanvas";
import type { LegendEntry, RGB } from "./bucketedColors";

const MAX_LABELS = 16;     // top clusters worth a chip
const MIN_SEP_PX = 18;     // basic vertical de-clutter

/** Pure: per-cluster centroid (mean x/y) + member counts. Stride-3 positions. */
export function clusterCentroids(
  positions: Float32Array,
  clusterIds: Int32Array,
  k: number,
): { cx: Float32Array; cy: Float32Array; counts: Int32Array } {
  const cx = new Float32Array(k);
  const cy = new Float32Array(k);
  const counts = new Int32Array(k);
  for (let i = 0; i < clusterIds.length; i++) {
    const c = clusterIds[i];
    if (c < 0 || c >= k) continue;
    cx[c] += positions[i * 3];
    cy[c] += positions[i * 3 + 1];
    counts[c]++;
  }
  for (let c = 0; c < k; c++) {
    if (counts[c] > 0) {
      cx[c] /= counts[c];
      cy[c] /= counts[c];
    }
  }
  return { cx, cy, counts };
}

function rgbCss([r, g, b]: RGB): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export interface MapClusterLabelsProps {
  graphRef: React.RefObject<GraphCanvasHandle | null>;
  mode: "2d" | "3d";
  /** Per-node cluster id aligned to physics node order (from buildClusterAssignment). */
  clusterIds: Int32Array;
  /** Cluster id → display label (from buildClusterAssignment.labels). */
  labels: string[];
  /** Legend rows — used for per-label color + to skip the grey "Other" cluster. */
  legend: LegendEntry[];
  /** Latest positions snapshot getter (stride-3). Usually () => physics.getPositions(). */
  getPositions: () => Float32Array | null;
}

export function MapClusterLabels({
  graphRef, mode, clusterIds, labels, legend, getPositions,
}: MapClusterLabelsProps): React.JSX.Element | null {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const k = labels.length;

  const colorByLabel = useMemo(() => {
    const m = new Map<string, { color: RGB; isOther: boolean }>();
    for (const e of legend) m.set(e.label, { color: e.color, isOther: !!e.isOther });
    return m;
  }, [legend]);

  const renderIds = useMemo(() => {
    const ids: number[] = [];
    for (let c = 0; c < k; c++) {
      const info = colorByLabel.get(labels[c]);
      if (info && !info.isOther) ids.push(c);
    }
    return ids.slice(0, MAX_LABELS);
  }, [k, labels, colorByLabel]);

  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (mode !== "2d" || renderIds.length === 0) return;
    let active = true;
    let raf = 0;
    let last = 0;
    const tick = (ts: number): void => {
      if (!active) return;
      if (ts - last < 33) { raf = requestAnimationFrame(tick); return; }
      last = ts;
      const gh = graphRef.current;
      const handle = gh && gh.mode === "2d" ? gh.handle : null;
      const pos = getPositions();
      if (handle?.spaceToScreen && pos && pos.length >= clusterIds.length * 3) {
        const { cx, cy, counts } = clusterCentroids(pos, clusterIds, k);
        const placed: number[] = [];
        renderIds.forEach((c, t) => {
          const el = itemRefs.current[t];
          if (!el) return;
          if (counts[c] === 0) { el.style.opacity = "0"; return; }
          const [sx, sy] = handle.spaceToScreen([cx[c], cy[c]]);
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
  }, [mode, renderIds, clusterIds, k, graphRef, getPositions]);

  if (mode !== "2d" || renderIds.length === 0) return null;

  const chipBg = dark ? "rgba(9,9,11,0.55)" : "rgba(255,255,255,0.78)";
  const chipColor = dark ? "#fafafa" : "#1f2937";
  const chipShadow = dark ? "0 1px 2px rgba(0,0,0,0.7)" : "0 1px 2px rgba(0,0,0,0.18)";

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
            width: 7, height: 7, borderRadius: "50%", flex: "0 0 auto",
            background: rgbCss(colorByLabel.get(labels[c])!.color),
          }} />
          {labels[c]}
        </div>
      ))}
    </div>
  );
}
