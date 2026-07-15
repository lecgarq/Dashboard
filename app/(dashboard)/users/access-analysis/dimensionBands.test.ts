import { describe, it, expect } from "vitest";
import {
  bandRiskScore,
  bandPermissionStrength,
  bandActivityVolume,
  bandFolderBreadth,
  bandAccessibleData,
} from "./dimensionBands";

const GB = 1024 ** 3;
const TB = 1024 ** 4;

describe("bandRiskScore", () => {
  it("maps every 0..5 score to its labeled tier", () => {
    expect(bandRiskScore(0)).toBe("Low");
    expect(bandRiskScore(1)).toBe("Low");
    expect(bandRiskScore(2)).toBe("Med");
    expect(bandRiskScore(3)).toBe("Med");
    expect(bandRiskScore(4)).toBe("High");
    expect(bandRiskScore(5)).toBe("Crit");
  });
  it("is total: null/undefined and out-of-range clamp to a labeled tier", () => {
    expect(bandRiskScore(null)).toBe("Unknown");
    expect(bandRiskScore(undefined)).toBe("Unknown");
    expect(bandRiskScore(-3)).toBe("Low");
    expect(bandRiskScore(99)).toBe("Crit");
  });
});

describe("bandPermissionStrength", () => {
  it("maps the 0..5 access ladder to None/Low/Med/High", () => {
    expect(bandPermissionStrength(0)).toBe("None");
    expect(bandPermissionStrength(1)).toBe("Low");
    expect(bandPermissionStrength(2)).toBe("Low");
    expect(bandPermissionStrength(3)).toBe("Med");
    expect(bandPermissionStrength(4)).toBe("Med");
    expect(bandPermissionStrength(5)).toBe("High");
  });
  it("is total on null/undefined", () => {
    expect(bandPermissionStrength(null)).toBe("None");
    expect(bandPermissionStrength(undefined)).toBe("None");
  });
});

describe("bandActivityVolume", () => {
  it("reuses the snapshot activity buckets (0 / 1-10 / 11-100 / 101+)", () => {
    expect(bandActivityVolume(0)).toBe("None");
    expect(bandActivityVolume(1)).toBe("Low");
    expect(bandActivityVolume(10)).toBe("Low");
    expect(bandActivityVolume(11)).toBe("Med");
    expect(bandActivityVolume(100)).toBe("Med");
    expect(bandActivityVolume(101)).toBe("High");
  });
  it("is total on null/undefined", () => {
    expect(bandActivityVolume(null)).toBe("None");
    expect(bandActivityVolume(undefined)).toBe("None");
  });
});

describe("bandFolderBreadth", () => {
  it("maps breadth counts to labeled bands at every boundary", () => {
    expect(bandFolderBreadth(0)).toBe("None");
    expect(bandFolderBreadth(1)).toBe("< 10 folders");
    expect(bandFolderBreadth(9)).toBe("< 10 folders");
    expect(bandFolderBreadth(10)).toBe("< 100 folders");
    expect(bandFolderBreadth(99)).toBe("< 100 folders");
    expect(bandFolderBreadth(100)).toBe("< 1k folders");
    expect(bandFolderBreadth(999)).toBe("< 1k folders");
    expect(bandFolderBreadth(1000)).toBe("1k+ folders");
  });
  it("is total on null/undefined", () => {
    expect(bandFolderBreadth(null)).toBe("None");
    expect(bandFolderBreadth(undefined)).toBe("None");
  });
});

describe("bandAccessibleData", () => {
  it("maps byte totals to labeled size bands at every boundary", () => {
    expect(bandAccessibleData(0)).toBe("None");
    expect(bandAccessibleData(1)).toBe("< 1 GB");
    expect(bandAccessibleData(GB - 1)).toBe("< 1 GB");
    expect(bandAccessibleData(GB)).toBe("< 100 GB");
    expect(bandAccessibleData(100 * GB - 1)).toBe("< 100 GB");
    expect(bandAccessibleData(100 * GB)).toBe("< 1 TB");
    expect(bandAccessibleData(TB - 1)).toBe("< 1 TB");
    expect(bandAccessibleData(TB)).toBe("1 TB+");
  });
  it("is total on null/undefined (0 until crawled)", () => {
    expect(bandAccessibleData(null)).toBe("None");
    expect(bandAccessibleData(undefined)).toBe("None");
  });
});
