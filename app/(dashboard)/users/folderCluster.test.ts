/**
 * Tests for folderCluster.ts — Phase 5.1 GRAPH-04 helpers.
 */

import { describe, it, expect } from "vitest";
import { folderInitialPosition, permissionTierEdgeColor } from "./folderCluster";

// ─────────────────────────────────────────────────────────────────────────────
// folderInitialPosition — determinism + offset
// ─────────────────────────────────────────────────────────────────────────────

describe("folderInitialPosition — determinism", () => {
  it("same urn + same index + same total → same coordinates", () => {
    const a = folderInitialPosition("urn:adsk:folder:abc123", 2, 10);
    const b = folderInitialPosition("urn:adsk:folder:abc123", 2, 10);
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
    expect(a.z).toBe(b.z);
  });

  it("different index → different position", () => {
    const a = folderInitialPosition("urn:adsk:folder:xyz", 0, 5);
    const b = folderInitialPosition("urn:adsk:folder:xyz", 3, 5);
    const diffX = Math.abs(a.x - b.x);
    const diffY = Math.abs(a.y - b.y);
    expect(diffX + diffY).toBeGreaterThan(0);
  });
});

describe("folderInitialPosition — offset from user cluster origin", () => {
  it("|x| + |y| > 600 — folder positions are far from graph origin", () => {
    for (let i = 0; i < 20; i++) {
      const pos = folderInitialPosition(`urn:adsk:folder:${i}`, i, 20);
      expect(Math.abs(pos.x) + Math.abs(pos.y)).toBeGreaterThan(600);
    }
  });

  it("z is 0 (2D graph plane)", () => {
    const pos = folderInitialPosition("urn:test", 0, 1);
    expect(pos.z).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// permissionTierEdgeColor — 4+ tiers, alpha range, distinct colors
// ─────────────────────────────────────────────────────────────────────────────

describe("permissionTierEdgeColor — tier mapping", () => {
  it("View Only → alpha within [0.2, 0.45]", () => {
    const [, , , a] = permissionTierEdgeColor(["view"]);
    expect(a).toBeGreaterThanOrEqual(0.2);
    expect(a).toBeLessThanOrEqual(0.45);
  });

  it("View+Download → distinct from View Only", () => {
    const viewOnly = permissionTierEdgeColor(["view"]);
    const viewDownload = permissionTierEdgeColor(["view", "download"]);
    const same = viewOnly.every((v, i) => v === viewDownload[i]);
    expect(same).toBe(false);
  });

  it("View+Download+Upload+Edit → distinct from View+Download", () => {
    const vd = permissionTierEdgeColor(["view", "download"]);
    const vduc = permissionTierEdgeColor(["view", "download", "upload", "edit"]);
    const same = vd.every((v, i) => v === vduc[i]);
    expect(same).toBe(false);
  });

  it("Full Controller (delete) → distinct from View+Download+Upload+Edit", () => {
    const edit = permissionTierEdgeColor(["view", "download", "upload", "edit"]);
    const full = permissionTierEdgeColor(["view", "download", "upload", "edit", "delete"]);
    const same = edit.every((v, i) => v === full[i]);
    expect(same).toBe(false);
  });

  it("all 4 tiers produce distinct RGBA tuples", () => {
    const colors = [
      permissionTierEdgeColor(["view"]),
      permissionTierEdgeColor(["view", "download"]),
      permissionTierEdgeColor(["view", "download", "upload", "edit"]),
      permissionTierEdgeColor(["view", "download", "upload", "edit", "delete"]),
    ];
    const stringified = colors.map((c) => c.join(","));
    const unique = new Set(stringified);
    expect(unique.size).toBe(4);
  });

  it("all colors have alpha within [0.2, 0.45]", () => {
    const tiers = [
      ["view"],
      ["view", "download"],
      ["upload"],
      ["view", "download", "upload"],
      ["view", "download", "upload", "edit"],
      ["view", "download", "upload", "edit", "delete"],
    ];
    for (const actions of tiers) {
      const [, , , a] = permissionTierEdgeColor(actions);
      expect(a).toBeGreaterThanOrEqual(0.2);
      expect(a).toBeLessThanOrEqual(0.45);
    }
  });
});
