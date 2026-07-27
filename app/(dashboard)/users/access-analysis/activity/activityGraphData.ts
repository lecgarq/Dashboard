/** Pure search/filter/link transforms for the resident activity graph. */

export const MAX_ACTIVITY_LINKS = 20_000;

export interface AuthorMatch {
  /** Null means no author filter; otherwise one byte per author dictionary slot. */
  mask: Uint8Array | null;
  matchedAuthorCount: number;
}

/** Carry the nearest magnetic candidate through one bounded residue scan. */
export function scanMagnetPhase(
  positions2: Float32Array,
  center: readonly [number, number],
  radiusSq: number,
  step: number,
  phase: number,
  current: { index: number; distanceSq: number } = { index: -1, distanceSq: radiusSq },
): { index: number; distanceSq: number } {
  let best = current.index;
  let bestSq = Math.min(current.distanceSq, radiusSq);
  for (let index = phase; index < positions2.length / 2; index += step) {
    const dx = positions2[index * 2] - center[0];
    const dy = positions2[index * 2 + 1] - center[1];
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestSq) {
      bestSq = distanceSq;
      best = index;
    }
  }
  return { index: best, distanceSq: bestSq };
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

/**
 * Selected-project set → one byte per project dictionary slot. Null when the
 * selection covers every project (no filter) so the composed filter can stay
 * on its fast null path.
 */
export function buildProjectSelectionMask(
  projectDict: readonly string[],
  selected: ReadonlySet<string>,
): Uint8Array | null {
  if (projectDict.length === 0) return null;
  let all = true;
  const mask = new Uint8Array(projectDict.length);
  for (let id = 0; id < projectDict.length; id++) {
    if (selected.has(projectDict[id])) mask[id] = 1;
    else all = false;
  }
  return all ? null : mask;
}

/**
 * Compose the scrubber's exact-bucket pick with the author, project, role,
 * verb, and month filters in one pass; null means no filters at all.
 *
 * `timeId`/`selectedTime` are the SCRUBBER's granularity — weekId when the
 * payload carries the week column, monthId otherwise — while `monthId`/
 * `monthMask` are the independent month multi-select. Both can be active.
 */
export function filterActivityIndices(args: {
  authorId: Uint32Array;
  timeId: Uint16Array;
  selectedTime: number | null;
  authorMask: Uint8Array | null;
  /** Optional full-corpus candidates from an already-composed filter pass. */
  candidates?: Uint32Array;
  /** Optional generic color/category column and selection mask. */
  categoryId?: Uint16Array | Uint32Array;
  categoryMask?: Uint8Array | null;
  projectId?: Uint16Array | Uint32Array;
  projectMask?: Uint8Array | null;
  roleId?: Uint16Array;
  roleMask?: Uint8Array | null;
  verbId?: Uint16Array;
  verbMask?: Uint8Array | null;
  monthId?: Uint16Array;
  monthMask?: Uint8Array | null;
}): Uint32Array | null {
  const { authorId, timeId, selectedTime, authorMask } = args;
  const categoryMask = args.categoryMask ?? null;
  const categoryId = categoryMask !== null ? args.categoryId : undefined;
  const projectMask = args.projectMask ?? null;
  const projectId = projectMask !== null ? args.projectId : undefined;
  const roleMask = args.roleMask ?? null;
  const roleId = roleMask !== null ? args.roleId : undefined;
  const verbMask = args.verbMask ?? null;
  const verbId = verbMask !== null ? args.verbId : undefined;
  const monthMask = args.monthMask ?? null;
  const monthId = monthMask !== null ? args.monthId : undefined;
  if (
    selectedTime === null &&
    authorMask === null &&
    !args.candidates &&
    (categoryMask === null || !categoryId) &&
    (projectMask === null || !projectId) &&
    (roleMask === null || !roleId) &&
    (verbMask === null || !verbId) &&
    (monthMask === null || !monthId)
  ) {
    return null;
  }

  const keep = (i: number): boolean => {
    if (selectedTime !== null && timeId[i] !== selectedTime) return false;
    if (authorMask !== null && authorMask[authorId[i]] !== 1) return false;
    if (categoryId && categoryMask !== null && categoryMask[categoryId[i]] !== 1) return false;
    if (projectId && projectMask !== null && projectMask[projectId[i]] !== 1) return false;
    if (roleId && roleMask !== null && roleMask[roleId[i]] !== 1) return false;
    if (verbId && verbMask !== null && verbMask[verbId[i]] !== 1) return false;
    if (monthId && monthMask !== null && monthMask[monthId[i]] !== 1) return false;
    return true;
  };

  const candidates = args.candidates;
  const candidateCount = candidates?.length ?? authorId.length;
  let count = 0;
  for (let cursor = 0; cursor < candidateCount; cursor++) {
    const index = candidates?.[cursor] ?? cursor;
    if (keep(index)) count += 1;
  }

  const indices = new Uint32Array(count);
  let cursor = 0;
  for (let candidate = 0; candidate < candidateCount; candidate++) {
    const index = candidates?.[candidate] ?? candidate;
    if (keep(index)) indices[cursor++] = index;
  }
  return indices;
}

/** Pin lasso hits to full-corpus rows before the rendered index map can change. */
export const snapshotRenderedSelection = (
  rendered: readonly number[],
  renderedToFull: Uint32Array,
  allowedFull?: Uint32Array,
): Uint32Array => {
  const full: number[] = [];
  for (const renderedIndex of rendered) {
    const fullIndex = renderedToFull[renderedIndex];
    if (fullIndex === undefined) continue;
    if (allowedFull) {
      let low = 0;
      let high = allowedFull.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (allowedFull[middle] < fullIndex) low = middle + 1;
        else high = middle;
      }
      if (allowedFull[low] !== fullIndex) continue;
    }
    full.push(fullIndex);
  }
  return Uint32Array.from(full);
};

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
