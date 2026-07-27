/**
 * Shape + mapper for the per-project clash drill-down. The Model-Coordination
 * panel lazy-loads a project's individual coordination issues on expand; this
 * turns a stored AccIssue row (plus its raw ACC payload) into the slim,
 * display-ready record the UI renders. Pure — no IO — so the rawJson extraction
 * is unit testable.
 */
/** Resolved identity of an ACC author (from the opaque createdBy id). */
export interface ClashAuthor {
  name: string | null;
  email: string | null; // keys the shared UserProfilePanel
}

export interface ClashIssue {
  displayId: number | null; // human "#146" issue number
  title: string;
  description: string | null; // the clash explanation: clashing elements + .rvt models
  status: string; // open | closed | in_review | …
  author: string | null; // who created the issue (resolved from the ACC author id)
  authorEmail: string | null; // lets a click open that author's profile
  confidence: string | null; // high | medium | low
  source: string | null; // how it was classified: title | description | clash-endpoint
  validated: boolean; // confirmed against the clash endpoint
  createdAt: string | null; // ISO
  closedAt: string | null; // ISO, from raw payload
  commentCount: number | null;
  attachmentCount: number | null;
}

/** Row shape this mapper consumes (subset of AccIssue columns + rawJson). */
export interface ClashIssueRow {
  displayId: number | null;
  title: string;
  description: string | null;
  status: string | null;
  createdBy: string | null; // opaque ACC author id, resolved to a name by the caller
  confidence: string | null;
  coordinationSource: string | null;
  clashValidated: boolean;
  createdAt: Date | string | null;
  rawJson: unknown;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asIso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v.trim()) return v;
  return null;
}

function asCount(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Per-author tally for the "top authors" summary on an expanded project. */
export interface AuthorTally {
  name: string;
  email: string | null;
  count: number;
}

/** Count clashes per author, most issues first. Authors with no name are skipped. */
export function summarizeAuthors(clashes: ReadonlyArray<ClashIssue>): AuthorTally[] {
  const byKey = new Map<string, AuthorTally>();
  for (const c of clashes) {
    if (!c.author) continue;
    const key = (c.authorEmail ?? c.author).toLowerCase();
    const tally = byKey.get(key);
    if (tally) tally.count += 1;
    else byKey.set(key, { name: c.author, email: c.authorEmail, count: 1 });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function toClashIssue(
  row: ClashIssueRow,
  resolveAuthor?: (authorId: string) => ClashAuthor | null,
): ClashIssue {
  const raw = asRecord(row.rawJson);
  const author = row.createdBy ? resolveAuthor?.(row.createdBy) ?? null : null;
  return {
    displayId: row.displayId ?? null,
    title: row.title,
    description: row.description ?? null,
    status: row.status ?? "unknown",
    author: author?.name ?? null,
    authorEmail: author?.email ?? null,
    confidence: row.confidence ?? null,
    source: row.coordinationSource ?? null,
    validated: row.clashValidated,
    createdAt: asIso(row.createdAt),
    closedAt: asIso(raw.closedAt),
    commentCount: asCount(raw.commentCount),
    attachmentCount: asCount(raw.attachmentCount),
  };
}
