/**
 * positions3Quant.ts — u16 quantization for the 3D activity embedding column.
 *
 * The payload codec ships u16 columns; xyz in [-halfExtent, +halfExtent] maps
 * linearly onto [0, 65535] (worst-case error halfExtent/32767 ≈ 0.03 units at
 * the pipeline's 1000-unit extent — invisible at point scale). Shared by the
 * payload builder (encode) and the 3D view (decode). Pure — no React/DOM/IO.
 */

export const POSITIONS3_QMAX = 65535;

/** Quantize stride-3 float positions into u16; caller supplies the halfExtent. */
export function quantizePositions3(xyz: Float32Array, halfExtent: number): Uint16Array {
  const q = new Uint16Array(xyz.length);
  const scale = halfExtent > 0 ? POSITIONS3_QMAX / (2 * halfExtent) : 0;
  for (let i = 0; i < xyz.length; i++) {
    const v = (xyz[i] + halfExtent) * scale;
    q[i] = v <= 0 ? 0 : v >= POSITIONS3_QMAX ? POSITIONS3_QMAX : Math.round(v);
  }
  return q;
}

/** Dequantize one u16 component back to float space. */
export function dequantizePosition3(q: number, halfExtent: number): number {
  return (q / POSITIONS3_QMAX) * 2 * halfExtent - halfExtent;
}
