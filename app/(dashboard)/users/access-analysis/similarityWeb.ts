/**
 * similarityWeb.ts — PURE client model for the Force-Atlas similarity web.
 *
 * REND-04 purity: no React, no DOM, no data/math-layer imports. Turns the
 * server's nodeId edge set into index buffers, community×strength colors, and the
 * projection/curve geometry the Canvas2D overlay draws. Fully unit-testable.
 */

export interface SimEdgeIds {
  a: string;
  b: string;
  score: number;
}

export interface IndexedWeb {
  /** Source cosmos index per edge. */
  src: Int32Array;
  /** Target cosmos index per edge. */
  dst: Int32Array;
  /** Per-edge similarity strength, min-max normalized to [0,1]. */
  strength: Float32Array;
  /** How many input edges were dropped (unknown endpoint or self-edge). */
  dropped: number;
}

export function mapEdgesToIndices(
  edges: readonly SimEdgeIds[],
  indexByNodeId: ReadonlyMap<string, number>,
): IndexedWeb {
  const src: number[] = [];
  const dst: number[] = [];
  const raw: number[] = [];
  let dropped = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const e of edges) {
    const ia = indexByNodeId.get(e.a);
    const ib = indexByNodeId.get(e.b);
    if (ia === undefined || ib === undefined || ia === ib) {
      dropped++;
      continue;
    }
    src.push(ia);
    dst.push(ib);
    raw.push(e.score);
    if (e.score < min) min = e.score;
    if (e.score > max) max = e.score;
  }

  const n = src.length;
  const strength = new Float32Array(n);
  const span = max - min;
  for (let i = 0; i < n; i++) {
    strength[i] = span > 1e-9 ? (raw[i] - min) / span : 1;
  }

  return { src: Int32Array.from(src), dst: Int32Array.from(dst), strength, dropped };
}

export interface EdgePaint {
  /** Per-edge palette index (Uint16: distinct community-blend × alpha combos). */
  bucket: Uint16Array;
  /** Per-edge weak/medium/strong width band. */
  band: Uint8Array;
  /** Flat RGBA palette (length = bucketCount * 4), values in [0,1]. */
  palette: Float32Array;
}

export type LinkStrengthBand = 0 | 1 | 2;

const LINK_BAND_STYLES = [
  { width: 0.65, alpha: 0.45 },
  { width: 1.05, alpha: 0.7 },
  { width: 1.55, alpha: 1 },
] as const;

export function strengthBand(strength: number): LinkStrengthBand {
  if (!Number.isFinite(strength) || strength < 1 / 3) return 0;
  return strength < 2 / 3 ? 1 : 2;
}

export function linkBandStyle(band: LinkStrengthBand): Readonly<{ width: number; alpha: number }> {
  return LINK_BAND_STYLES[band];
}

export interface FocusMatchIndex {
  index: number;
  score: number;
}

export interface FocusEdge {
  src: number;
  dst: number;
  score: number;
  /** Existing global-web edge index, or null when synthesized from the match payload. */
  webIndex: number | null;
}

export interface FocusEdges {
  selected: FocusEdge[];
  hovered: FocusEdge[];
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Resolve the two transient focus layers without changing the ambient edge set.
 * Selected edges follow the authoritative on-demand match payload and therefore
 * synthesize a direct curve when the capped global web omitted one. Hover remains
 * fetch-free and only raises incident edges already present in the global web.
 */
export function resolveFocusEdges(
  web: IndexedWeb,
  selectedIndex: number | null,
  selectedMatches: readonly FocusMatchIndex[],
  hoveredIndex: number | null,
): FocusEdges {
  const webIndexByPair = new Map<string, number>();
  for (let i = 0; i < web.src.length; i++) {
    webIndexByPair.set(pairKey(web.src[i], web.dst[i]), i);
  }

  const selected: FocusEdge[] = [];
  const seenSelected = new Set<number>();
  if (selectedIndex !== null) {
    for (const match of selectedMatches) {
      if (match.index < 0 || match.index === selectedIndex || seenSelected.has(match.index)) continue;
      seenSelected.add(match.index);
      selected.push({
        src: selectedIndex,
        dst: match.index,
        score: match.score,
        webIndex: webIndexByPair.get(pairKey(selectedIndex, match.index)) ?? null,
      });
    }
  }

  const hovered: FocusEdge[] = [];
  if (hoveredIndex !== null) {
    for (let i = 0; i < web.src.length; i++) {
      if (web.src[i] !== hoveredIndex && web.dst[i] !== hoveredIndex) continue;
      hovered.push({
        src: web.src[i],
        dst: web.dst[i],
        score: Number.isFinite(web.strength[i]) ? web.strength[i] : 1,
        webIndex: i,
      });
    }
  }

  return { selected, hovered };
}

/** Base-alpha ceiling per theme — translucent, but legible (not halftone-faint). */
function baseAlpha(theme: "light" | "dark"): number {
  return theme === "dark" ? 0.38 : 0.3;
}

/**
 * Per-edge color = blend of the two endpoints' community colors (so within-cluster
 * edges take the cluster hue), with alpha scaled by similarity strength. Colors are
 * quantized so identical edges share one palette bucket → the overlay batch-strokes
 * one Path2D per bucket.
 */
export function computeEdgeColors(
  web: IndexedWeb,
  nodeColors: Float32Array,
  theme: "light" | "dark",
): EdgePaint {
  const n = web.src.length;
  const bucket = new Uint16Array(n);
  const band = new Uint8Array(n);
  const a0 = baseAlpha(theme);
  const keyToBucket = new Map<number, number>();
  const palette: number[] = [];

  for (let i = 0; i < n; i++) {
    const s = web.src[i] * 4;
    const d = web.dst[i] * 4;
    let r = (nodeColors[s] + nodeColors[d]) * 0.5;
    let g = (nodeColors[s + 1] + nodeColors[d + 1]) * 0.5;
    let b = (nodeColors[s + 2] + nodeColors[d + 2]) * 0.5;
    // On light backgrounds, darken the tint a touch so faint threads read on white.
    if (theme === "light") {
      r *= 0.85;
      g *= 0.85;
      b *= 0.85;
    }
    const edgeBand = strengthBand(web.strength[i]);
    band[i] = edgeBand;
    const aFrac = linkBandStyle(edgeBand).alpha;

    // Quantize: 5-bit RGB + 3-bit alpha. Safe for up to ~127 distinct community hues
    // (cosmos.gl caps at ~12, giving <=624 buckets — well within Uint16).
    const rq = Math.min(31, Math.round(r * 31));
    const gq = Math.min(31, Math.round(g * 31));
    const bq = Math.min(31, Math.round(b * 31));
    const aq = Math.min(7, Math.round(aFrac * 7));
    const key = ((rq * 32 + gq) * 32 + bq) * 8 + aq;

    let bi = keyToBucket.get(key);
    if (bi === undefined) {
      bi = palette.length / 4;
      keyToBucket.set(key, bi);
      palette.push(rq / 31, gq / 31, bq / 31, a0 * (aq / 7));
    }
    bucket[i] = bi;
  }

  return { bucket, band, palette: Float32Array.from(palette) };
}

export interface Affine {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
}

/**
 * Recover the space→screen affine from the renderer's `spaceToScreen` by probing
 * three reference points. cosmos.gl 2D is pan+zoom only (axis-aligned, no rotation/
 * skew), so a scale+translate is exact — and one solve per redraw replaces N
 * per-node spaceToScreen calls (the hot-loop optimization).
 */
export function solveAffine(
  spaceToScreen: (p: [number, number]) => [number, number],
): Affine {
  const A = spaceToScreen([0, 0]);
  const B = spaceToScreen([1000, 0]);
  const C = spaceToScreen([0, 1000]);
  return {
    sx: (B[0] - A[0]) / 1000,
    sy: (C[1] - A[1]) / 1000,
    ox: A[0],
    oy: A[1],
  };
}

export function project(aff: Affine, x: number, y: number): [number, number] {
  return [x * aff.sx + aff.ox, y * aff.sy + aff.oy];
}

/**
 * Control point for a gentle, uniformly-signed bow: the segment midpoint offset
 * along the perpendicular by `k * |segment-as-vector|` (here `k` multiplies the raw
 * delta, giving a curve proportional to segment length). Consistent sign → all arcs
 * bow the same way, reading as flow rather than noise.
 */
export function quadControl(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  k: number,
): [number, number] {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  return [mx - dy * k, my + dx * k];
}

/** The web stays at one quarter of its normal expression during a layout morph. */
export function morphOpacityTarget(opacity: number, morphing: boolean): number {
  const base = Math.max(0, Math.min(1, opacity));
  return morphing ? base * 0.25 : base;
}

/** Dt-driven exponential settle; tau puts the visual return at about durationMs. */
export function stepOpacity(cur: number, target: number, dtMs: number, durationMs = 180): number {
  if (durationMs <= 0) return target;
  const dt = Math.min(50, Math.max(0, dtMs));
  const rate = 1 - Math.exp(-dt / (durationMs / 5));
  const next = cur + (target - cur) * rate;
  return Math.abs(target - next) < 0.005 ? target : next;
}
