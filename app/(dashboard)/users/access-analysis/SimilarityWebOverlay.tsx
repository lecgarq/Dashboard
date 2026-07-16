"use client";

/**
 * SimilarityWebOverlay.tsx — Canvas2D layer drawing the curved similarity web over
 * the 2D cosmos slot. Mirrors MapClusterLabels: a non-interactive absolute overlay
 * whose rAF loop projects live node positions through the 2D handle each frame so it
 * tracks pan/zoom. cosmos.gl can't draw curves, so we draw them here.
 *
 * Lag-free: positions come from one getPointPositions() read + one solved affine
 * (not N spaceToScreen calls); edges are batched by color + strength band; during a
 * slider morph the web follows the nodes at a 25% opacity floor, then parks again
 * when positions and opacity are unchanged.
 *
 * Purity: imports only React + the GraphCanvasHandle type + the pure similarityWeb
 * helpers. No data/math-layer imports.
 */

import { useEffect, useRef } from "react";
import type { GraphCanvasHandle } from "./GraphCanvas";
import {
  solveAffine,
  project,
  quadControl,
  resolveFocusEdges,
  stepOpacity,
  strengthBand,
  linkBandStyle,
  morphOpacityTarget,
  type Affine,
  type FocusEdge,
  type FocusEdges,
  type FocusMatchIndex,
} from "./similarityWeb";

export interface SimilarityWebOverlayProps {
  graphRef: React.RefObject<GraphCanvasHandle | null>;
  mode: "2d" | "3d";
  /** Per-edge source/target cosmos indices. */
  src: Int32Array;
  dst: Int32Array;
  /** Per-edge palette bucket + flat RGBA palette (from computeEdgeColors). */
  bucket: Uint16Array;
  strength: Float32Array;
  band: Uint8Array;
  palette: Float32Array;
  /** Committed grouping-strength fade target [0,1] (faint when scattered). */
  opacity: number;
  /** Live morph state — true while the slider drags; the web stays at 25%. */
  isMorphing: () => boolean;
  /** Monotonic version from the ambient/layout compositor; lets static frames park. */
  getPositionVersion?: () => number;
  /** Node palette used for selected-edge fallback colors. */
  nodeColors?: Float32Array;
  /** Click focus and its authoritative Phase-30 matches. */
  selectedIndex?: number | null;
  selectedMatches?: readonly FocusMatchIndex[];
  /** Immediate hover focus; does not fetch neighbors. */
  hoveredIndex?: number | null;
  /** Bow factor as a fraction of segment length. Default 0.14. */
  curve?: number;
}

const FRAME_MS = 33; // ~30Hz, matches MapClusterLabels
const EMPTY_MATCHES: readonly FocusMatchIndex[] = [];

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
    let prevBand: Uint8Array | null = null;
    let prevPalette: Float32Array | null = null;
    let prevPositionVersion = -1;
    let prevSelectedMatches: readonly FocusMatchIndex[] | null = null;
    let prevSelectedIndex: number | null | undefined;
    let prevHoveredIndex: number | null | undefined;
    let focusCache: FocusEdges = { selected: [], hovered: [] };
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let reducedMotion = media?.matches ?? false;
    const onMotionChange = (): void => { reducedMotion = media?.matches ?? false; };
    media?.addEventListener?.("change", onMotionChange);

    const ctx = canvas.getContext("2d");

    const affChanged = (a: Affine, b: Affine | null): boolean =>
      !b || a.sx !== b.sx || a.sy !== b.sy || a.ox !== b.ox || a.oy !== b.oy;

    const tick = (ts: number): void => {
      if (!active) return;
      if (ts - last < FRAME_MS) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = last ? ts - last : FRAME_MS;
      last = ts;

      const {
        graphRef,
        src,
        dst,
        bucket,
        strength,
        band,
        palette,
        opacity,
        isMorphing,
        getPositionVersion,
        curve = 0.14,
        nodeColors,
        selectedIndex = null,
        selectedMatches = EMPTY_MATCHES,
        hoveredIndex = null,
      } = dataRef.current;
      const morphing = isMorphing();
      const positionVersion = getPositionVersion?.() ?? 0;
      const positionsChanged = positionVersion !== prevPositionVersion;
      const dataChanged = src !== prevSrc || band !== prevBand || palette !== prevPalette;
      const focusChanged =
        selectedIndex !== prevSelectedIndex ||
        hoveredIndex !== prevHoveredIndex ||
        selectedMatches !== prevSelectedMatches;
      prevSrc = src;
      prevBand = band;
      prevPalette = palette;
      prevPositionVersion = positionVersion;
      prevSelectedIndex = selectedIndex;
      prevHoveredIndex = hoveredIndex;
      prevSelectedMatches = selectedMatches;

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

        const target = morphOpacityTarget(opacity, morphing);
        const aff = solveAffine(handle.spaceToScreen);
        const moved = affChanged(aff, prevAff);
        const opacitySettled = curOpacity === target;

        // Skip the whole redraw when nothing changed (idle = zero cost).
        if (!moved && !positionsChanged && opacitySettled && !morphing && !dataChanged && !focusChanged) {
          raf = requestAnimationFrame(tick);
          return;
        }

        curOpacity = reducedMotion ? target : stepOpacity(curOpacity, target, dt);
        prevAff = aff;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        const pts = handle.getPointPositions(); // stride-2 cosmos space coords

        if (curOpacity > 0.005 && src.length > 0) {
          const bucketCount = palette.length / 4;
          const paths: Path2D[] = [];
          for (let b = 0; b < bucketCount * 3; b++) paths.push(new Path2D());

          for (let i = 0; i < src.length; i++) {
            const a = src[i] * 2;
            const d = dst[i] * 2;
            const ax = pts[a] * aff.sx + aff.ox;
            const ay = pts[a + 1] * aff.sy + aff.oy;
            const bx = pts[d] * aff.sx + aff.ox;
            const by = pts[d + 1] * aff.sy + aff.oy;
            const cx = (ax + bx) / 2 - (by - ay) * curve;
            const cy = (ay + by) / 2 + (bx - ax) * curve;
            const p = paths[bucket[i] * 3 + band[i]];
            p.moveTo(ax, ay);
            p.quadraticCurveTo(cx, cy, bx, by);
          }

          ctx.globalAlpha = curOpacity * (selectedIndex === null ? 1 : 0.15);
          for (let b = 0; b < bucketCount; b++) {
            const o = b * 4;
            ctx.strokeStyle = `rgba(${Math.round(palette[o] * 255)},${Math.round(
              palette[o + 1] * 255,
            )},${Math.round(palette[o + 2] * 255)},${palette[o + 3]})`;
            for (let edgeBand = 0; edgeBand < 3; edgeBand++) {
              ctx.lineWidth = linkBandStyle(edgeBand as 0 | 1 | 2).width;
              ctx.stroke(paths[b * 3 + edgeBand]);
            }
          }
          ctx.globalAlpha = 1;
        }

        if (dataChanged || focusChanged) {
          focusCache = resolveFocusEdges(
            { src, dst, strength, dropped: 0 },
            selectedIndex,
            selectedMatches,
            hoveredIndex,
          );
        }

        const strokeFor = (edge: FocusEdge, alpha: number): string => {
          if (edge.webIndex !== null) {
            const paletteOffset = bucket[edge.webIndex] * 4;
            return `rgba(${Math.round(palette[paletteOffset] * 255)},${Math.round(
              palette[paletteOffset + 1] * 255,
            )},${Math.round(palette[paletteOffset + 2] * 255)},${alpha})`;
          }
          if (nodeColors) {
            const a = edge.src * 4;
            const b = edge.dst * 4;
            return `rgba(${Math.round(((nodeColors[a] + nodeColors[b]) * 0.5) * 255)},${Math.round(
              ((nodeColors[a + 1] + nodeColors[b + 1]) * 0.5) * 255,
            )},${Math.round(((nodeColors[a + 2] + nodeColors[b + 2]) * 0.5) * 255)},${alpha})`;
          }
          return `rgba(78,140,203,${alpha})`;
        };

        const drawFocus = (edges: readonly FocusEdge[], widthLift: number, alphaLift: number): void => {
          if (!ctx || edges.length === 0) return;
          ctx.globalAlpha = 1;
          for (const edge of edges) {
            const edgeBand = edge.webIndex === null
              ? strengthBand(edge.score)
              : (band[edge.webIndex] as 0 | 1 | 2);
            const style = linkBandStyle(edgeBand);
            ctx.lineWidth = style.width + widthLift;
            const a = edge.src * 2;
            const b = edge.dst * 2;
            const [ax, ay] = project(aff, pts[a], pts[a + 1]);
            const [bx, by] = project(aff, pts[b], pts[b + 1]);
            const [cx, cy] = quadControl(ax, ay, bx, by, curve);
            const path = new Path2D();
            path.moveTo(ax, ay);
            path.quadraticCurveTo(cx, cy, bx, by);
            ctx.strokeStyle = strokeFor(edge, Math.min(1, 0.7 + style.alpha * 0.2 + alphaLift));
            ctx.stroke(path);
          }
        };

        // Deliberate draw priority: ambient < persistent selected < temporary hover.
        drawFocus(focusCache.selected, 0.9, 0.08);
        drawFocus(focusCache.hovered, 1.2, 0.12);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      media?.removeEventListener?.("change", onMotionChange);
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
