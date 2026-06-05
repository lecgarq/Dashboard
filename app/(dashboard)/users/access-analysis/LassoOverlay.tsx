"use client";

/**
 * LassoOverlay.tsx — Phase 4-01 Task 3 (updated Task 6: hitTest generalization).
 *
 * Transparent overlay canvas that captures pointer events when active, draws the
 * freehand path with 2D Canvas, then on pointerup invokes the hitTest callback
 * with the canvas-local screen coords and the canvas CSS size. The matched node
 * indices are returned through onComplete.
 *
 * RESEARCH patterns:
 *   Pattern 2 — overlay canvas absolutely positioned over the graph canvas.
 *   Pitfall 1 — polygon hit-testing uses canvas-local screen pixels.
 *   Pitfall 7 — bail to [] if graph isn't ready (handled inside hitTest).
 *   Pitfall 8 — setPointerCapture so pointerup outside canvas still fires.
 *
 * Anti-pattern avoided: path is stored in a useRef, NEVER React state — pointer
 * events fire 60+Hz and state updates would kill perf and re-render the graph.
 *
 * Active gating: pointerEvents:'auto' + cursor:'crosshair' only when `active=true`.
 * In 3D mode, onDragStart/onDragEnd freeze/thaw OrbitControls so the drag selects
 * rather than rotating the scene.
 */

import { useEffect, useRef } from "react";

export interface LassoOverlayProps {
  /** When false: pointer events pass through to the graph canvas. */
  active: boolean;
  /**
   * Hit-test the completed path -> selected node indices. The overlay passes its own
   * canvas CSS size so a 3D projector can map world->screen against the same viewport.
   */
  hitTest: (path: [number, number][], width: number, height: number) => number[];
  /** Called once on pointerup with the matched node indices. */
  onComplete: (matchedIndices: number[]) => void;
  /** Fired on pointerdown — disable OrbitControls so the drag selects, not rotates. */
  onDragStart?: () => void;
  /**
   * Re-enable OrbitControls. Always fired once after an onDragStart — on pointerup,
   * pointercancel, a too-short path, OR an unmount mid-drag — so controls can never
   * be left frozen.
   */
  onDragEnd?: () => void;
}

const STROKE_COLOR = "#3b82f6";
const STROKE_WIDTH = 2;
const DASH: [number, number] = [6, 4];

export function LassoOverlay({
  active,
  hitTest,
  onComplete,
  onDragStart,
  onDragEnd,
}: LassoOverlayProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathRef = useRef<[number, number][]>([]);
  const drawingRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    function resize(): void {
      if (!cv || !ctx) return;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      cv.width = Math.max(1, Math.floor(w * dpr));
      cv.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset before re-scale
      ctx.scale(dpr, dpr);
    }
    resize();

    function clearOverlay(): void {
      if (!cv || !ctx) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
    }

    function drawPath(p: ReadonlyArray<[number, number]>): void {
      if (!cv || !ctx || p.length === 0) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineWidth = STROKE_WIDTH;
      ctx.setLineDash(DASH);
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.stroke();
    }

    const onDown = (e: PointerEvent): void => {
      drawingRef.current = true;
      pathRef.current = [[e.offsetX, e.offsetY]];
      onDragStart?.();
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        // jsdom + older browsers: setPointerCapture may throw — safe to ignore.
      }
    };

    const onMove = (e: PointerEvent): void => {
      if (!drawingRef.current) return;
      pathRef.current.push([e.offsetX, e.offsetY]);
      drawPath(pathRef.current);
    };

    const onUp = (e: PointerEvent): void => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      try {
        cv.releasePointerCapture(e.pointerId);
      } catch {
        // jsdom/older browsers: releasePointerCapture may throw — safe to ignore.
      }
      const path = pathRef.current;
      pathRef.current = [];
      clearOverlay();
      onDragEnd?.(); // always re-enable controls, even on a too-short path
      if (path.length < 3) return;
      onComplete(hitTest(path, cv.clientWidth, cv.clientHeight));
    };

    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    window.addEventListener("resize", resize);
    // Window-level finalizers catch a release/cancel that lands outside the canvas
    // (drag off-screen, or setPointerCapture having failed/thrown on old browsers or
    // jsdom). On a normal in-canvas release both the canvas and window listeners fire
    // onUp, but the drawingRef guard at the top of onUp makes the second call a no-op
    // — keep that guard intact.
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onUp);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      // Unmounting mid-drag (e.g. the toolbar toggles lasso off while the button is
      // held) must thaw OrbitControls — onUp won't fire after teardown.
      if (drawingRef.current) onDragEnd?.();
      drawingRef.current = false;
      pathRef.current = [];
      clearOverlay();
    };
  }, [active, hitTest, onComplete, onDragStart, onDragEnd]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="lasso-overlay"
      data-active={active ? "true" : "false"}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: active ? "auto" : "none",
        cursor: active ? "crosshair" : "default",
      }}
    />
  );
}
