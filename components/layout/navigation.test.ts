import { describe, expect, it } from "vitest";
import { MODULE_NAV_ITEMS } from "./navigation";

describe("dashboard navigation", () => {
  it("keeps users, access analysis, and spatial graph as separate destinations", () => {
    expect(MODULE_NAV_ITEMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/users", label: "Users Directory" }),
        expect.objectContaining({ href: "/access-analysis", label: "Access Analysis" }),
        expect.objectContaining({ href: "/users/spatial-graph", label: "Spatial Graph" }),
      ]),
    );
  });
});
