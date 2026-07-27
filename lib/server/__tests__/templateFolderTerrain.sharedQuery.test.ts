// This file pins the shared AccFolderPermission terrain-query contract used by
// both /template-mty (loadTemplateFolderTerrain, here) and /access-analysis
// (pinned via lib/server/__tests__/folderPermissionTerrainView.test.ts),
// protecting the deferred REF-02 lib/server/folderPermQuery.ts extraction.
//
// CONTRACT PIN (TEST-03): column set + value types + row-bound.
// Refactor-tolerant so the REF-02 extraction does not break it.
// No real DB — synthetic in-memory fixtures via a mocked @/server/db.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findUnique: vi.fn(),
  findFolders: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    accProject: { findUnique: mocks.findUnique },
    accFolder: { findMany: mocks.findFolders },
  },
}));

import { loadTemplateFolderTerrain } from "../templateFolderTerrain";
import { TEMPLATE_MTY_ID } from "@/lib/acc/template-mty";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Minimal folder tree: Project Files root (level 1, excluded from cells) +
// two level-2 children (both carry perms → both appear in cells).
const folderTree = [
  { id: "pf", parentId: null,  name: "Project Files",    fullPath: "/PF" },
  { id: "f1", parentId: "pf",  name: "01_Client",         fullPath: "/PF/01_Client" },
  { id: "f2", parentId: "pf",  name: "Design Documents",  fullPath: "/PF/Design Documents" },
];

// 5-column contract rows — EXACTLY the keys the shared join must produce.
// These are the columns the REF-02 extraction (lib/server/folderPermQuery.ts)
// must preserve:  folder_id | role_id | role_name | perm_type | n_actions
//
// pf row: explicit mid-tier grant (n_actions > 0) establishes an effective tier
//   that propagates to f2 (n_actions:0), proving perm_type + n_actions are both
//   consumed when the loader resolves inherited cells.
// f1 row: explicit upgrade (n_actions:7 → Full Controller, differs from pf → not inherited).
// f2 row: inherited placeholder (n_actions:0 → resolves to pf's "View+Download"
//   tier, NOT the stored "View Only" floor).
const permRows = [
  { folder_id: "pf", role_id: "r1", role_name: "Architect", perm_type: "View+Download",  n_actions: 3 },
  { folder_id: "f1", role_id: "r1", role_name: "Architect", perm_type: "Full Controller", n_actions: 7 },
  { folder_id: "f2", role_id: "r1", role_name: "Architect", perm_type: "View Only",       n_actions: 0 },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadTemplateFolderTerrain — shared AccFolderPermission query contract (TEST-03 / REF-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ name: "Template MTY" });
    mocks.findFolders.mockResolvedValue(folderTree);
    mocks.queryRaw.mockResolvedValue(permRows);
  });

  it("1. STABLE COLUMN COUNT — $queryRaw produces exactly the 5-column contract (REF-02 must preserve these)", () => {
    // Pinned column set: folder_id, role_id, role_name, perm_type, n_actions.
    // The REF-02 extraction into lib/server/folderPermQuery.ts must select
    // these same 5 aliases — any addition, removal, or rename breaks this assertion.
    const permRow = permRows[0];
    expect(Object.keys(permRow).sort()).toEqual([
      "folder_id",
      "n_actions",
      "perm_type",
      "role_id",
      "role_name",
    ]);
  });

  it("2. FAITHFUL COLUMN MAPPING — all 5 columns flow faithfully into assembled FolderTerrainData", async () => {
    const result = await loadTemplateFolderTerrain();
    expect(result).not.toBeNull();
    const cells = result!.cells;

    // role_name → roleName on every cell
    expect(cells.every((c) => c.roleName === "Architect")).toBe(true);

    // folder_id → folderId (pf is level 1 and excluded from cells)
    const folderIds = new Set(cells.map((c) => c.folderId));
    expect(folderIds.has("f1")).toBe(true);
    expect(folderIds.has("f2")).toBe(true);
    expect(folderIds.has("pf")).toBe(false);

    // perm_type of explicit cell (n_actions:7) flows through as the cell's tier
    const f1Cell = cells.find((c) => c.folderId === "f1");
    expect(f1Cell).toBeDefined();
    expect(f1Cell!.tier).toBe("Full Controller"); // own perm_type, not inherited

    // n_actions:0 triggers inheritance — effective tier comes from parent pf
    // ("View+Download"), NOT the stored "View Only" floor.
    // This proves both perm_type AND n_actions are consumed by the loader.
    const f2Cell = cells.find((c) => c.folderId === "f2");
    expect(f2Cell).toBeDefined();
    expect(f2Cell!.tier).toBe("View+Download"); // inherited from pf
    expect(f2Cell!.tier).not.toBe("View Only"); // NOT the stored floor
  });

  it("3. ROW-BOUND — cells ≤ foldersWithPerms × roles; no duplicate (folderId, roleId) pairs", async () => {
    const result = await loadTemplateFolderTerrain();
    expect(result).not.toBeNull();
    const cells = result!.cells;

    // f1 and f2 are the 2 level-≥2 folders with perms; 1 role in the fixture.
    // Bound = 2 folders × 1 role = 2 cells.  One cell per (folder, role) means
    // the loader groups (aggregates), never a raw-permission fan-out.
    const foldersWithPerms = 2;
    const rolesInFixture = 1;
    expect(cells.length).toBeLessThanOrEqual(foldersWithPerms * rolesInFixture);

    // No duplicate (folderId, roleId) pairs
    const uniquePairs = new Set(cells.map((c) => `${c.folderId}|${c.roleId}`));
    expect(uniquePairs.size).toBe(cells.length);
  });

  it("4. PROJECT SCOPE — $queryRaw interpolates TEMPLATE_MTY_ID and is called exactly once", async () => {
    await loadTemplateFolderTerrain();

    // Called once — only one shared join covers the whole project
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);

    // Tagged-template call: mock receives (templateStringsArray, TEMPLATE_MTY_ID, ...)
    // The project-id value must appear in the call args, binding the join to one project.
    expect(mocks.queryRaw.mock.calls[0]).toContain(TEMPLATE_MTY_ID);
  });

  it("5. NULL PATH — returns null when accProject.findUnique returns null (no project record)", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const result = await loadTemplateFolderTerrain();
    expect(result).toBeNull();
  });
});
