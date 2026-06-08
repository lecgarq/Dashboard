import { describe, it, expect } from "vitest";
import { groupByDimensions, defaultGroupBy } from "./groupByDimensions";
import type { CatalogDimension } from "./dimensionCatalog.types";

function dim(id: string, kind: CatalogDimension["kind"], available = true): CatalogDimension {
  return {
    id, label: id[0].toUpperCase() + id.slice(1), family: "structure", kind,
    source: "test", confidence: "high", available, surfaces: ["slider", "color"],
    extract: () => null,
  } as unknown as CatalogDimension;
}

describe("groupByDimensions", () => {
  it("keeps categorical/binary + permission/tenure, drops numeric activity dims and unavailable", () => {
    const catalog = [
      dim("role", "categorical"),
      dim("company", "categorical"),
      dim("permission", "ordinal"),       // kept (bucketed)
      dim("tenure", "ordinal"),           // kept (bucketed)
      dim("docViews", "ordinal"),         // dropped (numeric activity)
      dim("internalExternal", "binary"),  // kept
      dim("ghost", "categorical", false), // dropped (unavailable)
    ];
    const ids = groupByDimensions(catalog).map((d) => d.id);
    expect(ids).toContain("role");
    expect(ids).toContain("company");
    expect(ids).toContain("permission");
    expect(ids).toContain("tenure");
    expect(ids).toContain("internalExternal");
    expect(ids).not.toContain("docViews");
    expect(ids).not.toContain("ghost");
  });

  it("orders curated dims first (company, role, project, ...)", () => {
    const catalog = [dim("role", "categorical"), dim("project", "categorical"), dim("company", "categorical")];
    expect(groupByDimensions(catalog).map((d) => d.id)).toEqual(["company", "role", "project"]);
  });

  it("defaultGroupBy returns the first curated option, or 'role' when empty", () => {
    expect(defaultGroupBy([dim("role", "categorical"), dim("company", "categorical")])).toBe("company");
    expect(defaultGroupBy([])).toBe("role");
  });
});
