import { describe, it, expect } from "vitest";
import { adminProjects, roleCounts, moduleCounts, moduleLabel } from "./statCardDetails";
import type { ProjectData } from "./AccProfileSection";

function p(over: Partial<ProjectData>): ProjectData {
  return { id: "x", name: "P", status: "active", isAdmin: false, roles: [], modules: [], ...over };
}

describe("statCardDetails", () => {
  it("adminProjects keeps only admins, active-first then by name", () => {
    const out = adminProjects([
      p({ id: "1", name: "Zeta", isAdmin: true, status: "active" }),
      p({ id: "2", name: "Alpha", isAdmin: false }),
      p({ id: "3", name: "Beta", isAdmin: true, status: "inactive" }),
      p({ id: "4", name: "Acme", isAdmin: true, status: "active" }),
    ]);
    expect(out.map((x) => x.name)).toEqual(["Acme", "Zeta", "Beta"]);
  });

  it("roleCounts counts projects per role, desc then name", () => {
    const out = roleCounts([
      p({ id: "1", roles: ["Admin", "BIM"] }),
      p({ id: "2", roles: ["Admin"] }),
      p({ id: "3", roles: ["BIM"] }),
    ]);
    expect(out).toEqual([
      { name: "Admin", value: 2 },
      { name: "BIM", value: 2 },
    ]);
  });

  it("roleCounts dedupes a role repeated within one project", () => {
    expect(roleCounts([p({ roles: ["Admin", "Admin"] })])).toEqual([{ name: "Admin", value: 1 }]);
  });

  it("moduleCounts maps module keys to friendly labels", () => {
    const out = moduleCounts([
      p({ id: "1", modules: ["documentManagement"] }),
      p({ id: "2", modules: ["documentManagement", "build"] }),
    ]);
    expect(out).toEqual([
      { name: "Forma Data Management", value: 2 },
      { name: "Build", value: 1 },
    ]);
  });

  it("moduleLabel falls back to the key for unknown modules", () => {
    expect(moduleLabel("somethingNew")).toBe("somethingNew");
  });

  it("empty input → empty arrays", () => {
    expect(adminProjects([])).toEqual([]);
    expect(roleCounts([])).toEqual([]);
    expect(moduleCounts([])).toEqual([]);
  });
});
