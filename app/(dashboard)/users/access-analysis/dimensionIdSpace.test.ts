import { describe, it, expect } from "vitest";
import { PRESET_DIMENSION_IDS, REGISTRY_ID_BY_CATALOG_ID, colorModeIdForCatalogId } from "./dimensionIdSpace";
import { getDimension } from "./dimensionRegistry";

describe("dimensionIdSpace", () => {
  it("PRESET_DIMENSION_IDS is exactly role, project, user in that order", () => {
    expect(PRESET_DIMENSION_IDS).toEqual(["role", "project", "user"]);
  });

  it("colorModeIdForCatalogId is identity for all three presets (no bridge entries yet)", () => {
    for (const id of PRESET_DIMENSION_IDS) {
      expect(colorModeIdForCatalogId(id)).toBe(id);
    }
  });

  it("every REGISTRY_ID_BY_CATALOG_ID value is a real registry id", () => {
    for (const registryId of Object.values(REGISTRY_ID_BY_CATALOG_ID)) {
      expect(getDimension(registryId!)).not.toBeUndefined();
    }
  });
});
