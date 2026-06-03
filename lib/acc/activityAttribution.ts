export type AutodeskEmailRow = {
  autodeskId: string | null | undefined;
  email: string | null | undefined;
};

export type AttributionEmailMap = {
  emailsById: Map<string, string>;
  ambiguousIds: Set<string>;
};

function normalizeAutodeskId(value: string | null | undefined): string | null {
  const id = value?.trim();
  return id ? id : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

export function buildUniqueAutodeskEmailMap(rows: AutodeskEmailRow[]): AttributionEmailMap {
  const candidates = new Map<string, Set<string>>();

  for (const row of rows) {
    const autodeskId = normalizeAutodeskId(row.autodeskId);
    const email = normalizeEmail(row.email);
    if (!autodeskId || !email) continue;

    const existing = candidates.get(autodeskId);
    if (existing) {
      existing.add(email);
    } else {
      candidates.set(autodeskId, new Set([email]));
    }
  }

  const emailsById = new Map<string, string>();
  const ambiguousIds = new Set<string>();
  for (const [autodeskId, emails] of candidates) {
    if (emails.size === 1) {
      emailsById.set(autodeskId, [...emails][0]);
    } else {
      ambiguousIds.add(autodeskId);
    }
  }

  return { emailsById, ambiguousIds };
}

export function mergeAttributionMaps(sources: AttributionEmailMap[]): AttributionEmailMap {
  const candidates = new Map<string, Set<string>>();
  const ambiguousIds = new Set<string>();

  for (const source of sources) {
    for (const id of source.ambiguousIds) ambiguousIds.add(id);
    for (const [id, email] of source.emailsById) {
      const existing = candidates.get(id);
      if (existing) {
        existing.add(email);
      } else {
        candidates.set(id, new Set([email]));
      }
    }
  }

  const emailsById = new Map<string, string>();
  for (const [id, emails] of candidates) {
    if (ambiguousIds.has(id) || emails.size > 1) {
      ambiguousIds.add(id);
      continue;
    }
    emailsById.set(id, [...emails][0]);
  }

  return { emailsById, ambiguousIds };
}
