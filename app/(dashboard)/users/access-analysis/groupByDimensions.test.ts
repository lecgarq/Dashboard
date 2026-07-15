import { describe, expect, it } from "vitest";
import {
  defaultGroupBy,
  GENERAL_GROUP_ID,
  groupByDimensions,
  PRIMARY_GROUP_DIMENSION_IDS,
} from "./groupByDimensions";
import type { CatalogDimension } from "./dimensionCatalog.types";

function dim(id: string, available = true): CatalogDimension {
  return {
    id,
    label: id,
    family: "structure",
    kind: "categorical",
    source: "test",
    confidence: "high",
    available,
    surfaces: ["slider", "color"],
    extract: () => null,
  } as CatalogDimension;
}

describe("groupByDimensions", () => {
  it("locks the owner-approved primary order", () => {
    expect(PRIMARY_GROUP_DIMENSION_IDS).toEqual([
      "role",
      "company",
      "user",
      "project",
      "activityRecency",
      "activityVolume",
      "permissionTier",
      "folderBreadth",
      "typeOfActivity",
      "moduleAccess",
    ]);
  });

  it("returns only available primary dimensions in locked order", () => {
    const catalog = [
      dim("riskScore"),
      ...[...PRIMARY_GROUP_DIMENSION_IDS].reverse().map((id) => dim(id)),
      dim("activityByModule"),
    ];
    expect(groupByDimensions(catalog).map((item) => item.id)).toEqual(PRIMARY_GROUP_DIMENSION_IDS);
  });

  it("keeps unavailable and non-primary dimensions out of the menu", () => {
    expect(groupByDimensions([dim("role", false), dim("company"), dim("riskScore")]).map((item) => item.id))
      .toEqual(["company"]);
  });

  it("defaults to the synthetic General similarity baseline", () => {
    expect(GENERAL_GROUP_ID).toBe("general");
    expect(defaultGroupBy([dim("role")])).toBe("general");
    expect(defaultGroupBy([])).toBe("general");
  });
});
