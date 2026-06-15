import { describe, it, expect } from "vitest";
import { isSystemRootName, selectRealFolders } from "./folderFilter";
import type { FormaFolder } from "./inheritance";

describe("isSystemRootName", () => {
  it("flags bare GUIDs, embedded uuids, numeric codes, and known system roots", () => {
    expect(isSystemRootName("3e153a90-d6dd-47b0-afc4-cf79648b66f1")).toBe(true);
    expect(isSystemRootName("COST Root Folder def5fdea-8035-4b56-be60-66b36ba45149")).toBe(true);
    expect(isSystemRootName("issue_def5fdea-8035-4b56-be60-66b36ba45149")).toBe(true);
    expect(isSystemRootName("000")).toBe(true);
    expect(isSystemRootName("0")).toBe(true);
    expect(isSystemRootName("submittals-attachments")).toBe(true);
    expect(isSystemRootName("ProjectTb")).toBe(true);
  });

  it("keeps real document folder names", () => {
    expect(isSystemRootName("Project Files")).toBe(false);
    expect(isSystemRootName("Photos")).toBe(false);
    expect(isSystemRootName("00_Client Documents")).toBe(false);
    expect(isSystemRootName("01_Diseño Preconstrucción")).toBe(false);
  });
});

describe("selectRealFolders", () => {
  const FOLDERS: FormaFolder[] = [
    { id: "pf", parentId: null, name: "Project Files", fullPath: "/Project Files" },
    { id: "c1", parentId: "pf", name: "00_Client Documents", fullPath: "/Project Files/00_Client Documents" },
    { id: "c2", parentId: "c1", name: "RFIs", fullPath: "/Project Files/00_Client Documents/RFIs" },
    { id: "photos", parentId: null, name: "Photos", fullPath: "/Photos" },
    { id: "g", parentId: null, name: "3e153a90-d6dd-47b0-afc4-cf79648b66f1", fullPath: "/3e153a90" },
    { id: "g0", parentId: "g", name: "000", fullPath: "/3e153a90/000" },
    { id: "iss", parentId: null, name: "issue_def5fdea-8035-4b56-be60-66b36ba45149", fullPath: "/issue" },
    { id: "tb", parentId: null, name: "ProjectTb", fullPath: "/ProjectTb" },
  ];

  it("keeps the real document tree and drops every system subtree", () => {
    const kept = selectRealFolders(FOLDERS).map((f) => f.id).sort();
    expect(kept).toEqual(["c1", "c2", "pf", "photos"]);
  });

  it("returns the same set when there is no system noise", () => {
    const clean = FOLDERS.filter((f) => ["pf", "c1", "c2"].includes(f.id));
    expect(selectRealFolders(clean)).toHaveLength(3);
  });
});
