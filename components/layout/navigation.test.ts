import { describe, expect, it } from "vitest";
import { MODULE_NAV_ITEMS, STAFF_NAV_ITEM } from "./navigation";

describe("dashboard navigation", () => {
  it("keeps users, access analysis, and spatial graph as separate destinations", () => {
    expect(MODULE_NAV_ITEMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/users", label: "Users Directory" }),
        expect.objectContaining({ href: "/access-analysis", label: "Access Analysis" }),
        expect.objectContaining({ href: "/users/spatial-graph", label: "Spatial Graph" }),
        expect.objectContaining({ href: "/template-mty", label: "Template MTY" }),
      ]),
    );
  });

  it("no longer exposes the five deleted feature destinations", () => {
    const hrefs = MODULE_NAV_ITEMS.map((item) => item.href);
    expect(hrefs).not.toContain("/sync-center");
    expect(hrefs).not.toContain("/clash-detection");
    expect(hrefs).not.toContain("/sim-automation");
    expect(hrefs).not.toContain("/families");
    expect(hrefs).not.toContain("/exam");
  });

  it("exposes exactly the nine surviving destinations plus Settings", () => {
    expect(MODULE_NAV_ITEMS.map((item) => item.href)).toEqual([
      "/home",
      "/users",
      "/access-analysis",
      "/template-mty",
      "/forma-proposal",
      "/users/spatial-graph",
      "/lod-checker",
      "/trello",
    ]);
    expect(STAFF_NAV_ITEM.href).toBe("/settings/users");
  });
});
