/**
 * Raw `action_type` -> UI category mapping.
 *
 * Stored as the raw string in `AccActivity.rawAction`; normalized only at query
 * time. Mapping fixes therefore do not require re-ingest.
 */

export type ActivityCategory =
  | "view"
  | "upload"
  | "edit"
  | "delete"
  | "memberEvent"
  | "projectEvent"
  | "other";

export type ActivitySubCategory =
  // View sub-categories
  | "download"
  | "print"
  | "export"
  | "view"
  // Upload sub-categories
  | "copy"
  | "automation"
  | "upload"
  // Edit sub-categories
  | "lock"
  | "rename"
  | "move"
  | "approval"
  | "edit"
  // Delete sub-categories
  | "delete"
  // MemberEvent sub-categories
  | "admin"
  | "member"
  // ProjectEvent sub-categories
  | "issue"
  | "submittal"
  | "rfi"
  | "review"
  | "transmittal"
  | "permission"
  | "comment"
  | "project"
  // Other
  | "other";

export type ChangeStreamCategory = "membership" | "permission" | "project" | "admin";

export type ActivityDomain =
  | "docs"
  | "issues"
  | "rfis"
  | "submittals"
  | "sheets"
  | "admin"
  | "assets"
  | "bridge"
  | "unknown";

export type ActivityEntity =
  | "file"
  | "sheet"
  | "issue"
  | "rfi"
  | "submittal"
  | "review"
  | "transmittal"
  | "member"
  | "permission"
  | "project"
  | "comment"
  | "collection"
  | "asset"
  | "bridge"
  | "unknown";

export type ActivityOperation =
  | "view"
  | "download"
  | "print"
  | "export"
  | "upload"
  | "copy"
  | "create"
  | "update"
  | "delete"
  | "assign"
  | "unassign"
  | "approve"
  | "submit"
  | "notify"
  | "lock"
  | "move"
  | "rename"
  | "process"
  | "other";

export type ActivityImpact =
  | "read"
  | "content-change"
  | "workflow-change"
  | "access-change"
  | "delete"
  | "unknown";

export type ActivityClassificationConfidence = "exact" | "prefix" | "service" | "unknown";

export interface ActivityClassification {
  rawAction: string;
  service: ActivityDomain | null;
  category: ActivityCategory;
  subCategory: ActivitySubCategory;
  stream: ChangeStreamCategory | null;
  domain: ActivityDomain;
  entity: ActivityEntity;
  operation: ActivityOperation;
  impact: ActivityImpact;
  confidence: ActivityClassificationConfidence;
  tags: string[];
}

interface ChangeStreamInput {
  rawAction: string;
  details?: unknown;
}

const MAP: Record<string, ActivityCategory> = {
  // File view/read events.
  "File Viewed": "view",
  "Document Viewed": "view",
  "File Downloaded": "view",
  "view-entity": "view",
  "view-existing-review": "view",
  "download-entity": "view",
  "view-sheet": "view",
  "view-transmittal": "view",
  "view-public-link": "view",
  "print-entity": "view",
  "export-file": "view",

  // File create/copy/version events.
  "File Uploaded": "upload",
  "Document Version Created": "upload",
  "upload-entity": "upload",
  "create-entity": "upload",
  "create-version-set": "upload",
  "copy-file": "upload",
  "send-entity-to-project": "upload",
  "add-entity-by-automation": "upload",
  "copy-review-docs-to-folder": "upload",
  "publish-sheet": "upload",

  // File mutation events.
  "File Edited": "edit",
  "Markup Created": "edit",
  "Comment Added": "edit",
  "edit-office-file": "edit",
  "lock-entity": "edit",
  "unlock-entity": "edit",
  "set-approval-status": "edit",
  "rename-entity": "edit",
  "move-entity": "edit",
  "restore-version": "edit",
  "create-public-link": "edit",
  "delete-public-link": "edit",
  "create-public-link-for-documents": "edit",
  "create-public-link-for-folders": "edit",
  "process-entity": "edit",

  // File delete events.
  "File Deleted": "delete",
  "File Restored": "delete",
  "delete-entity": "delete",

  // Member/access events.
  "Member Added": "memberEvent",
  "User Invited": "memberEvent",
  "Project Member Added": "memberEvent",
  "assign-member": "memberEvent",
  "unassign-member": "memberEvent",
  "assign-admin": "memberEvent",

  // Project/workflow/permission events. These are non-file events in the UI.
  "Project Created": "projectEvent",
  "Project Updated": "projectEvent",
  "assign-permission": "projectEvent",
  "delete-permission": "projectEvent",
  "issue-view": "projectEvent",
  "issue-edit": "projectEvent",
  "issue-create": "projectEvent",
  "issue-comment": "projectEvent",
  "issue-copy": "projectEvent",
  "issue-due-date": "projectEvent",
  "issue-assign": "projectEvent",
  "issue-in-review": "projectEvent",
  "issue-link-added": "projectEvent",
  "issue-link-removed": "projectEvent",
  "issue-attachment-add": "projectEvent",
  "issue-attachment-remove": "projectEvent",
  "issue-placement-reposition": "projectEvent",
  "issue-snapshot-edit": "projectEvent",
  "issue-completed": "projectEvent",
  "issue-closed": "projectEvent",
  "issue-open": "projectEvent",
  "issue-deleted": "projectEvent",
  "issue-not-approved": "projectEvent",
  "issue-placement-add": "projectEvent",
  "issue-placement-remove": "projectEvent",
  "rfi-view": "projectEvent",
  "rfi-create": "projectEvent",
  "rfi-update": "projectEvent",
  "submittals-item-commit-transition": "projectEvent",
  "submittals-item-change-attribute": "projectEvent",
  "submittals-item-change-attribute-final-response": "projectEvent",
  "submittals-item-change-attribute-review-response": "projectEvent",
  "submittals-item-change-attribute-user": "projectEvent",
  "submittals-task-change-attribute": "projectEvent",
  "submittals-item-create": "projectEvent",
  "submittals-item-add-attachment": "projectEvent",
  "submittals-item-remove-attachment": "projectEvent",
  "submittals-step-commit-transition": "projectEvent",
  "submittals-step-change-attribute": "projectEvent",
  "create-transmittal": "projectEvent",
  "export-transmittal": "projectEvent",
  "add-recipients-to-transmittal": "projectEvent",
  "comment-create": "projectEvent",
  "response-create": "projectEvent",
  "response-update": "projectEvent",
  "edit-project": "projectEvent",
  "review-update-duration": "projectEvent",
  "review-back-to-initiator": "projectEvent",
  "create-collection": "projectEvent",
  "notify-reviewers": "projectEvent",
  "add-docs-to-review": "projectEvent",
  "initiate-review-process": "projectEvent",
  "claim-review-task": "projectEvent",
  "review-push-approval-status": "projectEvent",
  "submit-review": "projectEvent",
  "notify-final-members": "projectEvent",
  "notify-observers": "projectEvent",
  "terminate-review": "projectEvent",
  "save-approval-workflow": "projectEvent",
  "update-doc-comment-for-review": "projectEvent",
  "add-doc-comment-for-review": "projectEvent",

  // Assets
  "asset-create": "upload",
  "asset-update": "edit",
  "asset-delete": "delete",
  
  // Sheets
  "export-sheet": "view",
  "print-sheet": "view",
  "delete-sheet": "delete",
  "renumber-sheet": "edit",
  "change-discipline-order": "edit",
  
  // Reviews
  "review-export-files": "view",
  "delegate-review-task": "projectEvent",
  "review-update-candidates": "projectEvent",
  "archive-review": "projectEvent",
  "review-rename": "projectEvent",
  "review-save-as-draft": "projectEvent",
  "review-skip-step": "projectEvent",
  "review-submit-as-workflow": "projectEvent",
  
  // Bridge
  "create-bridge": "upload",
  "delete-bridge": "delete",
  "delete-bridge-automation": "delete",
  
  // Autocad / Entity Automations
  "view-in-autocad-web": "view",
  "delete-entity-by-automation": "delete",
  "receive-entity-from-project": "upload",
  "restore-entity": "edit",
  "shared-with-recipients-for-documents": "edit",
  "shared-with-recipients-for-folders": "edit",
  "remove-member": "memberEvent",
  "remove-admin": "memberEvent",
  "enable-collection": "edit",
  "review-create-transmittal": "projectEvent",
  "shared-with-recipients-for-sheets": "edit",
  "update-version-set": "edit",
};

const DOCS_FILE_ACTIONS = new Set([
  "view-entity",
  "download-entity",
  "upload-entity",
  "create-entity",
  "delete-entity",
  "rename-entity",
  "move-entity",
  "copy-file",
  "lock-entity",
  "unlock-entity",
  "edit-office-file",
  "process-entity",
  "set-approval-status",
  "restore-version",
  "export-file",
  "print-entity",
  "send-entity-to-project",
  "add-entity-by-automation",
  "copy-review-docs-to-folder",
  "create-version-set",
  "view-existing-review",
  "view-transmittal",
  "view-public-link",
  "create-public-link",
  "delete-public-link",
  "create-public-link-for-documents",
  "create-public-link-for-folders",
]);

const ADMIN_ACTIONS = new Set([
  "assign-member",
  "unassign-member",
  "assign-admin",
  "assign-permission",
  "delete-permission",
  "edit-project",
  "Member Added",
  "User Invited",
  "Project Member Added",
]);

function normalizeService(service?: string | null): ActivityDomain | null {
  if (!service) return null;
  const normalized = service.toLowerCase();
  if (
    normalized === "docs" ||
    normalized === "issues" ||
    normalized === "rfis" ||
    normalized === "submittals" ||
    normalized === "sheets" ||
    normalized === "admin" ||
    normalized === "assets" ||
    normalized === "bridge"
  ) {
    return normalized;
  }
  return null;
}

export function inferActivityService(rawAction: string): ActivityDomain | null {
  const action = rawAction.toLowerCase();
  if (action.startsWith("issue-")) return "issues";
  if (action.startsWith("rfi-")) return "rfis";
  if (action.startsWith("submittals-")) return "submittals";
  if (action.startsWith("asset-")) return "assets";
  if (action.includes("bridge")) return "bridge";
  if (action === "view-sheet" || action === "publish-sheet" || action.includes("sheet") || action === "change-discipline-order") return "sheets";
  if (ADMIN_ACTIONS.has(rawAction) || action.includes("permission") || action.includes("-member") || action.includes("-admin") || action === "remove-member" || action === "remove-admin") return "admin";
  if (
    DOCS_FILE_ACTIONS.has(rawAction) ||
    action.includes("review") ||
    action.includes("transmittal") ||
    action.includes("comment") ||
    action.startsWith("response-") ||
    action.includes("collection") ||
    action.includes("-entity") ||
    action.includes("shared-with-recipients") ||
    action.includes("approval") ||
    action.includes("workflow") ||
    action.startsWith("notify-") ||
    action.includes("autocad") ||
    action.includes("version-set") ||
    action.includes("public-link")
  ) {
    return "docs";
  }
  return null;
}

function fallbackCategory(rawAction: string, service?: string | null): ActivityCategory {
  const action = rawAction.toLowerCase();
  const normalizedService = normalizeService(service);

  if (action.startsWith("issue-") || action.startsWith("rfi-") || action.startsWith("submittals-")) {
    return "projectEvent";
  }
  if (action.includes("permission") || action === "assign-role" || action === "unassign-role") {
    return "projectEvent";
  }
  if (action.includes("member") || action.includes("invite")) {
    return "memberEvent";
  }
  if (action.startsWith("view-") || action.startsWith("download-") || action.startsWith("print-") || action.startsWith("export-")) {
    return "view";
  }
  if (action.startsWith("upload-") || action.startsWith("copy-") || action.startsWith("publish-")) {
    return "upload";
  }
  if (
    action.startsWith("create-") ||
    action.startsWith("edit-") ||
    action.startsWith("rename-") ||
    action.startsWith("move-") ||
    action.startsWith("process-") ||
    action.includes("approval") ||
    action.includes("link")
  ) {
    return "edit";
  }
  if (action.startsWith("delete-") || action.startsWith("remove-")) {
    return "delete";
  }
  if (normalizedService && normalizedService !== "unknown") {
    return normalizedService === "admin" ? "projectEvent" : "projectEvent";
  }
  return "other";
}

export function categorize(rawAction: string): ActivityCategory {
  return MAP[rawAction] ?? fallbackCategory(rawAction);
}

export function subCategorize(rawAction: string): ActivitySubCategory {
  const cat = categorize(rawAction);
  if (cat === "other") return "other";

  const action = rawAction.toLowerCase();

  if (cat === "view") {
    if (action.includes("download")) return "download";
    if (action.includes("print")) return "print";
    if (action.includes("export")) return "export";
    return "view";
  }

  if (cat === "upload") {
    if (action.includes("copy") || action.includes("send-entity-to-project")) return "copy";
    if (action.includes("automation")) return "automation";
    return "upload";
  }

  if (cat === "edit") {
    if (action.includes("lock") || action.includes("unlock")) return "lock";
    if (action.includes("rename")) return "rename";
    if (action.includes("move")) return "move";
    if (action.includes("approval-status") || action.includes("approval-workflow")) return "approval";
    return "edit";
  }

  if (cat === "delete") {
    return "delete";
  }

  if (cat === "memberEvent") {
    if (action.includes("admin")) return "admin";
    return "member";
  }

  if (cat === "projectEvent") {
    if (action.startsWith("issue-") || action.includes("issue")) return "issue";
    if (action.startsWith("rfi-")) return "rfi";
    if (action.startsWith("submittals-")) return "submittal";
    if (action.includes("review")) return "review";
    if (action.includes("transmittal")) return "transmittal";
    if (action.includes("permission")) return "permission";
    if (action.includes("comment") || action.includes("response-")) return "comment";
    return "project";
  }

  return "other";
}

function classificationConfidence(rawAction: string, service?: string | null): ActivityClassificationConfidence {
  if (MAP[rawAction]) return "exact";
  const withoutService = fallbackCategory(rawAction);
  if (withoutService !== "other") return "prefix";
  if (normalizeService(service)) return "service";
  return "unknown";
}

function entityFor(rawAction: string, service: ActivityDomain | null, subCategory: ActivitySubCategory): ActivityEntity {
  const action = rawAction.toLowerCase();
  if (subCategory === "issue") return "issue";
  if (subCategory === "rfi") return "rfi";
  if (subCategory === "submittal") return "submittal";
  if (subCategory === "review") return "review";
  if (subCategory === "transmittal") return "transmittal";
  if (subCategory === "permission") return "permission";
  if (subCategory === "comment") return "comment";
  if (subCategory === "member" || subCategory === "admin") return "member";
  if (action.includes("collection")) return "collection";
  if (service === "sheets" || action.includes("sheet")) return "sheet";
  if (service === "issues") return "issue";
  if (service === "rfis") return "rfi";
  if (service === "submittals") return "submittal";
  if (service === "assets" || action.includes("asset")) return "asset";
  if (service === "bridge" || action.includes("bridge")) return "bridge";
  if (service === "admin") return action.includes("permission") ? "permission" : "member";
  if (service === "docs") return action.includes("review") ? "review" : "file";
  return "unknown";
}

function operationFor(rawAction: string, category: ActivityCategory): ActivityOperation {
  const action = rawAction.toLowerCase();
  if (action.includes("download")) return "download";
  if (action.includes("print")) return "print";
  if (action.includes("export")) return "export";
  if (action.includes("copy") || action.includes("send-entity")) return "copy";
  if (action.includes("upload") || action.includes("publish")) return "upload";
  if (action.includes("unassign")) return "unassign";
  if (action.includes("assign") || action.includes("recipient")) return "assign";
  if (action.includes("approve") || action.includes("approval")) return "approve";
  if (action.includes("submit")) return "submit";
  if (action.includes("notify")) return "notify";
  if (action.includes("lock") || action.includes("unlock")) return "lock";
  if (action.includes("rename")) return "rename";
  if (action.includes("move") || action.includes("placement")) return "move";
  if (action.includes("process")) return "process";
  if (action.includes("delete") || action.includes("remove")) return "delete";
  if (action.includes("create") || action.includes("add")) return "create";
  if (action.includes("view")) return "view";
  if (category === "view") return "view";
  if (category === "upload") return "upload";
  if (category === "delete") return "delete";
  if (category === "edit" || category === "projectEvent") return "update";
  return "other";
}

function impactFor(category: ActivityCategory, stream: ChangeStreamCategory | null): ActivityImpact {
  if (stream || category === "memberEvent") return "access-change";
  if (category === "view") return "read";
  if (category === "upload" || category === "edit") return "content-change";
  if (category === "delete") return "delete";
  if (category === "projectEvent") return "workflow-change";
  return "unknown";
}

export function classifyActivity(rawAction: string, service?: string | null): ActivityClassification {
  const confidence = classificationConfidence(rawAction, service);
  const normalizedService = normalizeService(service);
  const inferredService = inferActivityService(rawAction);
  const domain = normalizedService ?? inferredService ?? "unknown";
  const category = MAP[rawAction] ?? fallbackCategory(rawAction, service);
  const rawSubCategory = subCategorize(rawAction);
  const action = rawAction.toLowerCase();
  const subCategory = rawSubCategory !== "other"
    ? rawSubCategory
    : action.includes("review")
      ? "review"
      : action.includes("transmittal")
        ? "transmittal"
        : action.includes("comment") || action.includes("response")
          ? "comment"
          : domain === "issues"
            ? "issue"
            : domain === "rfis"
              ? "rfi"
              : domain === "submittals"
                ? "submittal"
                : domain === "admin"
                  ? "permission"
                  : domain === "unknown"
                    ? "other"
                    : "project";
  const stream = classifyChangeStream({ rawAction });
  const operation = operationFor(rawAction, category);
  const entity = entityFor(rawAction, domain === "unknown" ? null : domain, subCategory);
  const impact = impactFor(category, stream);

  const tags = confidence === "unknown"
    ? ["unknown"]
    : Array.from(new Set([
      domain,
      category,
      subCategory,
      entity,
      operation,
      impact,
      ...(stream ? [stream] : []),
    ].filter((tag) => tag && tag !== "unknown")));

  return {
    rawAction,
    service: normalizedService ?? inferredService,
    category,
    subCategory,
    stream,
    domain,
    entity,
    operation,
    impact,
    confidence,
    tags,
  };
}

function detailsRecord(details: unknown): Record<string, unknown> {
  if (!details) return {};
  if (typeof details === "object" && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }
  if (typeof details !== "string") return {};
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function classifyChangeStream(row: ChangeStreamInput): ChangeStreamCategory | null {
  const raw = row.rawAction || "";
  const action = raw.toLowerCase();
  const details = detailsRecord(row.details);
  const newRoleRaw = String(details.newRole ?? details.new_role ?? "");

  if (action === "assign-admin") return "admin";
  if (action.includes("role") && /admin/i.test(newRoleRaw)) return "admin";

  if (
    action.startsWith("role.") ||
    action.startsWith("permission.") ||
    action.includes("permission") ||
    action === "assign-role" ||
    action === "unassign-role"
  ) {
    return "permission";
  }

  if (
    action.startsWith("project.member") ||
    action === "assign-member" ||
    action === "unassign-member" ||
    action === "project member added"
  ) {
    return "project";
  }

  if (
    action.startsWith("user.") ||
    action === "member added" ||
    action === "user invited" ||
    action === "user removed" ||
    action === "member removed"
  ) {
    return "membership";
  }

  return null;
}

/** Categories that count toward "file activity" per ACTV-03. */
export const FILE_CATEGORIES: ReadonlySet<ActivityCategory> = new Set([
  "view",
  "upload",
  "edit",
  "delete",
]);

const CATEGORY_ORDER: readonly Exclude<ActivityCategory, "other">[] = [
  "view",
  "upload",
  "edit",
  "delete",
  "memberEvent",
  "projectEvent",
];

function buildReverseMap(): Record<ActivityCategory, readonly string[]> {
  const out: Record<ActivityCategory, string[]> = {
    view: [],
    upload: [],
    edit: [],
    delete: [],
    memberEvent: [],
    projectEvent: [],
    other: [],
  };

  for (const category of CATEGORY_ORDER) {
    for (const [rawAction, mappedCategory] of Object.entries(MAP)) {
      if (mappedCategory === category) out[category].push(rawAction);
    }
  }

  return out;
}

/** Reverse map: category -> raw action strings. */
export const CATEGORY_TO_RAW_ACTIONS: Record<ActivityCategory, readonly string[]> = buildReverseMap();

/** Raw action strings that constitute an invitation event (ACTV-04). */
export const INVITATION_ACTIONS: readonly string[] = [
  "Member Added",
  "User Invited",
  "Project Member Added",
];

export const INVITATION_ACTIONS_SET: ReadonlySet<string> = new Set(INVITATION_ACTIONS);
