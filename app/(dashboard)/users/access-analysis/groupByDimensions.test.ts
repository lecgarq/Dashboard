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
  it("offers ONLY the three presets (role, project, user), dropping everything else", () => {
    const catalog = [
      dim("role", "categorical"),
      dim("project", "categorical"),
      dim("user", "categorical"),
      dim("company", "categorical"),       // dropped (not a preset)
      dim("permission", "ordinal"),        // dropped
      dim("tenure", "ordinal"),            // dropped
      dim("internalExternal", "binary"),   // dropped
    ];
    expect(groupByDimensions(catalog).map((d) => d.id)).toEqual(["role", "project", "user"]);
  });

  it("drops an unavailable preset dim", () => {
    const catalog = [dim("role", "categorical"), dim("user", "categorical", false)];
    expect(groupByDimensions(catalog).map((d) => d.id)).toEqual(["role"]);
  });

  it("orders role first, then project, then user, regardless of catalog order", () => {
    const catalog = [dim("user", "categorical"), dim("project", "categorical"), dim("role", "categorical")];
    expect(groupByDimensions(catalog).map((d) => d.id)).toEqual(["role", "project", "user"]);
  });

  it("defaultGroupBy returns 'role' when present, or 'role' when empty", () => {
    expect(defaultGroupBy([dim("project", "categorical"), dim("role", "categorical"), dim("user", "categorical")])).toBe("role");
    expect(defaultGroupBy([])).toBe("role");
  });
});
