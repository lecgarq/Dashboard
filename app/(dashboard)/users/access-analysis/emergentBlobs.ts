/**
 * emergentBlobs.ts — derive labelled blobs from where similar nodes EMERGENTLY
 * settle in the continuous similarity layout. Pure & deterministic.
 *
 * Input positions come straight from the physics layer (stride-2 [x,y]); each
 * node carries a signature key (its values across the active dimensions). We
 * compute each signature's live centroid, MERGE signatures whose centroids are
 * within `mergeDist` (they ended up together ⇒ similar), keep the top-N blobs by
 * member count, and label each by its largest contributing signature. Positions
 * flow continuously, so callers throttle/ease this — the dots never jump.
 */
export interface EmergentBlob {
  centroidX: number;
  centroidY: number;
  radius: number;
  label: string;
  count: number; // members after merge
}

export interface EmergentBlobOpts {
  topN: number;
  mergeDist: number;
}

interface SigAcc {
  sx: number;
  sy: number;
  n: number;
  label: string;
}

export function deriveEmergentBlobs(
  positions: Float32Array, // stride-2
  signatures: ReadonlyArray<string>,
  labels: Readonly<Record<string, string>>,
  opts: EmergentBlobOpts,
): EmergentBlob[] {
  const n = signatures.length;
  if (n === 0) return [];

  // 1. per-signature centroid + count (deterministic, insertion-independent sort below)
  const bySig = new Map<string, SigAcc>();
  for (let i = 0; i < n; i++) {
    const key = signatures[i];
    const x = positions[i * 2];
    const y = positions[i * 2 + 1];
    let a = bySig.get(key);
    if (!a) {
      a = { sx: 0, sy: 0, n: 0, label: labels[key] ?? key };
      bySig.set(key, a);
    }
    a.sx += x;
    a.sy += y;
    a.n += 1;
  }
  // ordered by count desc, then label asc (stable, deterministic)
  const sigs = [...bySig.entries()]
    .map(([, a]) => ({ cx: a.sx / a.n, cy: a.sy / a.n, count: a.n, label: a.label }))
    .sort((p, q) => q.count - p.count || (p.label < q.label ? -1 : p.label > q.label ? 1 : 0));

  // 2. greedy proximity merge (largest first absorbs nearby smaller signatures)
  const merged = sigs.map((s) => ({ ...s, taken: false }));
  const blobs: { cx: number; cy: number; count: number; label: string }[] = [];
  for (let i = 0; i < merged.length; i++) {
    if (merged[i].taken) continue;
    let sx = merged[i].cx * merged[i].count;
    let sy = merged[i].cy * merged[i].count;
    let count = merged[i].count;
    const label = merged[i].label; // largest signature names the blob
    merged[i].taken = true;
    for (let j = i + 1; j < merged.length; j++) {
      if (merged[j].taken) continue;
      const dx = merged[j].cx - merged[i].cx;
      const dy = merged[j].cy - merged[i].cy;
      if (Math.hypot(dx, dy) <= opts.mergeDist) {
        sx += merged[j].cx * merged[j].count;
        sy += merged[j].cy * merged[j].count;
        count += merged[j].count;
        merged[j].taken = true;
      }
    }
    blobs.push({ cx: sx / count, cy: sy / count, count, label });
  }

  // 3. top-N by count; radius from member spread (RMS distance), floored
  blobs.sort((p, q) => q.count - p.count || (p.label < q.label ? -1 : 1));
  const kept = blobs.slice(0, Math.max(1, opts.topN));
  return kept.map((b) => {
    let s2 = 0;
    let m = 0;
    for (let i = 0; i < n; i++) {
      const x = positions[i * 2];
      const y = positions[i * 2 + 1];
      if (Math.hypot(x - b.cx, y - b.cy) <= opts.mergeDist * 4) {
        s2 += (x - b.cx) ** 2 + (y - b.cy) ** 2;
        m += 1;
      }
    }
    const radius = m > 0 ? Math.max(8, Math.sqrt(s2 / m)) : 8;
    return { centroidX: b.cx, centroidY: b.cy, radius, label: b.label, count: b.count };
  });
}
