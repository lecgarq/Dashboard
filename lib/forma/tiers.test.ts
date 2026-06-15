import { describe, it, expect } from "vitest";
import { FORMA_TIERS, NO_ACCESS, TIER_ACTIONS, TIER_SHORT, TIER_COLOR } from "./tiers";
import { TIER_DEFINITIONS } from "@/lib/acc/permissionMapping";

describe("forma tiers", () => {
  it("lists No access first, then the 6 ACC tiers low→high", () => {
    expect(FORMA_TIERS[0]).toBe(NO_ACCESS);
    expect(FORMA_TIERS).toHaveLength(7);
    expect(FORMA_TIERS[FORMA_TIERS.length - 1]).toBe("Full Controller");
  });

  it("No access maps to zero ACC actions", () => {
    expect(TIER_ACTIONS[NO_ACCESS]).toEqual([]);
  });

  it("each ACC tier's actions match the canonical TIER_DEFINITIONS", () => {
    for (const def of TIER_DEFINITIONS) {
      expect([...TIER_ACTIONS[def.tier]].sort()).toEqual([...def.actions].sort());
    }
  });

  it("every tier has a short label and a color", () => {
    for (const t of FORMA_TIERS) {
      expect(TIER_SHORT[t]).toBeTruthy();
      expect(TIER_COLOR[t]).toMatch(/^#/);
    }
  });
});
