// ---------------------------------------------------------------------------
// directoryUtils.ts — pure helpers and shared types for the /users directory
//
// Extracted from UsersDirectoryClient.tsx (USR-01 decomposition, Wave 2).
// No logic changes — this is a pure move.
// ---------------------------------------------------------------------------

// Re-export canonical types from useMergedAccUsers so all consumers have a
// single authoritative source. These were previously re-defined inline in
// UsersDirectoryClient.tsx; the shape is byte-identical.
export type { OrgPerson, LocalDirectoryUser } from "./useMergedAccUsers";
import type { OrgPerson } from "./useMergedAccUsers";

// ---------------------------------------------------------------------------
// Directory-specific type aliases
// ---------------------------------------------------------------------------

export type GroupByField = "none" | "department" | "jobTitle" | "costCenter";
export type ViewMode = "grid" | "list";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b)
  );
}

/** Parse field-scoped tokens like `dept:engineering` from the query */
export function parseSearchTokens(raw: string) {
  const fieldAliases: Record<string, keyof OrgPerson> = {
    dept: "department",
    department: "department",
    depto: "department",
    departamento: "department",
    job: "jobTitle",
    title: "jobTitle",
    puesto: "jobTitle",
    cargo: "jobTitle",
    role: "jobTitle",
    cc: "costCenter",
    cost: "costCenter",
    centro: "costCenter",
    presupuesto: "costCenter",
    phone: "phoneNumber",
    tel: "phoneNumber",
    telefono: "phoneNumber",
    email: "email",
    correo: "email",
    name: "displayName",
    nombre: "displayName",
  };

  const fieldFilters: Partial<Record<keyof OrgPerson, string>> = {};
  const freeTerms: string[] = [];

  // Split by spaces but keep quoted strings together
  const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];

  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx > 0) {
      const prefix = part.slice(0, colonIdx).toLowerCase();
      const value = part.slice(colonIdx + 1).replace(/^"|"$/g, "");
      const field = fieldAliases[prefix];
      if (field && value) {
        fieldFilters[field] = normalize(value);
        continue;
      }
    }
    freeTerms.push(normalize(part));
  }

  return { fieldFilters, freeText: freeTerms.join(" ") };
}

export function matchesPerson(
  person: OrgPerson,
  freeText: string,
  fieldFilters: Partial<Record<keyof OrgPerson, string>>
): boolean {
  // Field-scoped filters must all match
  for (const [field, query] of Object.entries(fieldFilters)) {
    const value = person[field as keyof OrgPerson];
    if (!value || !normalize(String(value)).includes(query!)) return false;
  }

  // Free text matches any field
  if (freeText) {
    const haystack = normalize(
      [
        person.displayName,
        person.email,
        person.department,
        person.jobTitle,
        person.phoneNumber,
        person.costCenter,
      ]
        .filter(Boolean)
        .join(" ")
    );
    return haystack.includes(freeText);
  }

  return true;
}
