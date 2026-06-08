import { describe, it, expect } from "vitest";
import { resolveMapGrouping } from "./mapGrouping";

// hasDim: company/role are colorable registry dims; "weird" is not.
const hasDim = (id: string) => id === "company" || id === "role";

describe("resolveMapGrouping (flag-OFF projector map)", () => {
  it("at rest (strength 0): cluster color, no labels, groups by the picker dim", () => {
    const r = resolveMapGrouping({ flagOn: false, groupBy: "company", groupingDim: "role", strength: 0, hasDim });
    expect(r.groupDimId).toBe("company");
    expect(r.colorMode).toBe("cluster");
    expect(r.showLabels).toBe(false);
  });

  it("while grouping (strength > 0): color + labels follow the picker dim", () => {
    const r = resolveMapGrouping({ flagOn: false, groupBy: "company", groupingDim: "role", strength: 40, hasDim });
    expect(r.groupDimId).toBe("company");
    expect(r.colorMode).toBe("company");
    expect(r.showLabels).toBe(true);
  });

  it("falls back to cluster color when the picker dim is not colorable", () => {
    const r = resolveMapGrouping({ flagOn: false, groupBy: "weird", groupingDim: "role", strength: 40, hasDim });
    expect(r.colorMode).toBe("cluster");
    expect(r.showLabels).toBe(true); // still grouping/labelled by the dim
  });
});

describe("resolveMapGrouping (flag-ON physics graph)", () => {
  it("groups + colors + labels by the dominant slider dim (today's behavior)", () => {
    const r = resolveMapGrouping({ flagOn: true, groupBy: "company", groupingDim: "role", strength: 0, hasDim });
    expect(r.groupDimId).toBe("role");
    expect(r.colorMode).toBe("role");
    expect(r.showLabels).toBe(true);
  });
});
