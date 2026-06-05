import { describe, it, expect } from "vitest";
import { PerspectiveCamera } from "three";
import { findPointsIn3DLasso, pointInPolygon } from "./lasso3d";

function centeredCamera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(50, 1, 0.1, 100000);
  cam.position.set(0, 0, 1000);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

const W = 800;
const H = 800;
// A square covering the screen center (350,350)-(450,450).
const centerSquare: [number, number][] = [
  [350, 350], [450, 350], [450, 450], [350, 450],
];

describe("pointInPolygon", () => {
  it("includes a point inside and excludes one outside", () => {
    expect(pointInPolygon(400, 400, centerSquare)).toBe(true);
    expect(pointInPolygon(10, 10, centerSquare)).toBe(false);
  });
});

describe("findPointsIn3DLasso", () => {
  it("selects a node projecting to screen center, excludes a far-offset node", () => {
    const positions = new Float32Array([0, 0, 0, 600, 0, 0]);
    const sel = findPointsIn3DLasso(positions, centeredCamera(), centerSquare, W, H);
    expect(sel.has(0)).toBe(true);
    expect(sel.has(1)).toBe(false);
  });

  it("returns empty for a degenerate polygon", () => {
    const positions = new Float32Array([0, 0, 0]);
    const sel = findPointsIn3DLasso(positions, centeredCamera(), [[1, 1], [2, 2]], W, H);
    expect(sel.size).toBe(0);
  });

  it("excludes nodes behind the camera", () => {
    const positions = new Float32Array([0, 0, 2000]);
    const sel = findPointsIn3DLasso(positions, centeredCamera(), centerSquare, W, H);
    expect(sel.has(0)).toBe(false);
  });
});
