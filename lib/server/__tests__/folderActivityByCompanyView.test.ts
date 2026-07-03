import { describe, it, expect } from "vitest";
import { assembleFolderScopedActivity, collapseFolderSlices } from "@/lib/server/folderActivityByCompanyView";

// ---------------------------------------------------------------------------
// assembleFolderScopedActivity — pure assembly, no DB
// ---------------------------------------------------------------------------

describe("assembleFolderScopedActivity", () => {
  it("is bounded — output length equals the input pair count (never the raw ~4.1M-row scale)", () => {
    const pairs = Array.from({ length: 25 }, (_, i) => ({
      projectId: `p${i % 5}`,
      userEmail: `user${i}@hermosillo.com`,
      count: i + 1,
    }));
    const rows = assembleFolderScopedActivity(pairs, []);
    expect(rows.length).toBe(pairs.length);
  });

  it("resolves userName from AccDcUser, falling back to the email when unmatched", () => {
    const pairs = [
      { projectId: "p1", userEmail: "known@hermosillo.com", count: 3 },
      { projectId: "p1", userEmail: "unknown@hermosillo.com", count: 1 },
    ];
    const users = [{ email: "known@hermosillo.com", name: "Known Person" }];
    const rows = assembleFolderScopedActivity(pairs, users);
    expect(rows.find((r) => r.userEmail === "known@hermosillo.com")?.userName).toBe("Known Person");
    expect(rows.find((r) => r.userEmail === "unknown@hermosillo.com")?.userName).toBe("unknown@hermosillo.com");
  });

  it("matches AccDcUser case-insensitively on email", () => {
    const pairs = [{ projectId: "p1", userEmail: "Mixed@Hermosillo.com", count: 1 }];
    const users = [{ email: "mixed@hermosillo.com", name: "Mixed Case" }];
    const rows = assembleFolderScopedActivity(pairs, users);
    expect(rows[0].userName).toBe("Mixed Case");
  });

  it("falls back to the email when AccDcUser has a null name", () => {
    const pairs = [{ projectId: "p1", userEmail: "noname@hermosillo.com", count: 1 }];
    const users = [{ email: "noname@hermosillo.com", name: null }];
    const rows = assembleFolderScopedActivity(pairs, users);
    expect(rows[0].userName).toBe("noname@hermosillo.com");
  });
});

// ---------------------------------------------------------------------------
// collapseFolderSlices — top-N + "Other (N folders)" collapse helper
// ---------------------------------------------------------------------------

describe("collapseFolderSlices", () => {
  it("returns all rows unchanged when at or below topN", () => {
    const rows = [
      { folderName: "A", count: 3 },
      { folderName: "B", count: 5 },
    ];
    expect(collapseFolderSlices(rows, 15)).toHaveLength(2);
  });

  it("collapses the remainder beyond topN into a single 'Other (N folders)' row, capping at topN + 1", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ folderName: `Folder ${i}`, count: 20 - i }));
    const collapsed = collapseFolderSlices(rows, 15);
    expect(collapsed.length).toBeLessThanOrEqual(16);
    expect(collapsed.length).toBe(16);
    const other = collapsed[collapsed.length - 1];
    expect(other.folderName).toBe("Other (5 folders)");
    // Lossless: aggregated Other count = sum of the 5 collapsed rows' counts (5+4+3+2+1).
    expect(other.count).toBe(5 + 4 + 3 + 2 + 1);
  });

  it("sorts kept rows by count desc before collapsing", () => {
    const rows = [
      { folderName: "Low", count: 1 },
      { folderName: "High", count: 10 },
      { folderName: "Mid", count: 5 },
    ];
    const collapsed = collapseFolderSlices(rows, 2);
    expect(collapsed.map((r) => r.folderName)).toEqual(["High", "Mid", "Other (1 folders)"]);
  });

  it("defaults topN to 15 when not passed", () => {
    const rows = Array.from({ length: 16 }, (_, i) => ({ folderName: `Folder ${i}`, count: 16 - i }));
    const collapsed = collapseFolderSlices(rows);
    expect(collapsed).toHaveLength(16); // 15 kept + 1 "Other (1 folders)"
    expect(collapsed[15].folderName).toBe("Other (1 folders)");
  });
});
