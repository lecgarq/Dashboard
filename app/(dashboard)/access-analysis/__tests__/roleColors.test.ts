import { describe, it, expect } from "vitest";
import { buildRoleColorMap } from "../roleColors";
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";

describe("buildRoleColorMap", () => {
  it("assigns fixed warning colors to Unknown and Multiple roles", () => {
    const m = buildRoleColorMap([UNKNOWN_ROLE, MULTIPLE_ROLES]);
    expect(m.get(UNKNOWN_ROLE)).toBe("#efb628");
    expect(m.get(MULTIPLE_ROLES)).toBe("#e0577b");
  });

  it("gives a stable, distinct palette color to each normal role", () => {
    const m = buildRoleColorMap(["Manager", "Viewer", "Admin"]);
    const colors = ["Manager", "Viewer", "Admin"].map((r) => m.get(r));
    expect(new Set(colors).size).toBe(3);
    // Re-building with the same input yields the same assignment.
    const m2 = buildRoleColorMap(["Manager", "Viewer", "Admin"]);
    expect(m2.get("Viewer")).toBe(m.get("Viewer"));
  });
});
