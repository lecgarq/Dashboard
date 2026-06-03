import { describe, it, expect } from "vitest";
import { parseProductsJson } from "./productsTierMap";

describe("parseProductsJson", () => {
  it("returns [] for null input (Pitfall 4: never throw)", () => {
    expect(parseProductsJson(null)).toEqual([]);
  });

  it("returns [] for a non-object input", () => {
    expect(parseProductsJson("not an object")).toEqual([]);
  });

  it("returns [] for an array input", () => {
    expect(parseProductsJson(["docs", "member"])).toEqual([]);
  });

  it("parses { docs: 'member' } to a known module with canonical tierLabel", () => {
    const out = parseProductsJson({ docs: "member" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      module: "docs",
      tier: "member",
      tierLabel: "Member",
      isUnknownModule: false,
    });
    expect(out[0].label).toBe("Forma Data Management");
  });

  it("parses multiple modules with mixed tiers", () => {
    const out = parseProductsJson({
      docs: "administrator",
      designCollaboration: "none",
    });
    expect(out).toHaveLength(2);
    const byModule = Object.fromEntries(out.map((t) => [t.module, t]));
    expect(byModule.docs).toMatchObject({
      tier: "administrator",
      tierLabel: "Administrator",
      isUnknownModule: false,
    });
    expect(byModule.designCollaboration).toMatchObject({
      tier: "none",
      tierLabel: "None",
      isUnknownModule: false,
    });
  });

  it("passes through an unknown tier string verbatim", () => {
    const out = parseProductsJson({ docs: "weirdtier" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      module: "docs",
      tier: "weirdtier",
      tierLabel: "weirdtier",
      isUnknownModule: false,
    });
  });

  it("flags unknown module keys with isUnknownModule:true", () => {
    const out = parseProductsJson({ futureModule: "member" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      module: "futureModule",
      tier: "member",
      tierLabel: "Member",
      isUnknownModule: true,
    });
    // Label falls through to the raw key per moduleLabel() contract.
    expect(out[0].label).toBe("futureModule");
  });

  it("recognises snake_case keys via KNOWN_MODULES (design_collaboration)", () => {
    const out = parseProductsJson({ design_collaboration: "member" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      module: "design_collaboration",
      isUnknownModule: false,
      tierLabel: "Member",
    });
    expect(out[0].label).toBe("Design Collaboration");
  });

  it("recognises product keys present in Data Connector user-product access", () => {
    const out = parseProductsJson({
      forma: "member",
      takeoff: "administrator",
      cost: "member",
    });

    expect(out).toEqual([
      expect.objectContaining({
        module: "forma",
        label: "Forma",
        isUnknownModule: false,
      }),
      expect.objectContaining({
        module: "takeoff",
        label: "Takeoff",
        isUnknownModule: false,
      }),
      expect.objectContaining({
        module: "cost",
        label: "Cost Management",
        isUnknownModule: false,
      }),
    ]);
  });
});
