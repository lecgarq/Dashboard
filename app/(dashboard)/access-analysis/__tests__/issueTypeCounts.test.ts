import { describe, it, expect } from "vitest";
import { DEFAULT_TOP_N, summarizeIssueType } from "../issueTypeCounts";
import type { IssueFunnelTypeRow } from "@/lib/server/issueFunnelView";

const typeRow = (over: Partial<IssueFunnelTypeRow> = {}): IssueFunnelTypeRow => ({
  projectId: "p1",
  projectName: "Project One",
  issueTypeId: "type-a",
  typeName: "Quality",
  count: 5,
  ...over,
});

describe("summarizeIssueType", () => {
  it("folds types beyond topN into an 'Other (N types)' bucket with correct arithmetic", () => {
    const rows: IssueFunnelTypeRow[] = Array.from({ length: 12 }, (_, i) =>
      typeRow({
        projectId: `p${i}`,
        issueTypeId: `type-${i}`,
        typeName: `Type ${i}`,
        count: 12 - i, // strictly descending so ranking is deterministic
      }),
    );
    const summary = summarizeIssueType(rows, DEFAULT_TOP_N);

    expect(summary.buckets).toHaveLength(DEFAULT_TOP_N + 1);
    const other = summary.buckets[summary.buckets.length - 1];
    expect(other.kind).toBe("other");
    expect(other.label).toBe("Other (2 types)");
    // Other = sum of the 2 folded rows (count 2 + count 1 = 3)
    expect(other.count).toBe(3);
    expect(summary.totalBuckets).toBe(12);
    expect(summary.projectsByBucket[other.key]).toBeUndefined();
  });

  it("ranks the 'Unknown type' bucket by count like any real type — above a smaller named type", () => {
    const rows: IssueFunnelTypeRow[] = [
      typeRow({ projectId: "p1", issueTypeId: "guid-unresolved", typeName: null, count: 50 }),
      typeRow({ projectId: "p2", issueTypeId: "type-a", typeName: "Quality", count: 10 }),
    ];
    const summary = summarizeIssueType(rows, DEFAULT_TOP_N);
    expect(summary.buckets[0].kind).toBe("unknown");
    expect(summary.buckets[0].label).toBe("Unknown type");
    expect(summary.buckets[0].count).toBe(50);
    expect(summary.buckets[1].label).toBe("Quality");
  });

  it("keeps 'Unknown type' (GUID present, unresolved) and 'No type set' (null issueTypeId) as two distinct buckets that never merge", () => {
    const rows: IssueFunnelTypeRow[] = [
      typeRow({ projectId: "p1", issueTypeId: "guid-unresolved", typeName: null, count: 4 }),
      typeRow({ projectId: "p2", issueTypeId: null, typeName: null, count: 6 }),
    ];
    const summary = summarizeIssueType(rows, DEFAULT_TOP_N);
    const byKind = new Map(summary.buckets.map((b) => [b.kind, b]));
    expect(byKind.get("unknown")?.count).toBe(4);
    expect(byKind.get("unknown")?.label).toBe("Unknown type");
    expect(byKind.get("none")?.count).toBe(6);
    expect(byKind.get("none")?.label).toBe("No type set");
    expect(summary.buckets).toHaveLength(2);
  });

  it("is lossless: total equals sum of bucket counts and sum of input row counts, with and without the fold", () => {
    const rows: IssueFunnelTypeRow[] = Array.from({ length: 15 }, (_, i) =>
      typeRow({ projectId: `p${i}`, issueTypeId: `type-${i}`, typeName: `Type ${i}`, count: i + 1 }),
    );
    const inputSum = rows.reduce((sum, r) => sum + r.count, 0);

    const folded = summarizeIssueType(rows, DEFAULT_TOP_N);
    expect(folded.total).toBe(inputSum);
    expect(folded.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(inputSum);

    const expanded = summarizeIssueType(rows, rows.length);
    expect(expanded.total).toBe(inputSum);
    expect(expanded.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(inputSum);
  });

  it("expands in place via topN = rows.length, yielding zero 'other' kind buckets", () => {
    const rows: IssueFunnelTypeRow[] = Array.from({ length: 15 }, (_, i) =>
      typeRow({ projectId: `p${i}`, issueTypeId: `type-${i}`, typeName: `Type ${i}`, count: i + 1 }),
    );
    const expanded = summarizeIssueType(rows, rows.length);
    expect(expanded.buckets.some((b) => b.kind === "other")).toBe(false);
    expect(expanded.buckets).toHaveLength(15);
  });

  it("computes resolvedTypeGuids/totalTypeGuids from distinct GUIDs, not row counts", () => {
    const rows: IssueFunnelTypeRow[] = [
      typeRow({ projectId: "p1", issueTypeId: "type-a", typeName: "Quality", count: 3 }),
      typeRow({ projectId: "p2", issueTypeId: "type-a", typeName: "Quality", count: 7 }), // same GUID, different project
      typeRow({ projectId: "p3", issueTypeId: "type-b", typeName: "Safety", count: 2 }),
      typeRow({ projectId: "p4", issueTypeId: "guid-unresolved", typeName: null, count: 1 }),
      typeRow({ projectId: "p5", issueTypeId: null, typeName: null, count: 9 }),
    ];
    const summary = summarizeIssueType(rows, DEFAULT_TOP_N);
    expect(summary.totalTypeGuids).toBe(3); // type-a, type-b, guid-unresolved (null id excluded)
    expect(summary.resolvedTypeGuids).toBe(2); // type-a, type-b
  });

  it("aggregates counts across projects into one named-type bucket and lists its drill rows sorted count desc then name", () => {
    const rows: IssueFunnelTypeRow[] = [
      typeRow({ projectId: "p1", projectName: "Zeta", issueTypeId: "type-a", typeName: "Quality", count: 5 }),
      typeRow({ projectId: "p2", projectName: "Alpha", issueTypeId: "type-a", typeName: "Quality", count: 5 }),
      typeRow({ projectId: "p3", projectName: "Beta", issueTypeId: "type-a", typeName: "Quality", count: 20 }),
    ];
    const summary = summarizeIssueType(rows, DEFAULT_TOP_N);
    expect(summary.buckets).toHaveLength(1);
    expect(summary.buckets[0].count).toBe(30);
    const drill = summary.projectsByBucket["Quality"];
    expect(drill.map((r) => r.projectId)).toEqual(["p3", "p2", "p1"]);
  });

  it("merges rows sharing the same (projectId, issueTypeId) defensively in the drill map", () => {
    const rows: IssueFunnelTypeRow[] = [
      typeRow({ projectId: "p1", issueTypeId: "type-a", typeName: "Quality", count: 3 }),
      typeRow({ projectId: "p1", issueTypeId: "type-a", typeName: "Quality", count: 4 }),
    ];
    const summary = summarizeIssueType(rows, DEFAULT_TOP_N);
    expect(summary.buckets[0].count).toBe(7);
    expect(summary.projectsByBucket["Quality"]).toEqual([
      { projectId: "p1", projectName: "Project One", count: 7 },
    ]);
  });

  it("handles empty input without throwing: empty buckets, total 0", () => {
    const summary = summarizeIssueType([], DEFAULT_TOP_N);
    expect(summary.buckets).toEqual([]);
    expect(summary.total).toBe(0);
    expect(summary.totalBuckets).toBe(0);
    expect(summary.resolvedTypeGuids).toBe(0);
    expect(summary.totalTypeGuids).toBe(0);
  });
});
