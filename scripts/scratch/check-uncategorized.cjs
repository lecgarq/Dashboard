const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv/config");
// Since we don't have JS build compiled, let's write a simple direct check import using tsx or dynamic node.

const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
const adapter = new PrismaPg({ connectionString: url, max: 2 });
const p = new PrismaClient({ adapter, log: ["error"] });

// Let's copy the raw MAP keys and fallback logic to check exactly what the database has.
const MAP_KEYS = new Set([
  "File Viewed", "Document Viewed", "File Downloaded", "view-entity", "view-existing-review", "download-entity", "view-sheet", "view-transmittal", "view-public-link", "print-entity", "export-file",
  "File Uploaded", "Document Version Created", "upload-entity", "create-entity", "create-version-set", "copy-file", "send-entity-to-project", "add-entity-by-automation", "copy-review-docs-to-folder", "publish-sheet",
  "File Edited", "Markup Created", "Comment Added", "edit-office-file", "lock-entity", "unlock-entity", "set-approval-status", "rename-entity", "move-entity", "restore-version", "create-public-link", "delete-public-link", "create-public-link-for-documents", "create-public-link-for-folders", "process-entity",
  "File Deleted", "File Restored", "delete-entity",
  "Member Added", "User Invited", "Project Member Added", "assign-member", "unassign-member", "assign-admin",
  "Project Created", "Project Updated", "assign-permission", "delete-permission", "issue-view", "issue-edit", "issue-create", "issue-comment", "issue-copy", "issue-due-date", "issue-assign", "issue-in-review", "issue-link-added", "issue-link-removed", "issue-attachment-add", "issue-attachment-remove", "issue-placement-reposition", "issue-snapshot-edit", "issue-completed", "issue-closed", "issue-open", "issue-deleted", "issue-not-approved", "issue-placement-add", "issue-placement-remove", "rfi-view", "rfi-create", "rfi-update", "submittals-item-commit-transition", "submittals-item-change-attribute", "submittals-item-change-attribute-final-response", "submittals-item-change-attribute-review-response", "submittals-item-change-attribute-user", "submittals-task-change-attribute", "submittals-item-create", "submittals-item-add-attachment", "submittals-item-remove-attachment", "submittals-step-commit-transition", "submittals-step-change-attribute", "create-transmittal", "export-transmittal", "add-recipients-to-transmittal", "comment-create", "response-create", "response-update", "edit-project", "review-update-duration", "review-back-to-initiator", "create-collection", "notify-reviewers", "add-docs-to-review", "initiate-review-process", "claim-review-task", "review-push-approval-status", "submit-review", "notify-final-members", "notify-observers", "terminate-review", "save-approval-workflow", "update-doc-comment-for-review", "add-doc-comment-for-review"
]);

function fallbackCategory(rawAction) {
  const action = rawAction.toLowerCase();
  if (action.startsWith("issue-") || action.startsWith("rfi-") || action.startsWith("submittals-")) return "projectEvent";
  if (action.includes("permission") || action === "assign-role" || action === "unassign-role") return "projectEvent";
  if (action.includes("member") || action.includes("invite")) return "memberEvent";
  if (action.startsWith("view-") || action.startsWith("download-") || action.startsWith("print-") || action.startsWith("export-")) return "view";
  if (action.startsWith("upload-") || action.startsWith("copy-") || action.startsWith("publish-")) return "upload";
  if (action.startsWith("create-") || action.startsWith("edit-") || action.startsWith("rename-") || action.startsWith("move-") || action.startsWith("process-") || action.includes("approval") || action.includes("link")) return "edit";
  if (action.startsWith("delete-") || action.startsWith("remove-")) return "delete";
  return "other";
}

(async () => {
  const actions = await p.$queryRawUnsafe(
    `SELECT "rawAction", COUNT(*)::int as cnt FROM "AccActivity" GROUP BY "rawAction"`
  );

  console.log("=== SCANNING UNMAPPED OR OTHER ACTIONS ===");
  let exactMapped = 0;
  let fallbackMapped = 0;
  let uncategorized = [];

  for (const row of actions) {
    const raw = row.rawAction;
    if (MAP_KEYS.has(raw)) {
      exactMapped += row.cnt;
    } else {
      const fb = fallbackCategory(raw);
      if (fb === "other") {
        uncategorized.push({ rawAction: raw, count: row.cnt });
      } else {
        fallbackMapped += row.cnt;
      }
    }
  }

  console.log(`\nExact Mapped Rows: ${exactMapped.toLocaleString()}`);
  console.log(`Fallback Mapped Rows: ${fallbackMapped.toLocaleString()}`);
  console.log(`Uncategorized (Category: other) Rows: ${uncategorized.reduce((sum, item) => sum + item.count, 0).toLocaleString()}`);
  
  if (uncategorized.length > 0) {
    console.log("\nDetails of Uncategorized Actions:");
    console.log(JSON.stringify(uncategorized, null, 2));
  } else {
    console.log("\n🎉 Pristine! 100% of activity actions in the database are successfully categorized under exact rules or dynamic fallbacks!");
  }

  await p.$disconnect();
})();
