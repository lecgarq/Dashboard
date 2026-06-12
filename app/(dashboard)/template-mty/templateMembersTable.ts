import type { TemplateMember } from "@/lib/server/templateView";

export type MemberSortKey = "name" | "role" | "company" | "accessLevel" | "origin";
export type SortDir = "asc" | "desc";
export type MemberFilter = "all" | "internal" | "external" | "admin";

/** Search across name/email/role/company + an internal/external/admin chip. */
export function filterMembers(
  members: TemplateMember[],
  query: string,
  filter: MemberFilter,
): TemplateMember[] {
  const q = query.trim().toLowerCase();
  return members.filter((m) => {
    if (filter === "internal" && !m.isInternal) return false;
    if (filter === "external" && m.isInternal) return false;
    if (filter === "admin" && !m.isAdmin) return false;
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.role.toLowerCase().includes(q) ||
      m.company.toLowerCase().includes(q)
    );
  });
}

function sortValue(m: TemplateMember, key: MemberSortKey): string {
  switch (key) {
    case "name": return m.name;
    case "role": return m.role;
    case "company": return m.company;
    case "accessLevel": return m.accessLevel;
    case "origin": return m.isInternal ? "Internal" : "External";
  }
}

/** Locale-aware, non-mutating sort. */
export function sortMembers(
  members: TemplateMember[],
  key: MemberSortKey,
  dir: SortDir,
): TemplateMember[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...members].sort(
    (a, b) =>
      sign * sortValue(a, key).localeCompare(sortValue(b, key), undefined, { sensitivity: "base" }),
  );
}
