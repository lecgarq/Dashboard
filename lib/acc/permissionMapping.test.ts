import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mapActions, TIER_DEFINITIONS } from "./permissionMapping";

describe("permissionMapping - tier matches (ACC-aligned)", () => {
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
    });
  });

  describe("View+Download+Publish markups", () => {
    it('maps markups-without-upload to the new "Publish markups" level', () => {
      const result = mapActions(["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH_MARKUP"]);
      expect(result.tier).toBe("View+Download+Publish markups");
      expect(result.extended).toBe(false);
    });
  });

  describe("View+Download+Publish markups+Upload", () => {
    it('upload (PUBLISH) maps to the Upload level even without an explicit PUBLISH_MARKUP (non-strict)', () => {
      const result = mapActions(["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH"]);
      expect(result.tier).toBe("View+Download+Publish markups+Upload");
      expect(result.extended).toBe(false);
    });
  });

  describe("View+Download+Publish markups+Upload+Edit", () => {
    it('maps VIEW,DOWNLOAD,COLLABORATE,PUBLISH,EDIT to the Edit level', () => {
      const result = mapActions(["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH", "EDIT"]);
      expect(result.tier).toBe("View+Download+Publish markups+Upload+Edit");
      expect(result.extended).toBe(false);
    });
  });

  describe("Full administrative controls", () => {
    it('maps the full action set incl. CONTROL to "Full administrative controls"', () => {
      const result = mapActions(["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH", "EDIT", "CONTROL"]);
      expect(result.tier).toBe("Full administrative controls");
      expect(result.extended).toBe(false);
    });
  });
});

describe("permissionMapping - edge cases", () => {
  it('extra known action below its tier → extended=true (["VIEW","COLLABORATE","EDIT"])', () => {
    const result = mapActions(["VIEW", "COLLABORATE", "EDIT"]);
    expect(result.tier).toBe("View Only");
    expect(result.extended).toBe(true);
    expect(result.extendedActions).toContain("EDIT");
  });

  it('round-down: VIEW,DOWNLOAD,COLLABORATE,PUBLISH,CONTROL (no EDIT) → Upload level, CONTROL extended', () => {
    const result = mapActions(["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH", "CONTROL"]);
    expect(result.tier).toBe("View+Download+Publish markups+Upload");
    expect(result.extended).toBe(true);
    expect(result.extendedActions).toContain("CONTROL");
  });

  it("PUBLISH alone has no named ACC level → tier=null", () => {
    expect(mapActions(["PUBLISH"]).tier).toBeNull();
  });

  it("empty input [] → tier=null", () => {
    const result = mapActions([]);
    expect(result.tier).toBeNull();
    expect(result.extended).toBe(false);
  });

  describe("Unknown actions", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}); });
    afterEach(() => { warnSpy.mockRestore(); });

    it('["VIEW","COLLABORATE","FROBNICATE"] → tier="View Only", unknownActions=["FROBNICATE"]', () => {
      const result = mapActions(["VIEW", "COLLABORATE", "FROBNICATE"]);
      expect(result.tier).toBe("View Only");
      expect(result.unknownActions).toEqual(["FROBNICATE"]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("FROBNICATE"));
    });
  });
});

describe("permissionMapping - TIER_DEFINITIONS shape", () => {
  it("exports 6 tiers, highest → lowest", () => {
    expect(TIER_DEFINITIONS).toHaveLength(6);
    expect(TIER_DEFINITIONS[0].tier).toBe("Full administrative controls");
    expect(TIER_DEFINITIONS[5].tier).toBe("View Only");
  });

  it("each tier definition has a non-empty Set of actions", () => {
    for (const def of TIER_DEFINITIONS) {
      expect(def.actions).toBeInstanceOf(Set);
      expect(def.actions.size).toBeGreaterThan(0);
    }
  });
});
