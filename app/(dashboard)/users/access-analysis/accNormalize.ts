/**
 * Canonical id normalizer — maps any human/excel label or DB rawAction to a stable
 * kebab id. Pure, no deps. Used to match excel labels against AccActivity.rawAction.
 */
export function normalizeActionId(s: string): string {
  return s
    .toLowerCase()
    .replace(/\+/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
