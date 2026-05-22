/**
 * dimensionSearch.ts — Pure "find a dimension" filtering for the sidebar (no I/O).
 *
 * Filters dimension ROWS (not nodes). A row matches if the query is a case-insensitive
 * substring of its id, label, or family. Empty query = match all. Independent of the
 * Toolbar's node-filter chips; never touches physics or masks.
 */

import { getDimension, type DimensionId } from "./dimensionRegistry";

export function matchDimension(id: DimensionId, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const d = getDimension(id);
  if (!d) return false;
  return (
    d.id.toLowerCase().includes(q) ||
    d.label.toLowerCase().includes(q) ||
    d.family.toLowerCase().includes(q)
  );
}

export function filterDimensionIds(
  ids: readonly DimensionId[],
  query: string,
): DimensionId[] {
  if (query.trim() === "") return [...ids];
  return ids.filter((id) => matchDimension(id, query));
}
