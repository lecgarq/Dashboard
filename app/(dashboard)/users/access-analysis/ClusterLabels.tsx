"use client";

/**
 * ClusterLabels.tsx — HTML overlay labeling the dominant-attribute blobs.
 * Each label sits on its blob's PACKED CENTER (deterministic), projected to screen
 * pixels every frame via the 2D handle's spaceToScreen so it tracks pan/zoom. A
 * label shows only when its blob's on-screen radius clears a threshold (zoom-LOD),
 * and fades in/out via CSS opacity. Renders nothing in 3D or when no dim groups.
 */
import { useEffect, useMemo, useRef } from "react";
import type { GraphCanvasHandle } from "./GraphCanvas";
import { selectVisibleLabels, type LabelCandidate } from "./clusterLabelLayout";
import { colorForCluster } from "./clusterColors";

const MIN_SCREEN_RADIUS = 14; // px — blob must be at least this big on screen to label
const SEP_X = 120;
const SEP_Y = 22;

export interface ClusterLabelsProps {
  graphRef: React.RefObject<GraphCanvasHandle | null>;
  /** Footprint centers (cosmos space), stride-1 parallel arrays, or null when none. */
  centersX: Float32Array | null;
  centersY: Float32Array | null;
  /** Footprint radius per cluster (cosmos space). */
  radii: Float32Array | null;
  labels: string[];
  counts: number[];
  mode: "2d" | "3d";
}

export function ClusterLabels({
  graphRef, centersX, centersY, radii, labels, counts, mode,
}: ClusterLabelsProps): React.JSX.Element | null {
  const k = labels.length;
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Stable per-cluster color (matches the node cluster coloring).
  const colors = useMemo(
    () => labels.map((_, i) => {
      const [r, g, b] = colorForCluster(i, k);
      return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    }),
    [labels, k],
  );

  useEffect(() => {
    if (mode !== "2d" || k === 0 || !centersX || !centersY || !radii) return;
    let active = true;
    let raf = 0;
    const tick = (): void => {
      if (!active) return;
      const gh = graphRef.current;
      const handle = gh && gh.mode === "2d" ? gh.handle : null;
      if (handle?.spaceToScreen) {
        const cands: LabelCandidate[] = [];
        for (let i = 0; i < k; i++) {
          const [sx, sy] = handle.spaceToScreen([centersX[i], centersY[i]]);
          const [ex] = handle.spaceToScreen([centersX[i] + radii[i], centersY[i]]);
          cands.push({ i, screenX: sx, screenY: sy, screenRadius: Math.abs(ex - sx), count: counts[i] ?? 0 });
        }
        const visible = new Set(
          selectVisibleLabels(cands, { minScreenRadius: MIN_SCREEN_RADIUS, sepX: SEP_X, sepY: SEP_Y }).map((c) => c.i),
        );
        for (let i = 0; i < k; i++) {
          const el = itemRefs.current[i];
          if (!el) continue;
          const c = cands[i];
          if (visible.has(i)) {
            el.style.opacity = "1";
            el.style.transform = `translate(-50%, -50%) translate(${c.screenX}px, ${c.screenY}px)`;
          } else {
            el.style.opacity = "0";
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(raf); };
  }, [centersX, centersY, radii, counts, k, mode, graphRef]);

  if (mode !== "2d" || k === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 5 }}>
      {labels.map((label, i) => (
        <div
          key={`${i}:${label}`}
          ref={(el) => { itemRefs.current[i] = el; }}
          style={{
            position: "absolute", left: 0, top: 0,
            transform: "translate(-50%, -50%)",
            display: "flex", alignItems: "center", gap: 6,
            whiteSpace: "nowrap", fontSize: 11, fontWeight: 500, lineHeight: 1.2,
            color: "#fafafa",
            background: "rgba(9, 9, 11, 0.42)",
            backdropFilter: "blur(3px)",
            borderRadius: 6, padding: "2px 7px",
            opacity: 0, transition: "opacity 220ms ease",
            pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.75)",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors[i], flex: "0 0 auto" }} />
          {label}
        </div>
      ))}
    </div>
  );
}
