import { SAMPLE_CAP } from "./lodSample";

/** Full-corpus row indices for one exact month, in stable payload order. */
export function indicesForMonth(monthIds: Uint16Array, month: number): Uint32Array {
  let count = 0;
  for (let i = 0; i < monthIds.length; i++) if (monthIds[i] === month) count += 1;
  const out = new Uint32Array(count);
  for (let i = 0, j = 0; i < monthIds.length; i++) {
    if (monthIds[i] === month) out[j++] = i;
  }
  return out;
}

/** Deterministic uniform L2 sample of an existing full-index set. */
export function sampleFullIndices(
  fullIndices: Uint32Array,
  cap: number = SAMPLE_CAP,
): Uint32Array {
  if (fullIndices.length <= cap) return fullIndices;
  const stride = Math.max(1, Math.ceil(fullIndices.length / cap));
  const out = new Uint32Array(Math.ceil(fullIndices.length / stride));
  for (let i = 0; i < out.length; i++) out[i] = fullIndices[i * stride];
  return out;
}
