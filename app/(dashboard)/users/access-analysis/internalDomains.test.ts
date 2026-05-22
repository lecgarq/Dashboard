import { describe, it, expect } from "vitest";
import {
  INTERNAL_DOMAINS,
  classifyAffiliation,
  isInternalEmail,
} from "./internalDomains";

describe("internalDomains — canonical hermosillo rule (P1)", () => {
  it("allowlist is hermosillo.com (no lecg.com)", () => {
    expect(INTERNAL_DOMAINS).toContain("hermosillo.com");
    expect(INTERNAL_DOMAINS).not.toContain("lecg.com");
  });

  describe("classifyAffiliation", () => {
    it("user@hermosillo.com -> internal", () => {
      expect(classifyAffiliation("user@hermosillo.com")).toBe("internal");
    });

    it("user@sub.hermosillo.com -> internal (subdomain)", () => {
      expect(classifyAffiliation("user@sub.hermosillo.com")).toBe("internal");
    });

    it("user@gmail.com -> external", () => {
      expect(classifyAffiliation("user@gmail.com")).toBe("external");
    });

    it("user@empresa.com -> external", () => {
      expect(classifyAffiliation("user@empresa.com")).toBe("external");
    });

    it("null -> unknown", () => {
      expect(classifyAffiliation(null)).toBe("unknown");
    });

    it("undefined -> unknown", () => {
      expect(classifyAffiliation(undefined)).toBe("unknown");
    });

    it('"" -> unknown', () => {
      expect(classifyAffiliation("")).toBe("unknown");
    });

    it('"bademail" (no @) -> unknown', () => {
      expect(classifyAffiliation("bademail")).toBe("unknown");
    });

    it('"user@" (empty domain) -> unknown', () => {
      expect(classifyAffiliation("user@")).toBe("unknown");
    });

    it('"@domain.com" (empty local) -> unknown', () => {
      expect(classifyAffiliation("@domain.com")).toBe("unknown");
    });

    it("is case-insensitive and trims whitespace", () => {
      expect(classifyAffiliation("  User@HERMOSILLO.com  ")).toBe("internal");
    });

    it("does not treat lecg.com as internal anymore", () => {
      expect(classifyAffiliation("user@lecg.com")).toBe("external");
    });

    it("rejects lookalike domain not ending in .hermosillo.com", () => {
      expect(classifyAffiliation("user@hermosillo.com.evil.com")).toBe("external");
      expect(classifyAffiliation("user@nothermosillo.com")).toBe("external");
    });
  });

  describe("isInternalEmail", () => {
    it("true for hermosillo.com, false for external/unknown", () => {
      expect(isInternalEmail("a@hermosillo.com")).toBe(true);
      expect(isInternalEmail("a@gmail.com")).toBe(false);
      expect(isInternalEmail(null)).toBe(false);
    });
  });
});
