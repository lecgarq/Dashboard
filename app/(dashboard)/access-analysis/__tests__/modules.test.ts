import { describe, it, expect } from "vitest";
import { MODULES, reduceModules, moduleLabelById } from "../modules";

describe("MODULES", () => {
  it("declares the 9 business modules in adoption order", () => {
    expect(MODULES.map((m) => m.id)).toEqual([
      "dataManagement", "insight", "build", "modelCoordination",
      "designCollaboration", "preconstruction", "design", "autospecs", "datum",
    ]);
  });
});

describe("reduceModules", () => {
  it("maps product keys to modules and flags admin", () => {
    const r = reduceModules([
      { productKey: "docs", accessLevel: "project_user" },
      { productKey: "build", accessLevel: "project_admin" },
      { productKey: "datum", accessLevel: "project_user" },
    ]);
    expect(r.modules.sort()).toEqual(["build", "datum", "dataManagement"].sort());
    expect(r.adminModules).toEqual(["build"]);
  });

  it("treats takeoff OR cost as Preconstruction", () => {
    expect(reduceModules([{ productKey: "cost", accessLevel: "project_user" }]).modules)
      .toEqual(["preconstruction"]);
  });

  it("ignores unknown keys and de-dupes", () => {
    const r = reduceModules([
      { productKey: "takeoff", accessLevel: "project_admin" },
      { productKey: "cost", accessLevel: "project_user" },
      { productKey: "mysteryKey", accessLevel: "project_admin" },
    ]);
    expect(r.modules).toEqual(["preconstruction"]);
    expect(r.adminModules).toEqual(["preconstruction"]); // admin on takeoff
  });
});

describe("moduleLabelById", () => {
  it("returns business labels", () => {
    expect(moduleLabelById("dataManagement")).toBe("Data Management");
    expect(moduleLabelById("design")).toBe("Design");
  });
});
