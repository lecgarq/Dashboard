/**
 * lasso3d.ts — pure screen-space lasso selection for the 3D graph.
 *
 * Projects each node's world position through the live camera to canvas-local
 * CSS pixels, then runs ray-casting point-in-polygon against the lasso path.
 * No DOM, no scene — unit-testable with a bare three.js camera.
 */
import { Vector3, type PerspectiveCamera } from "three";

/** Ray-casting point-in-polygon on screen-space pixel coords. */
export function pointInPolygon(
  px: number,
  py: number,
  poly: ReadonlyArray<readonly [number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Select node indices whose projected screen position lies inside the polygon.
 * `positions` is stride-3 world xyz; `camera` must already be world-matrix-updated;
 * `polygon` is the canvas-local CSS-pixel path; `width`/`height` are the canvas CSS size.
 * Nodes behind the camera or beyond the far plane (NDC z > 1) are excluded.
 */
export function findPointsIn3DLasso(
  positions: Float32Array,
  camera: PerspectiveCamera,
  polygon: ReadonlyArray<readonly [number, number]>,
  width: number,
  height: number,
): Set<number> {
  const out = new Set<number>();
  if (polygon.length < 3 || width <= 0 || height <= 0) return out;
  const v = new Vector3();
  const n = positions.length / 3;
  for (let i = 0; i < n; i++) {
    v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    v.project(camera); // -> NDC in [-1, 1]
    if (v.z > 1) continue; // behind camera / beyond far plane
    const sx = (v.x * 0.5 + 0.5) * width;
    const sy = (1 - (v.y * 0.5 + 0.5)) * height; // NDC y-up -> screen y-down
    if (pointInPolygon(sx, sy, polygon)) out.add(i);
  }
  return out;
}
