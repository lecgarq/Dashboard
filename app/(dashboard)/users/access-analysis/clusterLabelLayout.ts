/**
 * clusterLabelLayout.ts — Pure label level-of-detail selection. A label is a
 * candidate only when its blob's ON-SCREEN radius clears a threshold (so zoomed
 * out shows only big blobs; zooming in reveals more). Among candidates, bigger
 * blobs win slots; a greedy declutter drops any that collide with one already
 * placed. No DOM — the component feeds projected screen coords in and renders out.
 */
import { easeMorph } from "./layoutDescriptor";

/**
 * Live label anchor (space coords) for a cluster mid-morph. Each node eases from its
 * rest position to its packed clump on the `easeMorph` curve, so the cluster's live
 * centroid is the SAME-curve lerp of its rest centroid → footprint center. Anchoring
 * the chip here makes it RIDE its cluster at every slider value — not just snap onto it
 * at full strength (the bug where chips sat at the empty destination during the morph).
 * `progress` is the RAW slider value 0..1; `easeMorph` (the single source of the morph
 * curve, shared with descriptorTarget) is applied here so chip and dots stay locked.
 */
export function liveLabelCenter(
  restX: number,
  restY: number,
  footX: number,
  footY: number,
  progress: number,
): [number, number] {
  const s = easeMorph(progress);
  return [restX + (footX - restX) * s, restY + (footY - restY) * s];
}

/**
 * The clusters eligible for a chip: the `max` largest by member count, across ALL
 * clusters (not just the legend-colored ones), ranked biggest-first. The per-frame LOD
 * (selectVisibleLabels) then reveals a candidate only once its blob is big enough on
 * screen — so small clusters get a name when you zoom into them, while the rendered DOM
 * stays bounded (one node per tiny cluster is the per-frame cost that tanks fps). Stable
 * for equal counts (original index order). Pure.
 */
export function labelCandidateClusters(counts: ReadonlyArray<number>, max: number): number[] {
  const idx = counts.map((_, i) => i);
  idx.sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0)); // V8 sort is stable → ties keep index order
  return idx.slice(0, Math.min(counts.length, max));
}

export interface LabelCandidate {
  i: number;
  screenX: number;
  screenY: number;
  screenRadius: number;
  count: number;
}
export interface LabelLayoutOpts {
  minScreenRadius: number;
  sepX: number;
  sepY: number;
}

export function selectVisibleLabels(
  candidates: ReadonlyArray<LabelCandidate>,
  opts: LabelLayoutOpts,
): LabelCandidate[] {
  const eligible = candidates
    .filter((c) => c.screenRadius >= opts.minScreenRadius)
    .sort((a, b) => b.count - a.count); // biggest first wins the slot
  const placed: LabelCandidate[] = [];
  for (const c of eligible) {
    let collide = false;
    for (const p of placed) {
      if (Math.abs(c.screenX - p.screenX) < opts.sepX && Math.abs(c.screenY - p.screenY) < opts.sepY) {
        collide = true;
        break;
      }
    }
    if (!collide) placed.push(c);
  }
  return placed;
}
