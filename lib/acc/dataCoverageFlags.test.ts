import { describe, it, expect } from "vitest";
import { dataCoverageFlags, type DataCoverageInput } from "./dataCoverageFlags";

describe("dataCoverageFlags", () => {
  it("emits 'has-signin' iff lastSignIn is non-null", () => {
    const u: DataCoverageInput = {
      lastSignIn: Date.now(),
      activityCount: 0,
      folderIds: [],
      projectIds: [],
      roleIds: [],
      addedAt: null,
    };
    expect(dataCoverageFlags(u)).toContain("has-signin");

    const u2 = { ...u, lastSignIn: null };
    expect(dataCoverageFlags(u2)).not.toContain("has-signin");
  });

  it("emits 'has-activity' iff activityCount > 0", () => {
    const u: DataCoverageInput = {
      lastSignIn: null,
      activityCount: 5,
      folderIds: [],
      projectIds: [],
      roleIds: [],
      addedAt: null,
    };
    expect(dataCoverageFlags(u)).toContain("has-activity");
  });

  it("emits 'has-folders', 'has-projects', 'has-roles', 'has-added-at' based on presence", () => {
    const u: DataCoverageInput = {
      lastSignIn: null,
      activityCount: 0,
      folderIds: ["f1"],
      projectIds: ["p1"],
      roleIds: ["r1"],
      addedAt: Date.now(),
    };
    const flags = dataCoverageFlags(u);
    expect(flags).toContain("has-folders");
    expect(flags).toContain("has-projects");
    expect(flags).toContain("has-roles");
    expect(flags).toContain("has-added-at");
  });

  it("returns empty array when the user has no data at all", () => {
    const u: DataCoverageInput = {
      lastSignIn: null,
      activityCount: 0,
      folderIds: [],
      projectIds: [],
      roleIds: [],
      addedAt: null,
    };
    expect(dataCoverageFlags(u)).toEqual([]);
  });
});
