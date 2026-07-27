import { describe, it, expect } from "vitest";
import { buildRoleColorMap } from "../roleColors";
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";

describe("buildRoleColorMap", () => {
  it("assigns fixed warning colors to Unknown and Multiple roles", () => {
    const m = buildRoleColorMap([UNKNOWN_ROLE, MULTIPLE_ROLES], true);
    expect(m.get(UNKNOWN_ROLE)).toBe("#efb628");
    expect(m.get(MULTIPLE_ROLES)).toBe("#e0577b");
  });

  it("gives a stable, distinct palette color to each normal role", () => {
    const m = buildRoleColorMap(["Manager", "Viewer", "Admin"], true);
    const colors = ["Manager", "Viewer", "Admin"].map((r) => m.get(r));
    expect(new Set(colors).size).toBe(3);
    // Re-building with the same input yields the same assignment.
    const m2 = buildRoleColorMap(["Manager", "Viewer", "Admin"], true);
    expect(m2.get("Viewer")).toBe(m.get("Viewer"));
  });

  it("keeps role identity positional across themes", () => {
    const roles = ["Manager", "Viewer", "Admin"];
    const d = buildRoleColorMap(roles, true);
    const l = buildRoleColorMap(roles, false);
    // Same slot, different theme value — a role must not silently reuse a
    // sibling's color when the theme flips.
    expect(d.get("Viewer")).not.toBe(l.get("Viewer"));
    expect(new Set(roles.map((r) => l.get(r))).size).toBe(3);
  });
});
