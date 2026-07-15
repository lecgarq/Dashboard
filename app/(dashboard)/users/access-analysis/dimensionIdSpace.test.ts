import { describe, it, expect } from "vitest";
import { PRESET_DIMENSION_IDS, APERTURE_THEME_GROUPS } from "./dimensionIdSpace";
import { buildStructuralDimensions } from "./dimensionCatalog.structural";

describe("dimensionIdSpace", () => {
  it("PRESET_DIMENSION_IDS is the widened 17-dim aperture, role first", () => {
    expect(PRESET_DIMENSION_IDS.length).toBe(17);
    expect(PRESET_DIMENSION_IDS[0]).toBe("role");
    expect(PRESET_DIMENSION_IDS.slice(0, 3)).toEqual(["role", "project", "user"]);
    expect(new Set(PRESET_DIMENSION_IDS).size).toBe(17);
  });

  it("PRESET_DIMENSION_IDS is exactly the flattened theme groups (single source)", () => {
    expect(PRESET_DIMENSION_IDS).toEqual(APERTURE_THEME_GROUPS.flatMap((g) => [...g.ids]));
  });

  it("every aperture id resolves to a real, available structural catalog dim", () => {
    const byId = new Map(buildStructuralDimensions().map((d) => [d.id, d]));
    for (const id of PRESET_DIMENSION_IDS) {
      const d = byId.get(id);
      expect(d, `missing catalog dim: ${id}`).toBeTruthy();
      expect(d!.available, `unavailable catalog dim: ${id}`).toBe(true);
    }
  });
});
