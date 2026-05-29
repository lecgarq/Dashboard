import { describe, it, expect } from "vitest";
import { buildFolderAttributeDimensions } from "./dimensionCatalog.folder";
import { buildDimensionCatalog } from "./dimensionCatalog";

describe("folder placeholders + catalog wiring", () => {
  it("all 19 placeholders are disabled and carry a note", () => {
    const dims = buildFolderAttributeDimensions();
    expect(dims).toHaveLength(19);
    for (const d of dims) {
      expect(d.available).toBe(false);
      expect(typeof d.note).toBe("string");
      expect(d.note!.length).toBeGreaterThan(0);
    }
  });
  it("catalog includes the 3 live folder dims as available", () => {
    const byId = Object.fromEntries(buildDimensionCatalog().map((d) => [d.id, d]));
    expect(byId["folder:reach"].available).toBe(true);
    expect(byId["folder:controller"].available).toBe(true);
    expect(byId["folder:mixed"].available).toBe(true);
  });
});
