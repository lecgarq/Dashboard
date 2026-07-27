// SPLIT-02 (REF-01) — extracted verbatim from FolderPermissionTerrain.tsx.
// Interaction hooks: Revit-style camera orbit/pan/zoom/pivot, reduced-motion
// detection, and the bar-height grow-in tween. No JSX — safe for any client
// component in this folder to import.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  projectCamera,
  easeCamera,
  HOME_YAW,
  HOME_PITCH,
  MIN_PITCH,
  MAX_PITCH,
  type Camera,
} from "../folderTerrain";

export type DragMode = "select" | "orbit" | "pan";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------
// Camera hook — Revit-style navigation around a fixed pivot.
//   wheel               → zoom toward cursor
//   middle-drag         → pan
//   shift + middle-drag → orbit (spin + tilt)
//   left-drag           → follows the active tool button (Orbit/Pan) for
//                         trackpads without a middle button; otherwise select
// rAF-coalesced so a burst of pointer events repaints once per frame.
// ---------------------------------------------------------------------------
export function useCamera(viewport: { w: number; h: number }) {
  const camRef = useRef<Camera>({
    pivotCol: 0, pivotRow: 0, yaw: HOME_YAW, pitch: HOME_PITCH, scale: 1,
    anchorX: viewport.w / 2, anchorY: viewport.h / 2,
  });
  const [cam, setCam] = useState<Camera>(camRef.current);
  const raf = useRef<number | null>(null);
  const tweenRaf = useRef<number | null>(null);
  const commit = useCallback(() => { raf.current = null; setCam({ ...camRef.current }); }, []);
  const schedule = useCallback(() => { if (raf.current == null) raf.current = requestAnimationFrame(commit); }, [commit]);
  // Direct manipulation (orbit/pan/zoom/repivot) cancels any in-flight tween.
  const apply = useCallback((patch: Partial<Camera>) => {
    if (tweenRaf.current) { cancelAnimationFrame(tweenRaf.current); tweenRaf.current = null; }
    camRef.current = { ...camRef.current, ...patch };
    schedule();
  }, [schedule]);

  const [dragMode, setDragMode] = useState<DragMode>("select");
  const drag = useRef({ active: false, button: 0, dragged: false, lastX: 0, lastY: 0, startX: 0, startY: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const left = e.button === 0, mid = e.button === 1;
    const engage = mid || (left && dragMode !== "select");
    drag.current = { active: engage, button: e.button, dragged: false, lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY };
    if (engage) {
      if (mid) e.preventDefault();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
  }, [dragMode]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.lastX, dy = e.clientY - d.lastY;
    d.lastX = e.clientX; d.lastY = e.clientY;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.dragged = true;
    const mid = d.button === 1;
    const orbit = (mid && e.shiftKey) || (d.button === 0 && dragMode === "orbit");
    const pan = (mid && !e.shiftKey) || (d.button === 0 && dragMode === "pan");
    const c = camRef.current;
    if (orbit) apply({ yaw: c.yaw + dx * 0.009, pitch: clamp(c.pitch + dy * 0.006, MIN_PITCH, MAX_PITCH) });
    else if (pan) apply({ anchorX: c.anchorX + dx, anchorY: c.anchorY + dy });
  }, [apply, dragMode]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (drag.current.active) (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    drag.current.active = false;
  }, []);

  const wheelZoom = useCallback((clientX: number, clientY: number, deltaY: number, rect: DOMRect) => {
    const cx = clientX - rect.left, cy = clientY - rect.top;
    const c = camRef.current;
    const k = clamp(c.scale * Math.exp(-deltaY * 0.0012), 0.16, 4) / c.scale;
    apply({ scale: c.scale * k, anchorX: cx - (cx - c.anchorX) * k, anchorY: cy - (cy - c.anchorY) * k });
  }, [apply]);

  // Re-pivot to a clicked cell WITHOUT moving it: keep the cell's current ground
  // point fixed (anchor = where it projects right now), so orbit then spins
  // around that square in place — no jump.
  const setPivotCell = useCallback((col: number, row: number) => {
    const c = camRef.current;
    const here = projectCamera(col, row, 0, c);
    apply({ pivotCol: col, pivotRow: row, anchorX: here.x, anchorY: here.y });
  }, [apply]);

  // Cubic-eased camera move (Frame / Reset). Reduced-motion → snap instantly.
  const tweenTo = useCallback((target: Camera, ms = 300) => {
    if (tweenRaf.current) cancelAnimationFrame(tweenRaf.current);
    if (prefersReducedMotion()) { camRef.current = { ...target }; setCam({ ...target }); return; }
    const from = { ...camRef.current };
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const k = Math.min(1, (t - start) / ms);
      camRef.current = easeCamera(from, target, k);
      setCam({ ...camRef.current });
      if (k < 1) tweenRaf.current = requestAnimationFrame(step);
    };
    tweenRaf.current = requestAnimationFrame(step);
  }, []);

  const framePivot = useCallback(() => { tweenTo({ ...camRef.current, anchorX: viewport.w / 2, anchorY: viewport.h / 2 }); }, [tweenTo, viewport.w, viewport.h]);

  // Instant reframe — used when the active data set changes (grow-in + cross-fade
  // cover the visual transition; a camera tween here would fight them).
  const resetTo = useCallback((pivotCol: number, pivotRow: number, scale = 1) => {
    if (tweenRaf.current) { cancelAnimationFrame(tweenRaf.current); tweenRaf.current = null; }
    camRef.current = { pivotCol, pivotRow, yaw: HOME_YAW, pitch: HOME_PITCH, scale, anchorX: viewport.w / 2, anchorY: viewport.h / 2 };
    setCam({ ...camRef.current });
  }, [viewport.w, viewport.h]);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); if (tweenRaf.current) cancelAnimationFrame(tweenRaf.current); }, []);

  return {
    cam, dragRef: drag, dragMode, setDragMode,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave: onPointerUp },
    wheelZoom, setPivotCell, framePivot, resetTo, tweenTo,
  };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Eases a 0→1 growth factor whenever `key` changes (bar grow-in). */
export function useGrowth(key: string): number {
  const [g, setG] = useState(() => (prefersReducedMotion() ? 1 : 0));
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (prefersReducedMotion()) { setG(1); return; }
    let start = 0;
    const D = 460;
    setG(0);
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / D);
      setG(1 - Math.pow(1 - p, 3)); // ease-out cubic
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [key]);
  return g;
}
