import { describe, expect, it } from "vitest";

import {
  buildIssueProjectFetchResult,
  summarizeIssueProjectFetchResults,
} from "./issueBackfillAudit";

describe("issue backfill project audit", () => {
  it("classifies an accessible project with issues as ok", () => {
    expect(
      buildIssueProjectFetchResult({
        runId: "run-1",
        projectId: "project-1",
        projectName: "Tower",
        issueCount: 4,
        coordinationCount: 2,
        startedAt: new Date("2026-06-08T00:00:00.000Z"),
        finishedAt: new Date("2026-06-08T00:00:01.000Z"),
      }),
    ).toMatchObject({
      runId: "run-1",
      projectId: "project-1",
      projectName: "Tower",
      status: "ok",
      issueCount: 4,
      coordinationCount: 2,
      errorMessage: null,
    });
  });

  it("classifies an accessible project with no issues as zero_issues", () => {
    expect(
      buildIssueProjectFetchResult({
        runId: "run-1",
        projectId: "project-2",
        projectName: null,
        issueCount: 0,
        coordinationCount: 0,
        startedAt: new Date("2026-06-08T00:00:00.000Z"),
        finishedAt: new Date("2026-06-08T00:00:01.000Z"),
      }).status,
    ).toBe("zero_issues");
  });

  it("classifies forbidden and error outcomes without pretending they were fetched", () => {
    expect(
      buildIssueProjectFetchResult({
        runId: "run-1",
        projectId: "project-3",
        projectName: "No access",
        forbidden: true,
        startedAt: new Date("2026-06-08T00:00:00.000Z"),
        finishedAt: new Date("2026-06-08T00:00:01.000Z"),
      }).status,
    ).toBe("forbidden");

    expect(
      buildIssueProjectFetchResult({
        runId: "run-1",
        projectId: "project-4",
        projectName: "Failed",
        errorMessage: "HTTP 500",
        startedAt: new Date("2026-06-08T00:00:00.000Z"),
        finishedAt: new Date("2026-06-08T00:00:01.000Z"),
      }).status,
    ).toBe("error");
  });

  it("summarizes project-level coverage buckets", () => {
    const startedAt = new Date("2026-06-08T00:00:00.000Z");
    const finishedAt = new Date("2026-06-08T00:00:01.000Z");
    const rows = [
      buildIssueProjectFetchResult({ runId: "r", projectId: "a", projectName: "A", issueCount: 2, coordinationCount: 1, startedAt, finishedAt }),
      buildIssueProjectFetchResult({ runId: "r", projectId: "b", projectName: "B", issueCount: 0, coordinationCount: 0, startedAt, finishedAt }),
      buildIssueProjectFetchResult({ runId: "r", projectId: "c", projectName: "C", forbidden: true, startedAt, finishedAt }),
      buildIssueProjectFetchResult({ runId: "r", projectId: "d", projectName: "D", errorMessage: "timeout", startedAt, finishedAt }),
    ];

    expect(summarizeIssueProjectFetchResults(rows)).toEqual({
      total: 4,
      ok: 1,
      zeroIssues: 1,
      forbidden: 1,
      error: 1,
      fetchedOk: 2,
      issueRows: 2,
      coordinationRows: 1,
    });
  });
});
