import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mapActions, TIER_DEFINITIONS } from "./permissionMapping";

describe("permissionMapping - tier matches", () => {
  describe("View Only", () => {
    it('maps ["VIEW","COLLABORATE"] to tier="View Only", extended=false', () => {
      const result = mapActions(["VIEW", "COLLABORATE"]);
      expect(result.tier).toBe("View Only");
      expect(result.extended).toBe(false);
      expect(result.extendedActions).toEqual([]);
      expect(result.unknownActions).toEqual([]);
    });
  });

  describe("View+Download", () => {
    it('maps ["VIEW","DOWNLOAD","COLLABORATE"] to tier="View+Download"', () => {
      const result = mapActions(["VIEW", "DOWNLOAD", "COLLABORATE"]);
      expect(result.tier).toBe("View+Download");
      expect(result.extended).toBe(false);
      expect(result.extendedActions).toEqual([]);
      expect(result.unknownActions).toEqual([]);
    });
  });

  describe("Upload Only", () => {
    it('maps ["PUBLISH"] to tier="Upload Only"', () => {
      const result = mapActions(["PUBLISH"]);
      expect(result.tier).toBe("Upload Only");
      expect(result.extended).toBe(false);
      expect(result.extendedActions).toEqual([]);
      expect(result.unknownActions).toEqual([]);
    });
  });

  describe("View+Download+Upload", () => {
    it('maps ["VIEW","DOWNLOAD","COLLABORATE","PUBLISH"] to tier="View+Download+Upload"', () => {
      const result = mapActions(["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH"]);
      expect(result.tier).toBe("View+Download+Upload");
      expect(result.extended).toBe(false);
      expect(result.extendedActions).toEqual([]);
      expect(result.unknownActions).toEqual([]);
    });
  });

  describe("View+Download+Upload+Edit", () => {
    it('maps ["VIEW","DOWNLOAD","COLLABORATE","PUBLISH","EDIT"] to tier="View+Download+Upload+Edit"', () => {
      const result = mapActions(["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH", "EDIT"]);
      expect(result.tier).toBe("View+Download+Upload+Edit");
      expect(result.extended).toBe(false);
      expect(result.extendedActions).toEqual([]);
      expect(result.unknownActions).toEqual([]);
    });
  });

  describe("Full Controller", () => {
    it('maps ["VIEW","DOWNLOAD","COLLABORATE","PUBLISH","EDIT","CONTROL"] to tier="Full Controller"', () => {
      const result = mapActions(["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH", "EDIT", "CONTROL"]);
      expect(result.tier).toBe("Full Controller");
      expect(result.extended).toBe(false);
      expect(result.extendedActions).toEqual([]);
      expect(result.unknownActions).toEqual([]);
    });
  });
});

describe("permissionMapping - edge cases", () => {
  describe("Extended known actions (extra known action beyond matched tier)", () => {
    it('["VIEW","COLLABORATE","EDIT"] → tier="View Only", extended=true, extendedActions=["EDIT"]', () => {
      const result = mapActions(["VIEW", "COLLABORATE", "EDIT"]);
      expect(result.tier).toBe("View Only");
      expect(result.extended).toBe(true);
      expect(result.extendedActions).toContain("EDIT");
      expect(result.unknownActions).toEqual([]);
    });

    it("exact tier match produces extended=false", () => {
      const result = mapActions(["VIEW", "DOWNLOAD", "COLLABORATE"]);
      expect(result.extended).toBe(false);
      expect(result.extendedActions).toEqual([]);
    });
  });

  describe("Missing actions (round-down)", () => {
    it('Full Controller minus EDIT → rounds down to "View+Download+Upload", CONTROL is extended', () => {
      // ["VIEW","DOWNLOAD","COLLABORATE","PUBLISH","CONTROL"] — no EDIT
      // Full Controller needs all 6 → no match
      // V+D+U+E needs VIEW,DOWNLOAD,COLLABORATE,PUBLISH,EDIT → no match (missing EDIT)
      // V+D+U needs VIEW,DOWNLOAD,COLLABORATE,PUBLISH → all present → match
      // CONTROL is a known action not in V+D+U → extended=true
      const result = mapActions(["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH", "CONTROL"]);
      expect(result.tier).toBe("View+Download+Upload");
      expect(result.extended).toBe(true);
      expect(result.extendedActions).toContain("CONTROL");
      expect(result.unknownActions).toEqual([]);
    });
  });

  describe("Unknown actions", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('["VIEW","COLLABORATE","FROBNICATE"] → tier="View Only", unknownActions=["FROBNICATE"], console.warn called', () => {
      const result = mapActions(["VIEW", "COLLABORATE", "FROBNICATE"]);
      expect(result.tier).toBe("View Only");
      expect(result.unknownActions).toEqual(["FROBNICATE"]);
      expect(result.extended).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("FROBNICATE")
      );
    });

    it('["VIEW","COLLABORATE","SUPERPOWER"] with unknown SUPERPOWER → tier="View Only", unknown logged', () => {
      const result = mapActions(["VIEW", "COLLABORATE", "SUPERPOWER"]);
      expect(result.tier).toBe("View Only");
      expect(result.unknownActions).toEqual(["SUPERPOWER"]);
      expect(warnSpy).toHaveBeenCalledOnce();
    });

    it("empty input [] → tier=null", () => {
      const result = mapActions([]);
      expect(result.tier).toBeNull();
      expect(result.extended).toBe(false);
      expect(result.extendedActions).toEqual([]);
      expect(result.unknownActions).toEqual([]);
    });
  });
});

describe("permissionMapping - TIER_DEFINITIONS shape", () => {
  it("exports 6 tiers in order from highest to lowest", () => {
    expect(TIER_DEFINITIONS).toHaveLength(6);
    expect(TIER_DEFINITIONS[0].tier).toBe("Full Controller");
    expect(TIER_DEFINITIONS[5].tier).toBe("View Only");
  });

  it("each tier definition has a Set of actions", () => {
    for (const def of TIER_DEFINITIONS) {
      expect(def.actions).toBeInstanceOf(Set);
      expect(def.actions.size).toBeGreaterThan(0);
    }
  });
});
