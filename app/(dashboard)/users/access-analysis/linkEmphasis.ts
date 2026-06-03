import type { SameUserEdge } from "./sameUserEdges";

export type RGBA = readonly [number, number, number, number];

export interface LinkColorOpts {
  base: RGBA;
  bright: RGBA;
  dim: RGBA;
}

// cosmos.gl RGBA is 0–1 floats (matches setPointColors in this repo).
export const DEFAULT_LINK_COLORS: LinkColorOpts = {
  base: [0.6, 0.62, 0.66, 0.14], // faint cool grey — quiet always-on lines
  bright: [0.85, 0.88, 0.95, 0.9], // near-white — a person's lines light up on click/isolate
  dim: [0.6, 0.62, 0.66, 0.04], // nearly invisible when another user is focused
};

/** Per-link RGBA buffer. No focus → all base. Focus → active-user bright, rest dim. */
export function computeLinkEmphasisColors(
  edges: readonly SameUserEdge[],
  activeUserIds: ReadonlySet<string>,
  colors: LinkColorOpts = DEFAULT_LINK_COLORS,
): Float32Array {
  const out = new Float32Array(edges.length * 4);
  const hasFocus = activeUserIds.size > 0;
  for (let i = 0; i < edges.length; i++) {
    const c = !hasFocus
      ? colors.base
      : activeUserIds.has(edges[i].userId)
        ? colors.bright
        : colors.dim;
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = c[3];
  }
  if (process.env.NODE_ENV !== "production") {
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error(`linkEmphasis: color value out of [0,1]: ${v}`);
      }
    }
  }
  return out;
}

/** Number of edges that would be brightened for the given focus set. */
export function countBrightEdges(
  edges: readonly SameUserEdge[],
  activeUserIds: ReadonlySet<string>,
): number {
  if (activeUserIds.size === 0) return 0;
  let n = 0;
  for (const e of edges) if (activeUserIds.has(e.userId)) n++;
  return n;
}

/** Dev guard: link + color buffers must match the edge count. */
export function assertLinkArrays(edgeCount: number, links: Float32Array, colors: Float32Array): void {
  if (links.length !== edgeCount * 2) {
    throw new Error(`links.length (${links.length}) !== edges*2 (${edgeCount * 2})`);
  }
  if (colors.length !== edgeCount * 4) {
    throw new Error(`colors.length (${colors.length}) !== edges*4 (${edgeCount * 4})`);
  }
}
