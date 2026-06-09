"use client";

/**
 * SimilarityWebOverlay.tsx — Canvas2D layer drawing the curved similarity web over
 * the 2D cosmos slot. Mirrors MapClusterLabels: a non-interactive absolute overlay
 * whose rAF loop projects live node positions through the 2D handle each frame so it
 * tracks pan/zoom. cosmos.gl can't draw curves, so we draw them here.
 *
 * Lag-free: positions come from one getPointPositions() read + one solved affine
 * (not N spaceToScreen calls); edges are batched into one Path2D per color bucket;
 * the layer fades OUT during slider morphs (isMorphing) and skips redraw entirely
 * when the view is unchanged and the opacity has settled.
 *
 * Purity: imports only React + the GraphCanvasHandle type + the pure similarityWeb
 * helpers. No data/math-layer imports.
 */

import { useEffect, useRef } from "react";
import type { GraphCanvasHandle } from "./GraphCanvas";
import { solveAffine, project, quadControl, stepOpacity, type Affine } from "./similarityWeb";

export interface SimilarityWebOverlayProps {
  graphRef: React.RefObject<GraphCanvasHandle | null>;
  mode: "2d" | "3d";
  /** Per-edge source/target cosmos indices. */
  src: Int32Array;
  dst: Int32Array;
  /** Per-edge palette bucket + flat RGBA palette (from computeEdgeColors). */
  bucket: Uint16Array;
  palette: Float32Array;
  /** Committed grouping-strength fade target [0,1] (faint when scattered). */
  opacity: number;
  /** Live morph state — true while the slider drags; the web fades out. */
  isMorphing: () => boolean;
  /** Bow factor as a fraction of segment length. Default 0.14. */
  curve?: number;
}

const FRAME_MS = 33; // ~30Hz, matches MapClusterLabels
const LINE_WIDTH = 0.6;

export function SimilarityWebOverlay(props: SimilarityWebOverlayProps): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mutable refs so the rAF closure reads the latest props without re-subscribing.
  const dataRef = useRef(props);
  dataRef.current = props;

  useEffect(() => {
    if (props.mode !== "2d") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let active = true;
    let raf = 0;
    let last = 0;
    let curOpacity = 0;
    let prevAff: Affine | null = null;
    let prevSrc: Int32Array | null = null;

    const ctx = canvas.getContext("2d");

    const affChanged = (a: Affine, b: Affine | null): boolean =>
      !b || a.sx !== b.sx || a.sy !== b.sy || a.ox !== b.ox || a.oy !== b.oy;

    const tick = (ts: number): void => {
      if (!active) return;
      if (ts - last < FRAME_MS) {
        raf = requestAnimationFrame(tick);
        return;
      }
      last = ts;

      const { graphRef, src, dst, bucket, palette, opacity, isMorphing, curve = 0.14 } =
        dataRef.current;
      const morphing = isMorphing();
      const dataChanged = src !== prevSrc;
      prevSrc = src;

      const root = graphRef.current;
      const handle = root && root.mode === "2d" ? root.handle : null;

      if (handle?.spaceToScreen && handle.getPointPositions && ctx) {
        // Size the drawing buffer to the canvas's CSS box (handles resize + dpr).
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;
        if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
          canvas.width = Math.round(cw * dpr);
          canvas.height = Math.round(ch * dpr);
        }

        const target = morphing ? 0 : Math.max(0, Math.min(1, opacity));
        const aff = solveAffine(handle.spaceToScreen);
        const moved = affChanged(aff, prevAff);
        const opacitySettled = curOpacity === target;

        // Skip the whole redraw when nothing changed (idle = zero cost).
        if (!moved && opacitySettled && !morphing && !dataChanged) {
          raf = requestAnimationFrame(tick);
          return;
        }

        curOpacity = stepOpacity(curOpacity, target, 0.2);
        prevAff = aff;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);

        if (curOpacity > 0.005 && src.length > 0) {
          const pts = handle.getPointPositions(); // stride-2 cosmos space coords
          const bucketCount = palette.length / 4;
          const paths: Path2D[] = [];
          for (let b = 0; b < bucketCount; b++) paths.push(new Path2D());

          for (let i = 0; i < src.length; i++) {
            const a = src[i] * 2;
            const d = dst[i] * 2;
            const [ax, ay] = project(aff, pts[a], pts[a + 1]);
            const [bx, by] = project(aff, pts[d], pts[d + 1]);
            const [cx, cy] = quadControl(ax, ay, bx, by, curve);
            const p = paths[bucket[i]];
            p.moveTo(ax, ay);
            p.quadraticCurveTo(cx, cy, bx, by);
          }

          ctx.globalAlpha = curOpacity;
          ctx.lineWidth = LINE_WIDTH;
          for (let b = 0; b < bucketCount; b++) {
            const o = b * 4;
            ctx.strokeStyle = `rgba(${Math.round(palette[o] * 255)},${Math.round(
              palette[o + 1] * 255,
            )},${Math.round(palette[o + 2] * 255)},${palette[o + 3]})`;
            ctx.stroke(paths[b]);
          }
          ctx.globalAlpha = 1;
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [props.mode]);

  if (props.mode !== "2d") return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="similarity-web"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 4, // below MapClusterLabels (zIndex 6), above the cosmos canvas
      }}
    />
  );
}
