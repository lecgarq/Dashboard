import { describe, expect, it } from "vitest";
import {
  ACTIVITY_DIMENSIONS,
  activityCoverageText,
  activityDimensionById,
  activityDimensionCoverage,
  dimensionCardinality,
  dimensionLabels,
  groupByDimensionList,
} from "./activityDimensions";

const DICTS: Record<string, unknown> = {
  verb: ["(none)", "download", "upload"],
  module: ["(none)", "docs"],
  objectType: ["(none)", "file"],
  role: ["Unknown", "Architect"],
  company: ["Unknown", "ACCI"],
  project: ["(none)", "guid-a", "guid-b"],
  author: ["Unknown author", "a@x.com"],
  monthFloor: "2024-12",
  monthCount: 3,
};

describe("activityDimensions (DIM-07)", () => {
  it("lists exactly the 8 resident dims", () => {
    expect(ACTIVITY_DIMENSIONS.map((d) => d.id)).toEqual([
      "verb", "module", "objectType", "month", "role", "company", "project", "author",
    ]);
  });

  it("author is excluded from group-by (owner decision 4); the other 7 are eligible", () => {
    const groupable = groupByDimensionList().map((d) => d.id);
    expect(groupable).toHaveLength(7);
    expect(groupable).not.toContain("author");
    expect(activityDimensionById("author")?.groupBy).toBe(false);
  });

  it("month labels generate from monthFloor + monthCount", () => {
    const dim = activityDimensionById("month")!;
    expect(dimensionLabels(dim, DICTS)).toEqual(["Dec 2024", "Jan 2025", "Feb 2025"]);
    expect(dimensionCardinality(dim, DICTS)).toBe(3);
  });

  it("project labels map GUIDs through projectNames, falling back to the GUID", () => {
    const dim = activityDimensionById("project")!;
    const labels = dimensionLabels(dim, DICTS, { "guid-a": "Torre Norte" });
    expect(labels).toEqual(["(none)", "Torre Norte", "guid-b"]);
  });

  it("sentinel coverage counts nonzero ids; month reports full corpus", () => {
    const role = activityDimensionById("role")!;
    const cov = activityDimensionCoverage(Uint16Array.from([0, 1, 1, 0, 1]), role);
    expect(cov).toEqual({ covered: 3, total: 5 });
    expect(activityCoverageText(cov)).toBe("3/5");

    const month = activityDimensionById("month")!;
    expect(activityDimensionCoverage(Uint16Array.from([0, 1, 2]), month)).toEqual({
      covered: 3,
      total: 3,
    });
  });
});
