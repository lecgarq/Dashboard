// Characterization pins protecting the deferred REF-01 split of FolderPermissionTerrain.tsx
// and the REF-02 extraction of the shared AccFolderPermission join into folderPermQuery.ts.
// These tests golden-master the assembled FolderTerrainData output of each loader boundary
// on fixed in-memory fixtures — no real DB, no live-data claims (TEST-02).
// Placement: lib/server/__tests__/ co-located with the subject (TESTING.md Pattern 2).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    accProject: { findUnique: mocks.findUnique },
  },
}));

import {
  loadFolderPermissionTerrain,
  loadFolderPermissionOverview,
  loadTerrainProjects,
} from "../folderPermissionTerrainView";

describe("folderPermissionTerrainView — characterization pins (TEST-02)", () => {
  beforeEach(() => vi.clearAllMocks());

  // ---------------------------------------------------------------------------
  // loadFolderPermissionTerrain
  // ---------------------------------------------------------------------------

  describe("loadFolderPermissionTerrain", () => {
    it("golden-masters the assembled FolderTerrainData for a two-folder project", async () => {
      // Mock dispatch order mirrors the Promise.all in loadFolderPermissionTerrain:
      //   1. db.accProject.findUnique   → project
      //   2. $queryRaw #1              → folders
      //   3. $queryRaw #2              → perms (folder × role)
      //   4. $queryRaw #3              → parentPerms (Project Files own grants)
      //   5. $queryRaw #4              → dcRoleUsers
      //   6. $queryRaw #5              → liveRoleUsers
      mocks.findUnique.mockResolvedValue({ id: "p1", name: "Project One" });
      mocks.queryRaw
        .mockResolvedValueOnce([
          { id: "f1", name: "01_Client" },
          { id: "f2", name: "Design Documents" },
        ])
        .mockResolvedValueOnce([
          { folder_id: "f1", role_id: "r1", role_name: "Architect", perm_type: "Full Controller", n_actions: 7 },
          { folder_id: "f2", role_id: "r1", role_name: "Architect", perm_type: "View Only", n_actions: 0 },
        ])
        .mockResolvedValueOnce([{ role_id: "r1", perm_type: "Full Controller", n_actions: 7 }])
        .mockResolvedValueOnce([{ role_id: "r1", name: "Ann", email: "ann@x.com" }])
        .mockResolvedValueOnce([
          { role_id: "r1", name: "Ann", email: "ann@x.com" },
          { role_id: "r1", name: "Bob", email: "bob@x.com" },
        ]);

      const result = await loadFolderPermissionTerrain("p1", true);
      expect(result).not.toBeNull();
      const { generatedAt, ...rest } = result!;

      // generatedAt is a live timestamp — assert type only
      expect(typeof generatedAt).toBe("string");
      // Exactly 5 $queryRaw calls — lock the call count
      expect(mocks.queryRaw).toHaveBeenCalledTimes(5);

      // Golden-master: full assembled FolderTerrainData (generatedAt excluded).
      // Invariants verified before pinning:
      //   - folders: numbered-before-unnumbered order (compareFolderNames)
      //   - roles: staffing-descending then name; r1 has 2 users after dedup
      //   - cell f2/r1 (n_actions:0 → inherited): adopts parent "Full Controller", rank 6
      //   - cell f1/r1 (n_actions:7 → explicit): "Full Controller", rank 6
      //   - usersByRole.r1: Ann's duplicate from liveRoleUsers collapsed by email; Bob added; name-sorted
      //   - maxUserCount: 2 (single role with 2 users)
      //   - office: "OTHER" (officeCodeFor runs for real; "Project One" has no MTY/city token)
      expect(rest).toEqual({
        projectId: "p1",
        projectName: "Project One",
        office: "OTHER",
        folders: [
          { id: "f1", name: "01_Client" },
          { id: "f2", name: "Design Documents" },
        ],
        roles: [{ id: "r1", name: "Architect" }],
        cells: [
          {
            folderId: "f1",
            folderName: "01_Client",
            roleId: "r1",
            roleName: "Architect",
            tier: "Full Controller",
            rank: 6,
            userCount: 2,
          },
          {
            folderId: "f2",
            folderName: "Design Documents",
            roleId: "r1",
            roleName: "Architect",
            tier: "Full Controller",
            rank: 6,
            userCount: 2,
          },
        ],
        usersByRole: {
          r1: [
            { name: "Ann", email: "ann@x.com" },
            { name: "Bob", email: "bob@x.com" },
          ],
        },
        maxUserCount: 2,
      });
    });

    it("returns null when the project has no L2 folders", async () => {
      // Promise.all starts all 6 concurrently; all must be mocked even though
      // folders=[] causes an early return before the cache write.
      mocks.findUnique.mockResolvedValueOnce({ id: "p1", name: "Project One" });
      mocks.queryRaw
        .mockResolvedValueOnce([]) // folders → empty → short-circuit to null
        .mockResolvedValueOnce([]) // perms (consumed but irrelevant)
        .mockResolvedValueOnce([]) // parentPerms
        .mockResolvedValueOnce([]) // dcRoleUsers
        .mockResolvedValueOnce([]); // liveRoleUsers

      const result = await loadFolderPermissionTerrain("p1", true);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // loadFolderPermissionOverview
  // ---------------------------------------------------------------------------

  describe("loadFolderPermissionOverview", () => {
    it("golden-masters the assembled overview FolderTerrainData", async () => {
      // Mock dispatch order mirrors the two Promise.all phases in loadFolderPermissionOverview:
      //   1. $queryRaw #1 → folderRank (top-N folders by project count)
      //   2. $queryRaw #2 → roleRank   (top-N roles by project count)
      //   3. $queryRaw #3 → agg        (runs because both lists are non-empty)
      mocks.queryRaw
        .mockResolvedValueOnce([
          { folder_name: "Design Documents", projects: 10 },
          { folder_name: "01_Client", projects: 8 },
        ])
        .mockResolvedValueOnce([
          { role_id: "r1", role_name: "Architect", projects: 12 },
          { role_id: "r2", role_name: "Owner", projects: 5 },
        ])
        .mockResolvedValueOnce([
          { folder_name: "Design Documents", role_id: "r1", tier: "Full Controller", projects: 7 },
          { folder_name: "Design Documents", role_id: "r1", tier: "View Only", projects: 3 },
          { folder_name: "01_Client", role_id: "r2", tier: "View Only", projects: 5 },
        ]);

      const result = await loadFolderPermissionOverview(true);
      const { generatedAt, ...rest } = result;

      expect(typeof generatedAt).toBe("string");
      expect(mocks.queryRaw).toHaveBeenCalledTimes(3);

      // Golden-master: full assembled overview FolderTerrainData (generatedAt excluded).
      // Invariants verified before pinning:
      //   - projectId "__overview__", projectName "All projects", office "", usersByRole {}, heightMetric "projects"
      //   - folders: numbered-first sort (compareFolderNames) → 01_Client before Design Documents
      //   - roles: preserve roleRank input order (Architect first, Owner second)
      //   - cells: byCell Map preserves insertion order (agg-accumulation) → DD/r1 first, 01_Client/r2 second
      //   - DD/r1:  modal tier "Full Controller" (7 projects > 3 View Only), rank 6, userCount 10, tierBreakdown {6:7,1:3}
      //   - 01_Client/r2: tier "View Only", rank 1, userCount 5, tierBreakdown {1:5}
      //   - maxUserCount 10
      expect(rest).toEqual({
        projectId: "__overview__",
        projectName: "All projects",
        office: "",
        folders: [
          { id: "01_Client", name: "01_Client" },
          { id: "Design Documents", name: "Design Documents" },
        ],
        roles: [
          { id: "r1", name: "Architect" },
          { id: "r2", name: "Owner" },
        ],
        cells: [
          {
            folderId: "Design Documents",
            folderName: "Design Documents",
            roleId: "r1",
            roleName: "Architect",
            tier: "Full Controller",
            rank: 6,
            userCount: 10,
            tierBreakdown: { 6: 7, 1: 3 },
          },
          {
            folderId: "01_Client",
            folderName: "01_Client",
            roleId: "r2",
            roleName: "Owner",
            tier: "View Only",
            rank: 1,
            userCount: 5,
            tierBreakdown: { 1: 5 },
          },
        ],
        usersByRole: {},
        maxUserCount: 10,
        heightMetric: "projects",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // loadTerrainProjects — lighter key-invariant pin (third boundary)
  // ---------------------------------------------------------------------------

  describe("loadTerrainProjects", () => {
    it("proves userRoleCount = max(dc, live) staffing signal", async () => {
      // Mock dispatch order: rows → dcUsers → liveUsers (single Promise.all)
      mocks.queryRaw
        .mockResolvedValueOnce([{ id: "p1", name: "Project One", folder_count: 5, perm_count: 20 }])
        .mockResolvedValueOnce([{ project_id: "p1", users: 3 }])
        .mockResolvedValueOnce([{ project_id: "p1", users: 7 }]);

      const result = await loadTerrainProjects(true);
      expect(result).toHaveLength(1);
      const [proj] = result;
      expect(proj.folderCount).toBe(5);
      expect(proj.permCount).toBe(20);
      // Core invariant: live user count (7) wins over DC count (3) via Math.max
      expect(proj.userRoleCount).toBe(7);
      expect(typeof proj.office).toBe("string");
    });
  });
});
