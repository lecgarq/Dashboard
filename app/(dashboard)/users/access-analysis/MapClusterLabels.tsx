"use client";

/**
 * MapClusterLabels.tsx — HTML overlay naming the clusters on the 2D map.
 *
 * Anchors each label at its cluster's LIVE centroid: during the scatter→clump morph the
 * cluster travels from its rest centroid (members spread across the embedding) to its
 * packed footprint center, so the chip is positioned at lerp(restCenter → footprintCenter)
 * on the SAME easeMorph curve the dots use (`liveLabelCenter`). It therefore RIDES its
 * cluster at every slider value instead of sitting at the (empty) destination until full
 * strength. That space-coord center is projected to screen via the cosmos 2D handle's
 * spaceToScreen each ~30Hz frame so it also tracks pan/zoom.
 *
 * VISIBILITY is zoom-aware level-of-detail (NOT just the colored top-N): the candidates
 * are the largest clusters by member count, and `selectVisibleLabels` reveals one only
 * once its blob's on-screen radius clears a threshold — so zoomed out shows only the big
 * clusters and zooming into a region reveals smaller clusters' names. Colors come from the
 * legend (so chips match the dots); a small cluster not in the colored legend gets a
 * neutral grey dot (matching its grey "Other" dots). Renders only in 2D. Theme-aware.
 */
import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import type { GraphCanvasHandle } from "./GraphCanvas";
import { OTHER_GREY, type LegendEntry, type RGB } from "./bucketedColors";
import { liveLabelCenter, labelCandidateClusters, selectVisibleLabels, type LabelCandidate } from "./clusterLabelLayout";

// Tuned dense (2026-06-09): surface many more name-chips at once without hover. The
// MAX_LABELS cap still bounds live DOM (FPS ceiling) and SEP still guarantees no two
// chips overlap — these widen the window, they don't remove the wall. Tune to taste.
const MAX_LABELS = 120;       // cap on rendered chips (largest clusters; LOD reveals a subset)
const MIN_SCREEN_RADIUS = 4;  // px — a blob must look at least this big to earn a chip (zoom LOD)
const SEP_X = 70;             // de-clutter: min horizontal gap between placed chips
const SEP_Y = 14;             // de-clutter: min vertical gap between placed chips

function rgbCss([r, g, b]: RGB): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export interface MapClusterLabelsProps {
  graphRef: React.RefObject<GraphCanvasHandle | null>;
  mode: "2d" | "3d";
  /** Per-cluster footprint centers (cosmos space, stride-1), aligned to `labels`.
   *  The morph's s=1 (fully-clumped) end. */
  centersX: Float32Array | null;
  centersY: Float32Array | null;
  /** Per-cluster REST centroids (cosmos space, stride-1) — the morph's s=0 end (members
   *  spread across the embedding). The chip lerps these → footprint by `progress` so it
   *  rides the cluster mid-morph. Omit/null to anchor at the footprint center always. */
  restCentersX?: Float32Array | null;
  restCentersY?: Float32Array | null;
  /** Per-cluster footprint radius (cosmos space, stride-1) — projected each frame to drive
   *  the zoom level-of-detail. Omit/null to skip LOD (de-clutter only). */
  radii?: Float32Array | null;
  /** Per-cluster member count — ranks candidates + prioritizes the LOD slot fight. */
  counts?: ReadonlyArray<number>;
  /** Reads the LIVE raw slider value 0..1 each frame (NOT eased — liveLabelCenter applies
   *  easeMorph so the chip stays locked to the dots). Defaults to 1 (fully formed). */
  progress?: () => number;
  /** Cluster id → display label (DominantClustering.labels). */
  labels: ReadonlyArray<string>;
  /** Legend rows — supply per-cluster color (a cluster absent from the colored legend
   *  falls back to neutral grey). */
  legend: ReadonlyArray<LegendEntry>;
  /** Overall chip opacity 0..1 — lets the caller fade labels in with grouping strength. */
  opacity?: number;
}

export function MapClusterLabels({
  graphRef, mode, centersX, centersY, restCentersX, restCentersY, radii, counts, progress, labels, legend, opacity = 1,
}: MapClusterLabelsProps): React.JSX.Element | null {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  const colorByLabel = useMemo(() => {
    const m = new Map<string, RGB>();
    for (const e of legend) if (!e.isOther) m.set(e.label, e.color);
    return m;
  }, [legend]);

  // Candidates = the largest clusters across the WHOLE clustering (not just the colored
  // legend), so small clusters can earn a chip via the per-frame zoom LOD below.
  const renderIds = useMemo(
    () => labelCandidateClusters(counts ?? labels.map(() => 0), MAX_LABELS),
    [counts, labels],
  );
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
        const p = progress ? progress() : 1;
        const cands: LabelCandidate[] = [];
        renderIds.forEach((c, t) => {
          // Live anchor: lerp rest centroid → footprint center on the morph curve, so
          // the chip rides its cluster at every strength (falls back to the footprint
          // center when no rest data / no progress).
          const rx = restCentersX ? restCentersX[c] : centersX[c];
          const ry = restCentersY ? restCentersY[c] : centersY[c];
          const [lx, ly] = liveLabelCenter(rx, ry, centersX[c], centersY[c], p);
          const [sx, sy] = handle.spaceToScreen([lx, ly]);
          // On-screen radius drives the zoom LOD. Without radii, pass the threshold so it
          // degrades to de-clutter-only (no cluster ever hidden purely for being small).
          let screenRadius = MIN_SCREEN_RADIUS;
          if (radii) {
            const [ex] = handle.spaceToScreen([lx + radii[c], ly]);
            screenRadius = Math.abs(ex - sx);
          }
          cands.push({ i: t, screenX: sx, screenY: sy, screenRadius, count: counts?.[c] ?? 0 });
        });
        const visible = new Set(
          selectVisibleLabels(cands, { minScreenRadius: MIN_SCREEN_RADIUS, sepX: SEP_X, sepY: SEP_Y }).map((x) => x.i),
        );
        for (let t = 0; t < renderIds.length; t++) {
          const el = itemRefs.current[t];
          if (!el) continue;
          if (visible.has(t)) {
            const cand = cands[t];
            el.style.opacity = "1";
            el.style.transform = `translate(-50%, -50%) translate(${cand.screenX}px, ${cand.screenY}px)`;
          } else {
            el.style.opacity = "0";
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(raf); };
  }, [mode, renderIds, centersX, centersY, restCentersX, restCentersY, radii, counts, progress, graphRef]);

  if (mode !== "2d" || renderIds.length === 0) return null;

  const chipBg = dark ? "rgba(9,9,11,0.55)" : "rgba(255,255,255,0.82)";
  const chipColor = dark ? "#fafafa" : "#1f2937";
  const chipShadow = dark ? "0 1px 2px rgba(0,0,0,0.7)" : "0 1px 3px rgba(0,0,0,0.18)";

  return (
    <div
      data-testid="map-cluster-labels"
      style={{
        position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 6,
        // Fade the whole label layer in with grouping strength (per-chip collision
        // opacity multiplies under this). transition keeps the fade smooth as strength
        // is committed in ~60ms steps.
        opacity: Math.max(0, Math.min(1, opacity)),
        transition: "opacity 150ms ease",
      }}
    >
      {renderIds.map((c, t) => (
        <div
          key={`${c}:${labels[c]}`}
          data-testid="map-cluster-label"
          ref={(el) => { itemRefs.current[t] = el; }}
          style={{
            position: "absolute", left: 0, top: 0, transform: "translate(-50%,-50%)",
            display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
            fontSize: 11, fontWeight: 600, lineHeight: 1.2,
            color: chipColor, background: chipBg, borderRadius: 6, padding: "1px 5px",
            opacity: 0, transition: "opacity 150ms ease", textShadow: chipShadow,
            backdropFilter: "blur(2px)",
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: "50%", flex: "0 0 auto",
            background: rgbCss(colorByLabel.get(labels[c]) ?? OTHER_GREY),
          }} />
          {labels[c]}
        </div>
      ))}
    </div>
  );
}
