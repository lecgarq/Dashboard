import { describe, expect, it } from "vitest";
import { buildCoverage } from "./projectCoverageView";

describe("buildCoverage", () => {
  const activity = [{ projectId: "p1" }, { projectId: "p2" }, { projectId: null }, { projectId: "" }];
  const projects = [
    { id: "p1", folderCrawlStatus: "ok" },
    { id: "p2", folderCrawlStatus: "inaccessible" },
    { id: "p3", folderCrawlStatus: "ok" },
  ];
  const fileFolders = [{ projectId: "p1" }, { projectId: "p1" }, { projectId: "p3" }];

  it("flags activity, folder crawl and file crawl independently", () => {
    const rows = buildCoverage(activity, projects, fileFolders);
    const byId = new Map(rows.map((r) => [r.projectId, r]));

    // p1: activity + ok crawl + files -> fully covered, file-crawled
    expect(byId.get("p1")).toEqual({ projectId: "p1", hasActivity: true, folderCrawled: true, fileCrawled: true });
    // p2: activity but crawl inaccessible -> not folder-covered
    expect(byId.get("p2")).toEqual({ projectId: "p2", hasActivity: true, folderCrawled: false, fileCrawled: false });
    // p3: no activity but ok crawl + files
    expect(byId.get("p3")).toEqual({ projectId: "p3", hasActivity: false, folderCrawled: true, fileCrawled: true });
  });

  it("ignores null/empty activity project ids", () => {
    const rows = buildCoverage(activity, projects, fileFolders);
    expect(rows.find((r) => r.projectId === "")).toBeUndefined();
    expect(rows.find((r) => r.projectId === null as unknown as string)).toBeUndefined();
  });

  it("includes projects known only from the file crawl", () => {
    const rows = buildCoverage([], [], [{ projectId: "only-files" }]);
    expect(rows).toEqual([{ projectId: "only-files", hasActivity: false, folderCrawled: false, fileCrawled: true }]);
  });
});
