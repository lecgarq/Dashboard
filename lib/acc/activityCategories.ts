/**
 * Raw `action_type` → UI category mapping.
 *
 * Locked by 03-CONTEXT.md: stored as RAW string in DB (`AccActivity.rawAction`),
 * normalized to a category at query time. Mapping fixes do NOT require re-ingest —
 * just redeploy this file.
 *
 * The four file-activity buckets surface as separate timestamps in ACTV-03
 * (`lastView`, `lastUpload`, `lastEdit`, `lastDelete`). The non-file buckets
 * (`memberEvent`, `projectEvent`, `other`) only surface in the ACTV-05 drill-down.
 */

export type ActivityCategory =
  | "view"
  | "upload"
  | "edit"
  | "delete"
  | "memberEvent"
  | "projectEvent"
  | "other";

const MAP: Record<string, ActivityCategory> = {
  // File events — view bucket
  "File Viewed": "view",
  "Document Viewed": "view",
  "File Downloaded": "view",
  // File events — upload bucket
  "File Uploaded": "upload",
  "Document Version Created": "upload",
  // File events — edit bucket
  "File Edited": "edit",
  "Markup Created": "edit",
  "Comment Added": "edit",
  // File events — delete bucket
  "File Deleted": "delete",
  "File Restored": "delete",
  // Member events
  "Member Added": "memberEvent",
  "User Invited": "memberEvent",
  "Project Member Added": "memberEvent",
  // Project events
  "Project Created": "projectEvent",
  "Project Updated": "projectEvent",
};

export function categorize(rawAction: string): ActivityCategory {
  return MAP[rawAction] ?? "other";
}

/** Categories that count toward "file activity" per ACTV-03. */
export const FILE_CATEGORIES: ReadonlySet<ActivityCategory> = new Set([
  "view",
  "upload",
  "edit",
  "delete",
]);

/** Reverse map: category → raw action strings. Used by tRPC procedures to
 *  build SQL `rawAction IN (...)` filters from a categories[] input. */
export const CATEGORY_TO_RAW_ACTIONS: Record<ActivityCategory, readonly string[]> = {
  view: ["File Viewed", "Document Viewed", "File Downloaded"],
  upload: ["File Uploaded", "Document Version Created"],
  edit: ["File Edited", "Markup Created", "Comment Added"],
  delete: ["File Deleted", "File Restored"],
  memberEvent: ["Member Added", "User Invited", "Project Member Added"],
  projectEvent: ["Project Created", "Project Updated"],
  // "other" deliberately empty — it's the unmapped catch-all; build the IN-list
  // by exclusion (`rawAction NOT IN (all known)`) rather than inclusion.
  other: [],
};

/** Raw action strings that constitute an invitation event (ACTV-04). */
export const INVITATION_ACTIONS: readonly string[] = [
  "Member Added",
  "User Invited",
  "Project Member Added",
];

export const INVITATION_ACTIONS_SET: ReadonlySet<string> = new Set(INVITATION_ACTIONS);
