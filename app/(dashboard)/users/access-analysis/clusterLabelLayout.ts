/**
 * clusterLabelLayout.ts — Pure label level-of-detail selection. A label is a
 * candidate only when its blob's ON-SCREEN radius clears a threshold (so zoomed
 * out shows only big blobs; zooming in reveals more). Among candidates, bigger
 * blobs win slots; a greedy declutter drops any that collide with one already
 * placed. No DOM — the component feeds projected screen coords in and renders out.
 */
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
