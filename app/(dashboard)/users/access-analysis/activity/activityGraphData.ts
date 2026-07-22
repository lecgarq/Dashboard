/** Pure search/filter/link transforms for the resident activity graph. */

export const MAX_ACTIVITY_LINKS = 20_000;

export interface AuthorMatch {
  /** Null means no author filter; otherwise one byte per author dictionary slot. */
  mask: Uint8Array | null;
  matchedAuthorCount: number;
}

/** Case-insensitive substring match over the resident author labels. */
export function buildAuthorMatch(labels: readonly string[], query: string): AuthorMatch {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return { mask: null, matchedAuthorCount: 0 };

  const mask = new Uint8Array(labels.length);
  let matchedAuthorCount = 0;
  for (let id = 1; id < labels.length; id++) {
    if (labels[id].toLocaleLowerCase().includes(needle)) {
      mask[id] = 1;
      matchedAuthorCount += 1;
    }
  }
  return { mask, matchedAuthorCount };
}

/** Compose exact-month and author filters in one pass; null means no filters. */
export function filterActivityIndices(args: {
  authorId: Uint32Array;
  monthId: Uint16Array;
  selectedMonth: number | null;
  authorMask: Uint8Array | null;
}): Uint32Array | null {
  const { authorId, monthId, selectedMonth, authorMask } = args;
  if (selectedMonth === null && authorMask === null) return null;

  let count = 0;
  for (let i = 0; i < authorId.length; i++) {
    if (selectedMonth !== null && monthId[i] !== selectedMonth) continue;
    if (authorMask !== null && authorMask[authorId[i]] !== 1) continue;
    count += 1;
  }

  const indices = new Uint32Array(count);
  let cursor = 0;
  for (let i = 0; i < authorId.length; i++) {
    if (selectedMonth !== null && monthId[i] !== selectedMonth) continue;
    if (authorMask !== null && authorMask[authorId[i]] !== 1) continue;
    indices[cursor++] = i;
  }
  return indices;
}

/**
 * Bounded same-author chains in rendered-index space. Unknown authors are
 * excluded; the cap keeps links useful without trading away zoom smoothness.
 */
export function buildActivityAuthorLinks(
  authorId: Uint32Array,
  renderedFullIndices: Uint32Array,
  authorCount: number,
  maxLinks: number = MAX_ACTIVITY_LINKS,
): Float32Array {
  if (maxLinks <= 0 || authorCount <= 1) return new Float32Array(0);
  const previous = new Int32Array(authorCount).fill(-1);
  const out = new Float32Array(Math.min(maxLinks, renderedFullIndices.length) * 2);
  let links = 0;

  for (let rendered = 0; rendered < renderedFullIndices.length && links < maxLinks; rendered++) {
    const author = authorId[renderedFullIndices[rendered]];
    if (author === 0 || author >= authorCount) continue;
    const prior = previous[author];
    if (prior >= 0) {
      out[links * 2] = prior;
      out[links * 2 + 1] = rendered;
      links += 1;
    }
    previous[author] = rendered;
  }
  return out.slice(0, links * 2);
}
