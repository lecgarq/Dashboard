/**
 * Token-overlap (Jaccard) name similarity for role-name comparisons.
 *
 * Plan 04-03 / DASH-04 building block. Used by `dashboardAnalytics.findDuplicateRoles`.
 *
 * Pitfall 5 (single-token false positives): Jaccard on 1-token names degenerates to
 * "are the strings equal?" — identical → 1.0, distinct → 0.0. The 0.80 threshold
 * therefore correctly rejects pairs like "Architect" vs "Admin" and "Architect" vs
 * "Architecto" (typos), while accepting reorderings like "BIM Coordinator" vs
 * "Coordinator BIM".
 */

/**
 * Lowercase, strip punctuation, split on whitespace and dashes.
 *
 * Examples:
 *   tokenize("BIM Coordinator")    → Set { "bim", "coordinator" }
 *   tokenize("BIM-Coordinator")    → Set { "bim", "coordinator" }
 *   tokenize("Architect, Senior!") → Set { "architect", "senior" }
 *   tokenize("")                   → Set { }
 */
export function tokenize(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .split(/[\s-]+/)
      .filter(Boolean),
  );
}

/**
 * Jaccard token overlap: |A ∩ B| / |A ∪ B|.
 *
 * Returns:
 *   - 1.0 when the two token sets are identical (including reorderings)
 *   - 0.0 when disjoint (including single-token-different cases — Pitfall 5)
 *   - 1.0 when both inputs are empty (degenerate, treated as identical)
 *   - 0.0 when one input is empty and the other is not
 *   - intersection / union otherwise
 */
export function nameTokenOverlap(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1.0;
  if (ta.size === 0 || tb.size === 0) return 0.0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = new Set([...ta, ...tb]).size;
  return intersection / union;
}

/**
 * Two roles are flagged as duplicate-name candidates only when token overlap meets
 * or exceeds this threshold AND module sets are identical (see findDuplicateRoles).
 */
export const DUPLICATE_ROLE_NAME_THRESHOLD = 0.8;
