import { describe, it, expect } from "vitest";
import {
  FORMA_TIERS, NO_ACCESS, TIER_ACTIONS, TIER_SHORT, TIER_COLOR, TIER_GROUP, migrateTier,
} from "./tiers";

describe("forma tiers (ACC-aligned)", () => {
  it("lists No access first, 7 entries, Manage level last", () => {
    expect(FORMA_TIERS[0]).toBe(NO_ACCESS);
    expect(FORMA_TIERS).toHaveLength(7);
    expect(FORMA_TIERS[6]).toBe("Full administrative controls");
  });

  it("encodes the real ACC actions (incl. PUBLISH_MARKUP and CONTROL)", () => {
    expect(TIER_ACTIONS[NO_ACCESS]).toEqual([]);
    expect(TIER_ACTIONS["View+Download+Publish markups"]).toContain("PUBLISH_MARKUP");
    expect(TIER_ACTIONS["Full administrative controls"]).toContain("CONTROL");
  });

  it("actions are monotonically increasing along the tier order", () => {
    let prev = 0;
    for (const t of FORMA_TIERS) {
      expect(TIER_ACTIONS[t].length).toBeGreaterThanOrEqual(prev);
      prev = TIER_ACTIONS[t].length;
    }
  });

  it("every tier has a short label, color, and ACC group", () => {
    for (const t of FORMA_TIERS) {
      expect(TIER_SHORT[t]).toBeTruthy();
      expect(TIER_COLOR[t]).toMatch(/^#/);
      expect(TIER_GROUP[t]).toBeTruthy();
    }
  });

  it("migrates legacy tier strings to current levels", () => {
    expect(migrateTier("Full Controller")).toBe("Full administrative controls");
    expect(migrateTier("Upload Only")).toBe("View+Download+Publish markups+Upload");
    expect(migrateTier("View+Download+Upload+Edit")).toBe("View+Download+Publish markups+Upload+Edit");
    expect(migrateTier("View Only")).toBe("View Only");
    expect(migrateTier("garbage")).toBe(NO_ACCESS);
  });
});
