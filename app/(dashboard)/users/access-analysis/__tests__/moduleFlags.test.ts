import { describe, it, expect } from "vitest";
import { KNOWN_ADVANCED_MODULES, deriveModuleFlags } from "../moduleFlags";

describe("deriveModuleFlags", () => {
  it("sets true only for known modules present in the signature", () => {
    const flags = deriveModuleFlags(["build", "cost"]);
    expect(flags.build).toBe(true);
    expect(flags.cost).toBe(true);
    // every other known module is explicitly false (not undefined)
    for (const k of KNOWN_ADVANCED_MODULES) {
      if (k !== "build" && k !== "cost") expect(flags[k]).toBe(false);
    }
  });

  it("returns an all-false map for an empty signature", () => {
    const flags = deriveModuleFlags([]);
    expect(Object.values(flags).every((v) => v === false)).toBe(true);
    expect(Object.keys(flags).sort()).toEqual([...KNOWN_ADVANCED_MODULES].sort());
  });

  it("ignores unknown module keys (no extra keys leak in)", () => {
    const flags = deriveModuleFlags(["totally-unknown-module"]);
    expect(Object.keys(flags).sort()).toEqual([...KNOWN_ADVANCED_MODULES].sort());
  });
});
