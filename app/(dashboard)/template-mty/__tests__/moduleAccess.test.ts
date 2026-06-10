import { describe, it, expect } from "vitest";
import { summarizeModuleAccess } from "../moduleAccess";

describe("summarizeModuleAccess", () => {
  it("returns hasData=false for members without modules", () => {
    const s = summarizeModuleAccess([
      { name: "A", role: "Designer" },
      { name: "B", role: "Architect", modules: [] },
    ]);
    expect(s).toEqual({ slices: [], total: 0, memberCount: 2, hasData: false });
  });

  it("counts distinct members per module with users + roles, sorted desc", () => {
    const s = summarizeModuleAccess([
      { name: "A", role: "Architect", modules: ["dataManagement", "build"] },
      { name: "B", role: "Designer", modules: ["dataManagement"] },
    ]);
    expect(s.hasData).toBe(true);
    expect(s.memberCount).toBe(2);
    expect(s.total).toBe(3);
    expect(s.slices).toEqual([
      { id: "dataManagement", name: "Data Management", userCount: 2, users: ["A", "B"], roles: ["Architect", "Designer"] },
      { id: "build", name: "Build", userCount: 1, users: ["A"], roles: ["Architect"] },
    ]);
  });
});
