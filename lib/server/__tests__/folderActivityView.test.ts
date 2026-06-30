import { describe, it, expect } from "vitest";
import { resolveProjectName, buildProjectNameMap } from "@/lib/server/folderActivityView";

// ---------------------------------------------------------------------------
// resolveProjectName — pure name resolver that must NEVER return a raw GUID
// ---------------------------------------------------------------------------

describe("resolveProjectName", () => {
  it("returns the mapped name when the projectId is present in the map", () => {
    const nameById = new Map([["proj-abc", "Hermosillo Tower"]]);
    expect(resolveProjectName(nameById, "proj-abc")).toBe("Hermosillo Tower");
  });

  it("returns 'Unknown project' when the id is absent from the map — never the raw id", () => {
    const nameById = new Map<string, string>();
    const rawGuid = "b1a2c3d4-e5f6-7890-abcd-ef1234567890";
    const result = resolveProjectName(nameById, rawGuid);
    expect(result).toBe("Unknown project");
    // Explicit negative: the raw GUID must not be returned
    expect(result).not.toBe(rawGuid);
  });

  it("returns 'Unknown project' for a blank projectId — never an empty string", () => {
    const nameById = new Map<string, string>();
    const result = resolveProjectName(nameById, "");
    expect(result).toBe("Unknown project");
    expect(result).not.toBe("");
  });

  it("resolves an id present only in the AccProject source (superset) — proves the merged map closed the DC-only gap", () => {
    // DC-only source misses "proj-only-in-acc"; AccProject (superset) has it.
    // After merging both sources the id must still resolve, not fall back to GUID.
    const accProjectSource = [{ id: "proj-only-in-acc", name: "Forma Proposal HMO" }];
    const accDcProjectSource = [{ id: "proj-dc", name: "Shared DC Project" }];
    const nameById = buildProjectNameMap(accProjectSource, accDcProjectSource);

    expect(resolveProjectName(nameById, "proj-only-in-acc")).toBe("Forma Proposal HMO");
    expect(resolveProjectName(nameById, "proj-dc")).toBe("Shared DC Project");
  });

  it("prefers the AccProject name over AccDcProject when the same id appears in both sources", () => {
    // AccProject is the authoritative live superset; its name wins on conflict.
    const accProjectSource = [{ id: "shared-id", name: "Live ACC Name" }];
    const accDcProjectSource = [{ id: "shared-id", name: "DC Stale Name" }];
    const nameById = buildProjectNameMap(accProjectSource, accDcProjectSource);
    expect(resolveProjectName(nameById, "shared-id")).toBe("Live ACC Name");
  });
});

// ---------------------------------------------------------------------------
// buildProjectNameMap — merge helper: AccProject (superset) + AccDcProject
// ---------------------------------------------------------------------------

describe("buildProjectNameMap", () => {
  it("builds a map containing ids from both sources", () => {
    const nameById = buildProjectNameMap(
      [{ id: "a", name: "Alpha" }],
      [{ id: "b", name: "Beta" }],
    );
    expect(nameById.get("a")).toBe("Alpha");
    expect(nameById.get("b")).toBe("Beta");
    expect(nameById.size).toBe(2);
  });

  it("returns an empty map when both sources are empty", () => {
    const nameById = buildProjectNameMap([], []);
    expect(nameById.size).toBe(0);
  });
});
