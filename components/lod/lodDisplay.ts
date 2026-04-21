const PLACEHOLDER_NAMES = new Set([
  "generic family",
  "unknown",
  "untitled",
  "n/a",
]);

function normalizeName(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_NAMES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

export function getFamilyDisplayName(
  familyName?: string | null,
  fallback?: string | null
): string {
  return normalizeName(familyName) ?? normalizeName(fallback) ?? "Unknown";
}
