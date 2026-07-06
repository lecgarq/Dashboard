import { describe, it, expect } from "vitest";
import { summarizeProvisionedModules } from "../provisionedModulesCounts";
import { MODULES } from "../modules";
import type { ProvisionedModuleRow } from "@/lib/server/provisionedModulesView";

const mk = (projectId: string, moduleId: string, count: number): ProvisionedModuleRow => ({
  projectId,
  projectName: `Project ${projectId}`,
  moduleId,
  count,
});

describe("summarizeProvisionedModules", () => {
  it("returns an empty summary for no rows -- all 10 canonical modules land in zeroModules", () => {
    const s = summarizeProvisionedModules([]);
    expect(s.bars).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.zeroModules).toHaveLength(10);
    expect(s.projectsByModule.size).toBe(0);
  });

  it("aggregates grant counts per module across projects, sorted desc (tiebreak name)", () => {
    const s = summarizeProvisionedModules([
      mk("p1", "dataManagement", 100),
      mk("p2", "dataManagement", 50), // merges into one dataManagement bar
      mk("p1", "build", 40),
      mk("p1", "datum", 3),
    ]);
    expect(s.total).toBe(193);
    expect(s.bars.map((b) => [b.id, b.value])).toEqual([
      ["dataManagement", 150],
      ["build", 40],
      ["datum", 3],
    ]);
    expect(s.bars[0].name).toBe("Data Management");
  });

  it("sorts equal-value bars by name as a tiebreak", () => {
    const s = summarizeProvisionedModules([mk("p1", "build", 10), mk("p1", "datum", 10)]);
    expect(s.bars.map((b) => b.id)).toEqual(["build", "datum"]); // "Build" < "Datum"
  });

  it("bars and zeroModules together cover exactly the 10 canonical modules", () => {
    const s = summarizeProvisionedModules([mk("p1", "build", 5), mk("p1", "modelCoordination", 2)]);
    const barIds = s.bars.map((b) => b.id);
    const zeroIds = s.zeroModules.map((m) => m.id);
    const combined = new Set([...barIds, ...zeroIds]);
    expect(combined.size).toBe(MODULES.length);
    for (const m of MODULES) expect(combined.has(m.id)).toBe(true);
    // modelCoordination legitimately included here (unlike the activity donut).
    expect(barIds).toContain("modelCoordination");
  });

  it("zeroModules preserves canonical MODULES order", () => {
    const s = summarizeProvisionedModules([mk("p1", "build", 5)]);
    const expectedOrder = MODULES.filter((m) => m.id !== "build").map((m) => m.id);
    expect(s.zeroModules.map((m) => m.id)).toEqual(expectedOrder);
  });

  it("drill map: sorted count desc then project name, defensive duplicate merge", () => {
    const s = summarizeProvisionedModules([
      mk("p2", "build", 5),
      mk("p1", "build", 20),
      mk("p1", "build", 3), // duplicate (module, project) row -- merges into p1's total (23)
      mk("p3", "build", 20), // ties with p1's 23? no -- distinct check below
    ]);
    const drill = s.projectsByModule.get("build")!;
    expect(drill.find((r) => r.projectId === "p1")!.count).toBe(23);
    // sorted count desc: p1 (23) before p2 (5) and p3 (20)
    expect(drill.map((r) => r.projectId)).toEqual(["p1", "p3", "p2"]);
  });

  it("does not create a drill entry for a module with zero total", () => {
    const s = summarizeProvisionedModules([]);
    expect(s.projectsByModule.has("build")).toBe(false);
  });
});
