"use client";

/**
 * GridAxisLabels.tsx — HTML overlay for the cross-tab grid (2-slider view). Column
 * headers run along the top, row headers down the left side. Each header is pinned to
 * its band's world center (gridColCenterX / gridRowCenterY) and projected to screen
 * every frame via the 2D handle's spaceToScreen, so it tracks pan/zoom AND the band
 * pitch as the slider value changes. Renders nothing in 3D or without a grid structure.
 */
import { useEffect, useRef } from "react";
import type { GraphCanvasHandle } from "./GraphCanvas";
import { gridColCenterX, gridRowCenterY, type GridStructure } from "./gridLayout";

export interface GridAxisLabelsProps {
  graphRef: React.RefObject<GraphCanvasHandle | null>;
  structure: GridStructure | null;
  /** Stable live-value getter (0..100 by dim id) — read each frame so labels track pitch. */
  getLiveValues: () => Record<string, number>;
  xId: string;
  yId: string;
  mode: "2d" | "3d";
}

const labelBase: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  whiteSpace: "nowrap",
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.2,
  color: "#fafafa",
  background: "rgba(9, 9, 11, 0.55)",
  backdropFilter: "blur(3px)",
  borderRadius: 6,
  padding: "2px 7px",
  pointerEvents: "none",
  textShadow: "0 1px 2px rgba(0,0,0,0.8)",
};

export function GridAxisLabels({
  graphRef,
  structure,
  getLiveValues,
  xId,
  yId,
  mode,
}: GridAxisLabelsProps): React.JSX.Element | null {
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ncols = structure?.cols.length ?? 0;
  const nrows = structure?.rows.length ?? 0;

  useEffect(() => {
    if (mode !== "2d" || !structure) return;
    let active = true;
    let raf = 0;
    let last = 0;
    const tick = (ts: number): void => {
      if (!active) return;
      if (ts - last < 33) {
        raf = requestAnimationFrame(tick);
        return;
      }
      last = ts;
      const gh = graphRef.current;
      const handle = gh && gh.mode === "2d" ? gh.handle : null;
      if (handle?.spaceToScreen) {
        const live = getLiveValues();
        const vx = Math.min(1, Math.max(0, (live[xId] ?? 0) / 100));
        const vy = Math.min(1, Math.max(0, (live[yId] ?? 0) / 100));
        const topY = gridRowCenterY(structure, 0, vy);
        const leftX = gridColCenterX(structure, 0, vx);
        for (let c = 0; c < ncols; c++) {
          const el = colRefs.current[c];
          if (!el) continue;
          const [sx, sy] = handle.spaceToScreen([gridColCenterX(structure, c, vx), topY]);
          el.style.transform = `translate(-50%, -190%) translate(${sx}px, ${sy}px)`;
        }
        for (let r = 0; r < nrows; r++) {
          const el = rowRefs.current[r];
          if (!el) continue;
          const [sx, sy] = handle.spaceToScreen([leftX, gridRowCenterY(structure, r, vy)]);
          el.style.transform = `translate(-110%, -50%) translate(${sx}px, ${sy}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [structure, ncols, nrows, mode, graphRef, getLiveValues, xId, yId]);

  if (mode !== "2d" || !structure) return null;

  return (
    <div
      data-testid="grid-axis-labels"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 5 }}
    >
      {structure.cols.map((c, i) => (
        <div
          key={`c${i}:${c.key}`}
          data-testid="grid-col-label"
          ref={(el) => {
            colRefs.current[i] = el;
          }}
          style={labelBase}
        >
          {c.label}
        </div>
      ))}
      {structure.rows.map((r, i) => (
        <div
          key={`r${i}:${r.key}`}
          data-testid="grid-row-label"
          ref={(el) => {
            rowRefs.current[i] = el;
          }}
          style={{ ...labelBase, textAlign: "right" }}
        >
          {r.label}
        </div>
      ))}
    </div>
  );
}
