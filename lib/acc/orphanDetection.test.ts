/**
 * orphanDetection.test.ts
 *
 * Vitest coverage for the 4 OrphanReason codes plus combined-reason behavior.
 * Pure-module tests — no Prisma, no I/O.
 */

import { describe, it, expect } from "vitest";
import { detectOrphans, type OrphanInput } from "./orphanDetection";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyInput(): OrphanInput {
  return { folders: [], permissions: [], projectRoles: [], projectMembers: [] };
}

// ---------------------------------------------------------------------------
// 1. role_zero_members
// ---------------------------------------------------------------------------

describe("detectOrphans — role_zero_members", () => {
  it("flags (folder, role) when role has 0 members in the project", () => {
    const input: OrphanInput = {
      folders: [{ id: "f1", projectId: "p1", parentId: null, fullPath: "/Project Files" }],
      permissions: [{ folderId: "f1", roleId: "r-empty", permType: "View Only", actions: ["VIEW"] }],
      projectRoles: [{ projectId: "p1", roleId: "r-empty", memberCount: 0 }],
      projectMembers: [{ projectId: "p1", memberCount: 5 }],
    };
    const result = detectOrphans(input);
    expect(result.get("f1::r-empty")).toContain("role_zero_members");
  });

  it("does NOT flag when role has ≥1 member", () => {
    const input: OrphanInput = {
      folders: [{ id: "f1", projectId: "p1", parentId: null, fullPath: "/Project Files" }],
      permissions: [{ folderId: "f1", roleId: "r-good", permType: "View Only", actions: ["VIEW"] }],
      projectRoles: [{ projectId: "p1", roleId: "r-good", memberCount: 3 }],
      projectMembers: [{ projectId: "p1", memberCount: 5 }],
    };
    const result = detectOrphans(input);
    expect(result.get("f1::r-good") ?? []).not.toContain("role_zero_members");
  });

  it("treats missing projectRoles entry as zero-members (flag)", () => {
    const input: OrphanInput = {
      folders: [{ id: "f1", projectId: "p1", parentId: null, fullPath: "/Project Files" }],
      permissions: [{ folderId: "f1", roleId: "r-missing", permType: "View Only", actions: ["VIEW"] }],
      projectRoles: [],
      projectMembers: [{ projectId: "p1", memberCount: 5 }],
    };
    const result = detectOrphans(input);
    expect(result.get("f1::r-missing")).toContain("role_zero_members");
  });
});

// ---------------------------------------------------------------------------
// 2. permission_missing_folder
// ---------------------------------------------------------------------------

describe("detectOrphans — permission_missing_folder", () => {
  it("flags a permission whose folderId is not in folders[]", () => {
    const input: OrphanInput = {
      folders: [{ id: "f1", projectId: "p1", parentId: null, fullPath: "/Project Files" }],
      permissions: [{ folderId: "f-ghost", roleId: "r1", permType: "View Only", actions: ["VIEW"] }],
      projectRoles: [{ projectId: "p1", roleId: "r1", memberCount: 2 }],
      projectMembers: [{ projectId: "p1", memberCount: 5 }],
    };
    const result = detectOrphans(input);
    expect(result.get("f-ghost::r1")).toContain("permission_missing_folder");
  });

  it("does NOT flag when folder exists", () => {
    const input: OrphanInput = {
      folders: [{ id: "f1", projectId: "p1", parentId: null, fullPath: "/Project Files" }],
      permissions: [{ folderId: "f1", roleId: "r1", permType: "View Only", actions: ["VIEW"] }],
      projectRoles: [{ projectId: "p1", roleId: "r1", memberCount: 2 }],
      projectMembers: [{ projectId: "p1", memberCount: 5 }],
    };
    const result = detectOrphans(input);
    expect(result.get("f1::r1") ?? []).not.toContain("permission_missing_folder");
  });
});

// ---------------------------------------------------------------------------
// 3. root_only_zero_members
// ---------------------------------------------------------------------------

describe("detectOrphans — root_only_zero_members", () => {
  it("flags root-folder permission when project has 0 members", () => {
    const input: OrphanInput = {
      folders: [{ id: "f-root", projectId: "p-empty", parentId: null, fullPath: "/Project Files" }],
      permissions: [{ folderId: "f-root", roleId: "r1", permType: "View Only", actions: ["VIEW"] }],
      projectRoles: [{ projectId: "p-empty", roleId: "r1", memberCount: 1 }],
      projectMembers: [{ projectId: "p-empty", memberCount: 0 }],
    };
    const result = detectOrphans(input);
    expect(result.get("f-root::r1")).toContain("root_only_zero_members");
  });

  it("does NOT flag non-root folder even when project has 0 members", () => {
    const input: OrphanInput = {
      folders: [
        { id: "f-root", projectId: "p-empty", parentId: null, fullPath: "/Project Files" },
        { id: "f-child", projectId: "p-empty", parentId: "f-root", fullPath: "/Project Files/Sub" },
      ],
      permissions: [{ folderId: "f-child", roleId: "r1", permType: "View Only", actions: ["VIEW"] }],
      projectRoles: [{ projectId: "p-empty", roleId: "r1", memberCount: 1 }],
      projectMembers: [{ projectId: "p-empty", memberCount: 0 }],
    };
    const result = detectOrphans(input);
    expect(result.get("f-child::r1") ?? []).not.toContain("root_only_zero_members");
  });

  it("does NOT flag when project has members", () => {
    const input: OrphanInput = {
      folders: [{ id: "f-root", projectId: "p1", parentId: null, fullPath: "/Project Files" }],
      permissions: [{ folderId: "f-root", roleId: "r1", permType: "View Only", actions: ["VIEW"] }],
      projectRoles: [{ projectId: "p1", roleId: "r1", memberCount: 1 }],
      projectMembers: [{ projectId: "p1", memberCount: 5 }],
    };
    const result = detectOrphans(input);
    expect(result.get("f-root::r1") ?? []).not.toContain("root_only_zero_members");
  });
});

// ---------------------------------------------------------------------------
// 4. folder_no_permissions
// ---------------------------------------------------------------------------

describe("detectOrphans — folder_no_permissions", () => {
  it("flags a folder with no permission entries (empty roleId key)", () => {
    const input: OrphanInput = {
      folders: [{ id: "f-naked", projectId: "p1", parentId: null, fullPath: "/Project Files" }],
      permissions: [],
      projectRoles: [],
      projectMembers: [{ projectId: "p1", memberCount: 5 }],
    };
    const result = detectOrphans(input);
    expect(result.get("f-naked::")).toEqual(["folder_no_permissions"]);
  });

  it("does NOT flag a folder that has at least one permission", () => {
    const input: OrphanInput = {
      folders: [{ id: "f1", projectId: "p1", parentId: null, fullPath: "/Project Files" }],
      permissions: [{ folderId: "f1", roleId: "r1", permType: "View Only", actions: ["VIEW"] }],
      projectRoles: [{ projectId: "p1", roleId: "r1", memberCount: 2 }],
      projectMembers: [{ projectId: "p1", memberCount: 5 }],
    };
    const result = detectOrphans(input);
    expect(result.get("f1::")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Combined reasons on same key
// ---------------------------------------------------------------------------

describe("detectOrphans — combined reasons", () => {
  it("attaches multiple reasons to the same (folder, role) key", () => {
    // Permission references a missing folder AND role has zero members
    const input: OrphanInput = {
      folders: [{ id: "f1", projectId: "p1", parentId: null, fullPath: "/Project Files" }],
      permissions: [
        { folderId: "f-ghost", roleId: "r-empty", permType: "View Only", actions: ["VIEW"] },
      ],
      projectRoles: [{ projectId: "p1", roleId: "r-empty", memberCount: 0 }],
      projectMembers: [{ projectId: "p1", memberCount: 0 }],
    };
    const result = detectOrphans(input);
    const reasons = result.get("f-ghost::r-empty") ?? [];
    expect(reasons).toContain("role_zero_members");
    expect(reasons).toContain("permission_missing_folder");
  });

  it("returns an empty map when no orphans exist", () => {
    const input: OrphanInput = {
      folders: [{ id: "f1", projectId: "p1", parentId: null, fullPath: "/Project Files" }],
      permissions: [{ folderId: "f1", roleId: "r1", permType: "View Only", actions: ["VIEW"] }],
      projectRoles: [{ projectId: "p1", roleId: "r1", memberCount: 3 }],
      projectMembers: [{ projectId: "p1", memberCount: 5 }],
    };
    const result = detectOrphans(input);
    expect(result.size).toBe(0);
  });

  it("handles empty input without throwing", () => {
    const result = detectOrphans(emptyInput());
    expect(result.size).toBe(0);
  });
});
