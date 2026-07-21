/**
 * spikeSynthetic.ts — deterministic synthetic data for the Phase-37 scale spike.
 *
 * Positions are synthetic (clustered Gaussian mixture, organic overdraw profile)
 * at REAL corpus scale; attribute columns use REAL cardinalities measured
 * read-only on 2026-07-21 (see SPIKE_CARDINALITIES). Pure module — no React,
 * no DOM — so the payload route (37-02) and the client share one generator.
 */

/** Live corpus scale + cardinalities, measured 2026-07-21 (read-only census). */
export const SPIKE_DEFAULT_COUNT = 4_862_301;
export const SPIKE_CARDINALITIES = {
  /** SELECT COUNT(DISTINCT "activityVerb") FROM "AccActivityAccds" */
  verbs: 57,
  /** SELECT COUNT(DISTINCT "objectType") */
  objectTypes: 13,
  /** distinct projects in AccActivityAccds (census) */
  projects: 956,
  /** distinct authors (userEmail, census) */
  authors: 2_313,
  /** months spanned by the corpus (~5 years) */
  months: 60,
} as const;

export const SPIKE_DEFAULT_SEED = 42;

/** Layout half-extent the frozen-path camera assumptions expect (≈±350). */
const HALF_EXTENT = 350;
const CLUSTER_COUNT = 48;

/** mulberry32 — tiny deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stride-3 Float32Array(n*3) Gaussian-mixture positions (z=0 — the 2D renderer
 * downprojects anyway). ~48 clusters of uneven weight inside ±HALF_EXTENT,
 * exercising realistic overdraw.
 */
export function generateSpikePositions(n: number, seed = SPIKE_DEFAULT_SEED): Float32Array {
  const rand = mulberry32(seed);
  const centers = new Float32Array(CLUSTER_COUNT * 2);
  const sigmas = new Float32Array(CLUSTER_COUNT);
  const weights = new Float32Array(CLUSTER_COUNT);
  let weightSum = 0;
  for (let c = 0; c < CLUSTER_COUNT; c++) {
    const ang = rand() * Math.PI * 2;
    const rad = Math.sqrt(rand()) * (HALF_EXTENT * 0.82);
    centers[c * 2] = Math.cos(ang) * rad;
    centers[c * 2 + 1] = Math.sin(ang) * rad;
    sigmas[c] = 14 + rand() * 30;
    weights[c] = 0.2 + rand() * rand() * 4; // uneven cluster sizes
    weightSum += weights[c];
  }
  // Cumulative weights → cluster pick by one uniform draw.
  const cum = new Float32Array(CLUSTER_COUNT);
  let acc = 0;
  for (let c = 0; c < CLUSTER_COUNT; c++) {
    acc += weights[c] / weightSum;
    cum[c] = acc;
  }

  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rand();
    let c = 0;
    while (c < CLUSTER_COUNT - 1 && cum[c] < u) c++;
    // Box-Muller gaussian offsets
    const r1 = Math.max(rand(), 1e-12);
    const r2 = rand();
    const mag = Math.sqrt(-2 * Math.log(r1)) * sigmas[c];
    let x = centers[c * 2] + mag * Math.cos(Math.PI * 2 * r2);
    let y = centers[c * 2 + 1] + mag * Math.sin(Math.PI * 2 * r2);
    // Clamp inside the expected extent so the fit path frames a known spread.
    if (x > HALF_EXTENT) x = HALF_EXTENT;
    else if (x < -HALF_EXTENT) x = -HALF_EXTENT;
    if (y > HALF_EXTENT) y = HALF_EXTENT;
    else if (y < -HALF_EXTENT) y = -HALF_EXTENT;
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    // z stays 0
  }
  return out;
}

export interface SpikeAttributeColumns {
  verbId: Uint8Array;
  objectTypeId: Uint8Array;
  projectId: Uint16Array;
  authorId: Uint16Array;
  month: Uint8Array;
}

/**
 * Attribute columns at real cardinalities with a skewed (power-law-ish)
 * distribution — real activity data is heavily skewed toward a few verbs/
 * projects, and skew is what makes color/mask work realistic.
 */
export function generateSpikeAttributes(
  n: number,
  seed = SPIKE_DEFAULT_SEED,
  card = SPIKE_CARDINALITIES,
): SpikeAttributeColumns {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const verbId = new Uint8Array(n);
  const objectTypeId = new Uint8Array(n);
  const projectId = new Uint16Array(n);
  const authorId = new Uint16Array(n);
  const month = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = rand();
    verbId[i] = Math.min(card.verbs - 1, Math.floor(r * r * card.verbs));
    const r2 = rand();
    objectTypeId[i] = Math.min(card.objectTypes - 1, Math.floor(r2 * r2 * card.objectTypes));
    const r3 = rand();
    projectId[i] = Math.min(card.projects - 1, Math.floor(r3 * r3 * card.projects));
    const r4 = rand();
    authorId[i] = Math.min(card.authors - 1, Math.floor(r4 * r4 * card.authors));
    // Recency-skewed months: most events recent (mirrors the 4.46M-of-4.86M last-12-months census).
    const r5 = rand();
    month[i] = Math.min(card.months - 1, Math.floor(r5 * r5 * r5 * card.months));
  }
  return { verbId, objectTypeId, projectId, authorId, month };
}

/** Fixed 16-color palette (zinc-dark friendly); RGBA in [0,1]. */
const PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0.38, 0.65, 0.98], [0.55, 0.83, 0.45], [0.96, 0.62, 0.35], [0.85, 0.44, 0.84],
  [0.35, 0.85, 0.83], [0.95, 0.80, 0.35], [0.90, 0.42, 0.45], [0.55, 0.55, 0.95],
  [0.45, 0.90, 0.60], [0.80, 0.60, 0.40], [0.65, 0.45, 0.85], [0.40, 0.75, 0.90],
  [0.90, 0.70, 0.55], [0.60, 0.85, 0.35], [0.85, 0.50, 0.65], [0.50, 0.68, 0.78],
];

/** RGBA Float32Array(n*4) derived from the verb column (palette cycled). */
export function colorsFromVerbColumn(verbId: Uint8Array): Float32Array {
  const n = verbId.length;
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = PALETTE[verbId[i] % PALETTE.length];
    out[i * 4] = p[0];
    out[i * 4 + 1] = p[1];
    out[i * 4 + 2] = p[2];
    out[i * 4 + 3] = 0.85;
  }
  return out;
}
