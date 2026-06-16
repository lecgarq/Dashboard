/** Two-letter initials from a display name, falling back to the email local-part. */
export function getInitials(name?: string | null, email?: string): string {
  const source = (name && name.trim()) || (email ?? "").replace(/@.*/, "");
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
