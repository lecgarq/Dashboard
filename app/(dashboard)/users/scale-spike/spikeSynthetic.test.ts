import { describe, expect, it } from "vitest";
import {
  SPIKE_CARDINALITIES,
  colorsFromVerbColumn,
  generateSpikeAttributes,
  generateSpikePositions,
} from "./spikeSynthetic";

const N = 10_000;

describe("spikeSynthetic (Phase 37 SCALE-01 harness)", () => {
  it("positions are deterministic for a given seed", () => {
    const a = generateSpikePositions(N, 7);
    const b = generateSpikePositions(N, 7);
    const c = generateSpikePositions(N, 8);
    expect(a.length).toBe(N * 3);
    expect(Array.from(a.subarray(0, 12))).toEqual(Array.from(b.subarray(0, 12)));
    expect(Array.from(a.subarray(a.length - 12))).toEqual(Array.from(b.subarray(b.length - 12)));
    expect(Array.from(a.subarray(0, 12))).not.toEqual(Array.from(c.subarray(0, 12)));
  });

  it("positions are finite, inside ±350, z always 0", () => {
    const p = generateSpikePositions(N, 42);
    for (let i = 0; i < N; i++) {
      expect(Number.isFinite(p[i * 3])).toBe(true);
      expect(Math.abs(p[i * 3])).toBeLessThanOrEqual(350);
      expect(Math.abs(p[i * 3 + 1])).toBeLessThanOrEqual(350);
      expect(p[i * 3 + 2]).toBe(0);
    }
  });

  it("attribute columns respect live cardinalities and are deterministic", () => {
    const a = generateSpikeAttributes(N, 42);
    const b = generateSpikeAttributes(N, 42);
    expect(a.verbId.length).toBe(N);
    expect(a.projectId.length).toBe(N);
    expect(Array.from(a.verbId.subarray(0, 20))).toEqual(Array.from(b.verbId.subarray(0, 20)));
    let maxVerb = 0;
    let maxObj = 0;
    let maxProj = 0;
    let maxAuthor = 0;
    let maxMonth = 0;
    for (let i = 0; i < N; i++) {
      if (a.verbId[i] > maxVerb) maxVerb = a.verbId[i];
      if (a.objectTypeId[i] > maxObj) maxObj = a.objectTypeId[i];
      if (a.projectId[i] > maxProj) maxProj = a.projectId[i];
      if (a.authorId[i] > maxAuthor) maxAuthor = a.authorId[i];
      if (a.month[i] > maxMonth) maxMonth = a.month[i];
    }
    expect(maxVerb).toBeLessThan(SPIKE_CARDINALITIES.verbs);
    expect(maxObj).toBeLessThan(SPIKE_CARDINALITIES.objectTypes);
    expect(maxProj).toBeLessThan(SPIKE_CARDINALITIES.projects);
    expect(maxAuthor).toBeLessThan(SPIKE_CARDINALITIES.authors);
    expect(maxMonth).toBeLessThan(SPIKE_CARDINALITIES.months);
  });

  it("colors are RGBA in [0,1], one per node", () => {
    const { verbId } = generateSpikeAttributes(N, 42);
    const rgba = colorsFromVerbColumn(verbId);
    expect(rgba.length).toBe(N * 4);
    for (let i = 0; i < rgba.length; i++) {
      expect(rgba[i]).toBeGreaterThanOrEqual(0);
      expect(rgba[i]).toBeLessThanOrEqual(1);
    }
  });
});
