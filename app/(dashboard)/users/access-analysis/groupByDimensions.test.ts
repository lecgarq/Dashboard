import { describe, it, expect } from "vitest";
import { groupByDimensions, defaultGroupBy } from "./groupByDimensions";
import { PRESET_DIMENSION_IDS, APERTURE_THEME_GROUPS } from "./dimensionIdSpace";
import type { CatalogDimension } from "./dimensionCatalog.types";

function dim(id: string, kind: CatalogDimension["kind"], available = true): CatalogDimension {
  return {
    id, label: id[0].toUpperCase() + id.slice(1), family: "structure", kind,
    source: "test", confidence: "high", available, surfaces: ["slider", "color"],
    extract: () => null,
  } as unknown as CatalogDimension;
}

describe("groupByDimensions", () => {
  it("offers the widened themed aperture and drops non-aperture dims", () => {
    const catalog = [
      ...PRESET_DIMENSION_IDS.map((id) => dim(id, "categorical")),
      dim("activityByModule", "multiHot"),  // catalog dim, not in the aperture → dropped
      dim("typeOfActivity", "multiHot"),    // dropped
      dim("notADim", "categorical"),        // dropped
    ];
    expect(groupByDimensions(catalog).map((d) => d.id)).toEqual([...PRESET_DIMENSION_IDS]);
  });

  it("the aperture is the flattened theme groups (single source, role first)", () => {
    expect(PRESET_DIMENSION_IDS).toEqual(APERTURE_THEME_GROUPS.flatMap((g) => [...g.ids]));
    expect(PRESET_DIMENSION_IDS[0]).toBe("role");
    // Baseline presets still lead the list, in order.
    expect(PRESET_DIMENSION_IDS.slice(0, 3)).toEqual(["role", "project", "user"]);
    // No duplicates across theme groups.
    expect(new Set(PRESET_DIMENSION_IDS).size).toBe(PRESET_DIMENSION_IDS.length);
  });

  it("drops an unavailable aperture dim", () => {
    const catalog = [dim("role", "categorical"), dim("user", "categorical", false)];
    expect(groupByDimensions(catalog).map((d) => d.id)).toEqual(["role"]);
  });

  it("orders by aperture display order, regardless of catalog order", () => {
    const catalog = [
      dim("riskScore", "ordinal"),
      dim("user", "categorical"),
      dim("company", "categorical"),
      dim("project", "categorical"),
      dim("role", "categorical"),
    ];
    expect(groupByDimensions(catalog).map((d) => d.id)).toEqual([
      "role", "project", "user", "company", "riskScore",
    ]);
  });

  it("defaultGroupBy returns 'role' when present, or 'role' when empty", () => {
    expect(defaultGroupBy([dim("project", "categorical"), dim("role", "categorical"), dim("user", "categorical")])).toBe("role");
    expect(defaultGroupBy([])).toBe("role");
  });
});
