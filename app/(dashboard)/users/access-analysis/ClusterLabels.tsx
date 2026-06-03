"use client";

/**
 * ClusterLabels.tsx — HTML overlay labeling the dominant-attribute blobs.
 *
 * Each label tracks its blob's LIVE centroid: during the rest→clump morph the cluster
 * travels from its resting-cloud centroid to its packed footprint center, so the label
 * is positioned at lerp(restCenter → footprintCenter, progress) and FOLLOWS the clump
 * instead of sitting at the (empty) destination. That space-coord center is projected to
 * screen pixels every frame via the 2D handle's spaceToScreen so it also tracks pan/zoom.
 *
 * Only the TOP-N clusters by member count are ever rendered/projected: with thousands of
 * tiny single-project users, the rest can never clear the on-screen size threshold, so
 * rendering a DOM node per one would just be per-frame cost (the 10fps trap). A label
 * shows when its on-screen radius clears the LOD threshold and fades in with progress.
 * Renders nothing in 3D or when no dim groups.
 */
import { useEffect, useMemo, useRef } from "react";
import type { GraphCanvasHandle } from "./GraphCanvas";
import { selectVisibleLabels, type LabelCandidate } from "./clusterLabelLayout";
import { colorForCluster } from "./clusterColors";

const MIN_SCREEN_RADIUS = 14; // px — blob must be at least this big on screen to label
const SEP_X = 120;
const SEP_Y = 22;
/** Cap on rendered/projected labels. Only the largest blobs can ever clear the LOD
 *  threshold; rendering a DOM node per tiny cluster is the per-frame cost that tanks fps. */
const MAX_LABELS = 64;

export interface ClusterLabelsProps {
  graphRef: React.RefObject<GraphCanvasHandle | null>;
  /** Footprint (clump destination) centers — the progress=1 end. Stride-1, or null. */
  centersX: Float32Array | null;
  centersY: Float32Array | null;
  /** Resting-cloud centroids — the progress=0 end. Label center lerps these → footprint. */
  restCentersX?: Float32Array | null;
  restCentersY?: Float32Array | null;
  /** Footprint radius per cluster (cosmos space). */
  radii: Float32Array | null;
  labels: string[];
  counts: number[];
  mode: "2d" | "3d";
  /** Optional 0..1 progress read each frame (the live slider value). Drives both the
   *  rest→clump label position lerp and the fade-in. Defaults to fully-formed (1). */
  progress?: () => number;
}

export function ClusterLabels({
  graphRef, centersX, centersY, restCentersX, restCentersY, radii, labels, counts, mode, progress,
}: ClusterLabelsProps): React.JSX.Element | null {
  const k = labels.length;

  // The only clusters worth rendering: the MAX_LABELS largest by member count. Stable
  // for a given clustering (recomputed only when counts identity changes).
  const top = useMemo(() => {
    const idx = Array.from({ length: k }, (_, i) => i);
    idx.sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
    return idx.slice(0, Math.min(k, MAX_LABELS));
  }, [counts, k]);

  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Stable per-cluster color (matches the node cluster coloring; uses the ORIGINAL index).
  const colors = useMemo(
    () => top.map((c) => {
      const [r, g, b] = colorForCluster(c, k);
      return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    }),
    [top, k],
  );

  useEffect(() => {
    if (mode !== "2d" || top.length === 0 || !centersX || !centersY || !radii) return;
    let active = true;
    let raf = 0;
    let lastProject = 0;
    const tick = (ts: number): void => {
      if (!active) return;
      // Throttle the per-footprint projection to ~30Hz — the camera rarely moves fast
      // enough to need 60Hz label updates, and projecting is the per-frame cost.
      if (ts - lastProject < 33) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastProject = ts;
      const gh = graphRef.current;
      const handle = gh && gh.mode === "2d" ? gh.handle : null;
      if (handle?.spaceToScreen) {
        const s = progress ? Math.min(1, Math.max(0, progress())) : 1;
        const cands: LabelCandidate[] = [];
        for (let t = 0; t < top.length; t++) {
          const c = top[t];
          // Live centroid: lerp resting-cloud centroid → footprint center by progress so
          // the label rides its clump. Falls back to the footprint center if no rest data.
          const rx = restCentersX ? restCentersX[c] : centersX[c];
          const ry = restCentersY ? restCentersY[c] : centersY[c];
          const cxLive = rx + (centersX[c] - rx) * s;
          const cyLive = ry + (centersY[c] - ry) * s;
          const [sx, sy] = handle.spaceToScreen([cxLive, cyLive]);
          const [ex] = handle.spaceToScreen([cxLive + radii[c], cyLive]);
          cands.push({ i: t, screenX: sx, screenY: sy, screenRadius: Math.abs(ex - sx), count: counts[c] ?? 0 });
        }
        const visible = new Set(
          selectVisibleLabels(cands, { minScreenRadius: MIN_SCREEN_RADIUS, sepX: SEP_X, sepY: SEP_Y }).map((c) => c.i),
        );
        // Quick fade-in: fully opaque by progress≈0.25 so labels appear as clumps gather
        // (no hard pop right at the rest→blob boundary) without lingering faint.
        const op = Math.min(1, s * 4);
        for (let t = 0; t < top.length; t++) {
          const el = itemRefs.current[t];
          if (!el) continue;
          const cand = cands[t];
          if (visible.has(t) && op > 0.02) {
            el.style.opacity = String(op);
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
  }, [centersX, centersY, restCentersX, restCentersY, radii, counts, top, mode, graphRef, progress]);

  if (mode !== "2d" || top.length === 0) return null;

  return (
    <div data-testid="cluster-labels" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 5 }}>
      {top.map((c, t) => (
        <div
          key={`${c}:${labels[c]}`}
          data-testid="cluster-label"
          ref={(el) => { itemRefs.current[t] = el; }}
          style={{
            position: "absolute", left: 0, top: 0,
            transform: "translate(-50%, -50%)",
            display: "flex", alignItems: "center", gap: 6,
            whiteSpace: "nowrap", fontSize: 11, fontWeight: 500, lineHeight: 1.2,
            color: "#fafafa",
            background: "rgba(9, 9, 11, 0.42)",
            backdropFilter: "blur(3px)",
            borderRadius: 6, padding: "2px 7px",
            opacity: 0, transition: "opacity 180ms ease",
            pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.75)",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors[t], flex: "0 0 auto" }} />
          {labels[c]}
        </div>
      ))}
    </div>
  );
}
