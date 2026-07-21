/**
 * activityEventLabels.ts — v2.7 Phase 39 (ACT-04).
 *
 * Pure resident-data resolver: one payload row index + the decoded columns +
 * the meta dicts (+ the projectNames map) → display labels for the hover
 * tooltip. Zero fetches on hover — everything here is already in memory.
 * Unknown buckets stay honest: authorId 0 = "Unknown author", role/company 0 =
 * "Unknown", module "(none)" relabelled via the verb only in Phase 40+ (this
 * phase shows the honest serviceGroup value).
 */

import type { ColumnArray } from "@/lib/acc/columnarPayload";

export interface ActivityHoverLabels {
  verb: string;
  module: string;
  /** Display project name, falling back to the GUID when unmapped. */
  project: string;
  /** GUID from the dict — the eventDetail consistency-guard input. */
  projectGuid: string;
  /** "MMM YYYY" from monthId + monthFloor. */
  month: string;
  author: string;
  isUnknownAuthor: boolean;
  role: string;
  company: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** monthId (months since floor "YYYY-MM") → "MMM YYYY". */
export function monthLabel(monthFloor: string, monthId: number): string {
  const [y, m] = monthFloor.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthFloor;
  const total = (y * 12 + (m - 1)) + monthId;
  return `${MONTHS[total % 12]} ${Math.floor(total / 12)}`;
}

const dictAt = (dict: unknown, i: number): string =>
  Array.isArray(dict) && i >= 0 && i < dict.length ? String(dict[i]) : `#${i}`;

export function resolveActivityHoverLabels(args: {
  index: number;
  columns: Record<string, ColumnArray>;
  dicts: Record<string, unknown>;
  projectNames: Record<string, string> | undefined;
}): ActivityHoverLabels {
  const { index, columns, dicts, projectNames } = args;
  const verbId = (columns.verbId as Uint16Array)[index];
  const moduleId = (columns.moduleId as Uint16Array)[index];
  const monthId = (columns.monthId as Uint16Array)[index];
  const roleId = (columns.roleId as Uint16Array)[index];
  const companyId = (columns.companyId as Uint16Array)[index];
  const projectIdx = (columns.projectId as Uint32Array)[index];
  const authorId = (columns.authorId as Uint32Array)[index];

  const projectGuid = dictAt(dicts.project, projectIdx);
  return {
    verb: dictAt(dicts.verb, verbId),
    module: dictAt(dicts.module, moduleId),
    project: projectNames?.[projectGuid] ?? projectGuid,
    projectGuid,
    month: monthLabel(String(dicts.monthFloor ?? ""), monthId),
    author: dictAt(dicts.author, authorId),
    isUnknownAuthor: authorId === 0,
    role: dictAt(dicts.role, roleId),
    company: dictAt(dicts.company, companyId),
  };
}
