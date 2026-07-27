import { describe, expect, it } from "vitest";

import { ISSUE_DELETED_FILTER_PASSES, buildIssueListUrl } from "./issueListQuery";

describe("ACC issue list query", () => {
  it("plans separate undeleted and deleted passes for all-time extraction", () => {
    expect(ISSUE_DELETED_FILTER_PASSES).toEqual([false, true]);
  });

  it("builds a paginated issue list URL with an explicit deleted filter", () => {
    const url = new URL(
      buildIssueListUrl({
        baseUrl: "https://developer.api.autodesk.com/",
        projectId: "project-1",
        limit: 100,
        offset: 200,
        deleted: true,
      }),
    );

    expect(url.origin).toBe("https://developer.api.autodesk.com");
    expect(url.pathname).toBe("/construction/issues/v1/projects/project-1/issues");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("offset")).toBe("200");
    expect(url.searchParams.get("filter[deleted]")).toBe("true");
  });
});
