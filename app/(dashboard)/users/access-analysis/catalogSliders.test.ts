import { describe, it, expect } from "vitest";
import { catalogDefaultSliders, GROUPING_DEFAULT } from "./catalogSliders";
import type { CatalogDimension } from "./dimensionCatalog.types";

function dim(id: string, available = true): CatalogDimension {
  // Minimal shape — only fields catalogSliders reads.
  return { id, label: id, surfaces: ["slider"], available } as unknown as CatalogDimension;
}

describe("catalogDefaultSliders", () => {
  it("defaults Role to the grouping value, everything else 0", () => {
    const cat = [dim("role"), dim("project"), dim("user")];
    const d = catalogDefaultSliders(cat);
    expect(d.role).toBe(GROUPING_DEFAULT);
    expect(d.project).toBe(0);
    expect(d.user).toBe(0);
  });

  it("falls back to Project when Role is absent/unavailable", () => {
    const cat = [dim("role", false), dim("project"), dim("user")];
    const d = catalogDefaultSliders(cat);
    expect(d.role ?? 0).toBe(0);          // role greyed → not an available slider
    expect(d.project).toBe(GROUPING_DEFAULT);
  });

  it("leaves all 0 when neither role nor project is available", () => {
    const cat = [dim("user"), dim("company")];
    const d = catalogDefaultSliders(cat);
    expect(Object.values(d).every((v) => v === 0)).toBe(true);
  });
});
