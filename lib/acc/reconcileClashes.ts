// lib/acc/reconcileClashes.ts
/**
 * Pure reconciliation of stored issues against the authoritative set of
 * clash-generated issueIds (from clash/v3 .../clashes/assigned). Drives Pass 2's
 * DB updates and telemetry. No I/O.
 */
export interface StoredIssueLite {
  id: string;
  isCoordination: boolean;
}

export interface ReconcileResult {
  validatedIds: string[]; // stored issues confirmed as clash-generated → clashValidated=true
  falseNegIds: string[];  // validated but heuristic had NOT flagged → set isCoordination, source=clash-endpoint
  falsePosIds: string[];  // heuristic flagged but NOT in clash set (on this MC project) → audit
  missingIds: string[];   // clash issueIds with no stored row (deleted/unfetched) → log
}

export function reconcileClashes(
  stored: ReadonlyArray<StoredIssueLite>,
  clashIssueIds: ReadonlySet<string>,
): ReconcileResult {
  const storedIds = new Set(stored.map((s) => s.id));
  const validatedIds: string[] = [];
  const falseNegIds: string[] = [];
  const falsePosIds: string[] = [];
  const missingIds: string[] = [];

  for (const s of stored) {
    if (clashIssueIds.has(s.id)) {
      validatedIds.push(s.id);
      if (!s.isCoordination) falseNegIds.push(s.id);
    } else if (s.isCoordination) {
      falsePosIds.push(s.id);
    }
  }
  for (const cid of clashIssueIds) {
    if (!storedIds.has(cid)) missingIds.push(cid);
  }
  return { validatedIds, falseNegIds, falsePosIds, missingIds };
}
