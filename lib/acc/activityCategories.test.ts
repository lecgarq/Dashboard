import { describe, expect, it } from "vitest";
import {
  CATEGORY_TO_RAW_ACTIONS,
  categorize,
  classifyActivity,
  classifyChangeStream,
  inferActivityService,
  INVITATION_ACTIONS,
  subCategorize,
  type ActivityCategory,
} from "./activityCategories";

describe("activityCategories", () => {
  it("classifies high-volume Docs activity verbs from Data Connector", () => {
    expect(categorize("view-sheet")).toBe("view");
    expect(categorize("create-entity")).toBe("upload");
    expect(categorize("copy-file")).toBe("upload");
    expect(categorize("set-approval-status")).toBe("edit");
    expect(categorize("rename-entity")).toBe("edit");
    expect(categorize("move-entity")).toBe("edit");
  });

  it("classifies workflow module activity as project events instead of other", () => {
    expect(categorize("issue-view")).toBe("projectEvent");
    expect(categorize("issue-edit")).toBe("projectEvent");
    expect(categorize("issue-comment")).toBe("projectEvent");
    expect(categorize("issue-copy")).toBe("projectEvent");
    expect(categorize("issue-not-approved")).toBe("projectEvent");
    expect(categorize("issue-placement-add")).toBe("projectEvent");
    expect(categorize("issue-placement-remove")).toBe("projectEvent");
    expect(categorize("rfi-view")).toBe("projectEvent");
    expect(categorize("submittals-item-commit-transition")).toBe("projectEvent");
    expect(categorize("submittals-item-change-attribute-final-response")).toBe("projectEvent");
    expect(categorize("submittals-item-change-attribute-review-response")).toBe("projectEvent");
    expect(categorize("submittals-task-change-attribute")).toBe("projectEvent");
    expect(categorize("submittals-item-create")).toBe("projectEvent");
    expect(categorize("submittals-item-add-attachment")).toBe("projectEvent");
    expect(categorize("submittals-item-remove-attachment")).toBe("projectEvent");
    expect(categorize("create-transmittal")).toBe("projectEvent");
    expect(categorize("add-recipients-to-transmittal")).toBe("projectEvent");
    expect(categorize("comment-create")).toBe("projectEvent");
    expect(categorize("response-create")).toBe("projectEvent");
    expect(categorize("response-update")).toBe("projectEvent");
    expect(categorize("edit-project")).toBe("projectEvent");
    expect(categorize("review-update-duration")).toBe("projectEvent");
    expect(categorize("review-back-to-initiator")).toBe("projectEvent");
    expect(categorize("create-collection")).toBe("projectEvent");
  });

  it("classifies remaining observed file export and publish verbs", () => {
    expect(categorize("print-entity")).toBe("view");
    expect(categorize("export-file")).toBe("view");
    expect(categorize("process-entity")).toBe("edit");
    expect(categorize("create-public-link-for-documents")).toBe("edit");
    expect(categorize("create-public-link-for-folders")).toBe("edit");
    expect(categorize("publish-sheet")).toBe("upload");
  });

  it("classifies current ACC access change verbs for timeline streams", () => {
    expect(classifyChangeStream({ rawAction: "User Invited" })).toBe("membership");
    expect(classifyChangeStream({ rawAction: "assign-permission" })).toBe("permission");
    expect(classifyChangeStream({ rawAction: "delete-permission" })).toBe("permission");
    expect(classifyChangeStream({ rawAction: "assign-member" })).toBe("project");
    expect(classifyChangeStream({ rawAction: "assign-admin" })).toBe("admin");
    expect(classifyChangeStream({ rawAction: "role.change", details: { newRole: "projectAdmin" } })).toBe("admin");
  });

  it("classifies future workflow verbs by prefix instead of leaving them unknown", () => {
    expect(classifyActivity("issue-reopened-by-review")).toMatchObject({
      category: "projectEvent",
      subCategory: "issue",
      domain: "issues",
      entity: "issue",
      confidence: "prefix",
    });
    expect(classifyActivity("submittals-package-archive")).toMatchObject({
      category: "projectEvent",
      subCategory: "submittal",
      domain: "submittals",
      entity: "submittal",
      confidence: "prefix",
    });
    expect(classifyActivity("rfi-forward-to-reviewer")).toMatchObject({
      category: "projectEvent",
      subCategory: "rfi",
      domain: "rfis",
      entity: "rfi",
      confidence: "prefix",
    });
  });

  it("uses the extracted service as a fallback when raw action is new", () => {
    expect(classifyActivity("new-review-workflow-event", "docs")).toMatchObject({
      category: "projectEvent",
      subCategory: "review",
      domain: "docs",
      entity: "review",
      confidence: "service",
    });
    expect(classifyActivity("unrecognized-sheet-bulk-op", "sheets")).toMatchObject({
      category: "projectEvent",
      domain: "sheets",
      confidence: "service",
    });
  });

  it("keeps truly unknown actions explicit and auditable", () => {
    expect(classifyActivity("totally-new-aps-event")).toMatchObject({
      category: "other",
      subCategory: "other",
      domain: "unknown",
      entity: "unknown",
      operation: "other",
      confidence: "unknown",
      tags: ["unknown"],
    });
  });

  it("infers service/module labels from raw action patterns", () => {
    expect(inferActivityService("issue-edit")).toBe("issues");
    expect(inferActivityService("submittals-item-create")).toBe("submittals");
    expect(inferActivityService("rfi-view")).toBe("rfis");
    expect(inferActivityService("view-sheet")).toBe("sheets");
    expect(inferActivityService("assign-permission")).toBe("admin");
    expect(inferActivityService("view-entity")).toBe("docs");
    expect(inferActivityService("totally-new-aps-event")).toBeNull();
  });

  it("keeps category reverse lookups aligned with categorize()", () => {
    const categories: ActivityCategory[] = [
      "view",
      "upload",
      "edit",
      "delete",
      "memberEvent",
      "projectEvent",
    ];

    for (const category of categories) {
      for (const rawAction of CATEGORY_TO_RAW_ACTIONS[category]) {
        expect(categorize(rawAction)).toBe(category);
      }
    }
    expect(CATEGORY_TO_RAW_ACTIONS.other).toEqual([]);
  });

  it("keeps invitation actions in the member-event category", () => {
    for (const rawAction of INVITATION_ACTIONS) {
      expect(categorize(rawAction)).toBe("memberEvent");
    }
  });

  describe("subCategorize", () => {
    it("classifies file view subcategories correctly", () => {
      expect(subCategorize("File Downloaded")).toBe("download");
      expect(subCategorize("download-entity")).toBe("download");
      expect(subCategorize("print-entity")).toBe("print");
      expect(subCategorize("export-file")).toBe("export");
      expect(subCategorize("view-sheet")).toBe("view");
      expect(subCategorize("view-entity")).toBe("view");
    });

    it("classifies file upload subcategories correctly", () => {
      expect(subCategorize("copy-file")).toBe("copy");
      expect(subCategorize("send-entity-to-project")).toBe("copy");
      expect(subCategorize("add-entity-by-automation")).toBe("automation");
      expect(subCategorize("upload-entity")).toBe("upload");
    });

    it("classifies file edit subcategories correctly", () => {
      expect(subCategorize("lock-entity")).toBe("lock");
      expect(subCategorize("unlock-entity")).toBe("lock");
      expect(subCategorize("rename-entity")).toBe("rename");
      expect(subCategorize("move-entity")).toBe("move");
      expect(subCategorize("set-approval-status")).toBe("approval");
      expect(subCategorize("edit-office-file")).toBe("edit");
    });

    it("classifies memberEvents subcategories correctly", () => {
      expect(subCategorize("assign-admin")).toBe("admin");
      expect(subCategorize("assign-member")).toBe("member");
    });

    it("classifies projectEvents subcategories correctly", () => {
      expect(subCategorize("issue-create")).toBe("issue");
      expect(subCategorize("issue-edit")).toBe("issue");
      expect(subCategorize("rfi-create")).toBe("rfi");
      expect(subCategorize("submittals-item-create")).toBe("submittal");
      expect(subCategorize("notify-reviewers")).toBe("review");
      expect(subCategorize("create-transmittal")).toBe("transmittal");
      expect(subCategorize("assign-permission")).toBe("permission");
      expect(subCategorize("comment-create")).toBe("comment");
      expect(subCategorize("Project Created")).toBe("project");
    });

    it("returns other for unknown actions", () => {
      expect(subCategorize("some-invalid-action-123")).toBe("other");
    });
  });
});
