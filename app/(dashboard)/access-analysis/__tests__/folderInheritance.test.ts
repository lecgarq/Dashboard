import { describe, it, expect } from "vitest";
import { resolveEffectiveTier } from "../folderInheritance";
import { rankForTier } from "../folderTerrain";

// ACC stores a folder permission's actions only where it is EXPLICITLY set. An
// inheriting subfolder comes back from the API with an empty actions array, so
// the crawl floors it to "View Only". resolveEffectiveTier restores the real,
// inherited level by deferring an empty-actions cell to its parent's grant.
describe("resolveEffectiveTier", () => {
  it("keeps an explicit grant's own tier even when the parent is higher (override wins)", () => {
    const r = resolveEffectiveTier(
      { permType: "View+Download", actionCount: 3 },
      { permType: "Full Controller", actionCount: 7 },
    );
    expect(r.tier).toBe("View+Download");
    expect(r.rank).toBe(rankForTier("View+Download"));
    expect(r.inherited).toBe(false);
  });

  it("resolves an inherited folder (empty actions) to the parent's explicit tier", () => {
    const r = resolveEffectiveTier(
      { permType: "View Only", actionCount: 0 }, // crawl floor for an inherited folder
      { permType: "Full Controller", actionCount: 7 }, // parent holds the real grant
    );
    expect(r.tier).toBe("Full Controller");
    expect(r.rank).toBe(rankForTier("Full Controller"));
    expect(r.inherited).toBe(true);
  });

  it("keeps the View-Only floor when the parent also has no explicit actions", () => {
    const r = resolveEffectiveTier(
      { permType: "View Only", actionCount: 0 },
      { permType: "View Only", actionCount: 0 },
    );
    expect(r.tier).toBe("View Only");
    expect(r.inherited).toBe(false);
  });

  it("keeps the View-Only floor when there is no parent grant at all", () => {
    const r = resolveEffectiveTier({ permType: "View Only", actionCount: 0 }, undefined);
    expect(r.tier).toBe("View Only");
    expect(r.inherited).toBe(false);
  });
});
