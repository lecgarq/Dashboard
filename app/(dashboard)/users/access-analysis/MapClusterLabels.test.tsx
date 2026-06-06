import { describe, it, expect } from "vitest";
import { visibleLabelClusters } from "./MapClusterLabels";
import type { LegendEntry } from "./bucketedColors";

const legend: LegendEntry[] = [
  { label: "Reviewers", color: [0, 0, 0], count: 80 },
  { label: "Admins", color: [0, 0, 0], count: 50 },
  { label: "Other", color: [0, 0, 0], count: 30, isOther: true },
];

describe("visibleLabelClusters", () => {
  it("returns cluster indices whose label is a non-Other legend entry, ranked by count desc", () => {
    // labels by cluster index: Admins=0, Reviewers=1, Tiny=2, Other=3.
    // Tiny (not in legend) and Other (isOther) are excluded; remaining ranked by
    // legend count desc → Reviewers(80, idx 1) before Admins(50, idx 0).
    const labels = ["Admins", "Reviewers", "Tiny", "Other"];
    expect(visibleLabelClusters(labels, legend)).toEqual([1, 0]);
  });

  it("caps the result to max (keeping the highest-count clusters)", () => {
    const labels = ["Reviewers", "Admins"];
    expect(visibleLabelClusters(labels, legend, 1)).toEqual([0]); // Reviewers (count 80)
  });

  it("returns [] when no cluster label matches a non-Other legend entry", () => {
    expect(visibleLabelClusters(["X", "Y"], legend)).toEqual([]);
    expect(visibleLabelClusters(["Other"], legend)).toEqual([]);
  });
});
