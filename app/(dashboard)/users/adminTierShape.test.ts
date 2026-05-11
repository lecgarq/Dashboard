/**
 * Tests for adminTierShape.ts — Phase 5.1 GRAPH-03 admin overlay.
 */

import { describe, it, expect } from "vitest";
import { adminTierFor, adminTierShapeEnum } from "./adminTierShape";

// ─────────────────────────────────────────────────────────────────────────────
// adminTierFor — classification rules
// ─────────────────────────────────────────────────────────────────────────────

describe("adminTierFor — tier classification", () => {
  it("pure hub admin → star / 1.5 / gold halo", () => {
    const result = adminTierFor({ isAccountAdmin: true });
    expect(result.tier).toBe("hub");
    expect(result.shape).toBe("star");
    expect(result.sizeMultiplier).toBe(1.5);
    expect(result.haloColor).toBe("#FFD700");
  });

  it("pure project admin → diamond / 1.0 / null halo", () => {
    const result = adminTierFor({ projectAdmin: true });
    expect(result.tier).toBe("project");
    expect(result.shape).toBe("diamond");
    expect(result.sizeMultiplier).toBe(1.0);
    expect(result.haloColor).toBeNull();
  });

  it("pure executive → ring / 1.0 / null halo", () => {
    const result = adminTierFor({ executive: true });
    expect(result.tier).toBe("executive");
    expect(result.shape).toBe("ring");
    expect(result.sizeMultiplier).toBe(1.0);
    expect(result.haloColor).toBeNull();
  });

  it("non-admin → circle / 1.0 / null halo", () => {
    const result = adminTierFor({});
    expect(result.tier).toBe("none");
    expect(result.shape).toBe("circle");
    expect(result.sizeMultiplier).toBe(1.0);
    expect(result.haloColor).toBeNull();
  });

  it("all flags false → none tier", () => {
    const result = adminTierFor({ isAccountAdmin: false, projectAdmin: false, executive: false });
    expect(result.tier).toBe("none");
  });

  // Precedence: hub > project > executive > none

  it("hub + project (precedence) → hub tier (star / 1.5 / gold)", () => {
    const result = adminTierFor({ isAccountAdmin: true, projectAdmin: true });
    expect(result.tier).toBe("hub");
    expect(result.shape).toBe("star");
    expect(result.sizeMultiplier).toBe(1.5);
    expect(result.haloColor).toBe("#FFD700");
  });

  it("hub + executive (precedence) → hub tier", () => {
    const result = adminTierFor({ isAccountAdmin: true, executive: true });
    expect(result.tier).toBe("hub");
  });

  it("project + executive (precedence) → project tier (diamond)", () => {
    const result = adminTierFor({ projectAdmin: true, executive: true });
    expect(result.tier).toBe("project");
    expect(result.shape).toBe("diamond");
    expect(result.haloColor).toBeNull();
  });

  it("hub + project + executive (full precedence) → hub", () => {
    const result = adminTierFor({ isAccountAdmin: true, projectAdmin: true, executive: true });
    expect(result.tier).toBe("hub");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// adminTierShapeEnum — cosmos.gl PointShape integers
// ─────────────────────────────────────────────────────────────────────────────

describe("adminTierShapeEnum — cosmos.gl PointShape enum mapping", () => {
  it("hub → 6 (Star)", () => {
    expect(adminTierShapeEnum("hub")).toBe(6);
  });

  it("project → 3 (Diamond)", () => {
    expect(adminTierShapeEnum("project")).toBe(3);
  });

  it("executive → 0 (Circle — ring overlay via halo pass)", () => {
    expect(adminTierShapeEnum("executive")).toBe(0);
  });

  it("none → 0 (Circle)", () => {
    expect(adminTierShapeEnum("none")).toBe(0);
  });
});
