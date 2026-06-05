/**
 * activeGrouping.ts — Pure: which dimension is the dominant grouping force.
 * The dominant slider drives clustering, cluster labels, and (unless overridden)
 * the node color + legend. Ties resolve by `order` so the result is stable.
 */
export function activeGroupingDimension(
  values: Record<string, number>,
  order: readonly string[],
  fallback: string,
): string {
  let best = fallback;
  let bestVal = 0;
  for (const id of order) {
    const v = values[id] ?? 0;
    if (v > bestVal) {
      bestVal = v;
      best = id;
    }
  }
  return bestVal > 0 ? best : fallback;
}
