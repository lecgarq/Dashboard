import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  BUCKET_LABELS,
  computeStrictPurgeThreshold,
  reviseAuditRow,
} = require("./tolerance-audit.cjs") as {
  BUCKET_LABELS: string[];
  computeStrictPurgeThreshold: (counts: Record<string, number>) => {
    dominantRange: string | null;
    dominantRangeCount: number;
    suggestedMin: number | null;
    suggestedMax: number | null;
    purgeCandidateCount: number;
    manualReviewCount: number;
    manualReviewRule: string;
  };
  reviseAuditRow: (row: Record<string, unknown>) => Record<string, unknown>;
};

function counts(values: Partial<Record<string, number>>) {
  return Object.fromEntries(BUCKET_LABELS.map((label) => [label, values[label] ?? 0]));
}

describe("strict tolerance audit purge threshold", () => {
  it("uses only 0-30 mm buckets, ties to lower bucket, and stops below 25 percent", () => {
    const result = computeStrictPurgeThreshold(
      counts({
        "0-2 mm": 8,
        "2-4 mm": 8,
        "4-6 mm": 2,
        "6-8 mm": 1,
        "30-32 mm": 100,
        ">50 mm": 7,
      }),
    );

    expect(result.dominantRange).toBe("0-2 mm");
    expect(result.dominantRangeCount).toBe(8);
    expect(result.suggestedMin).toBe(0);
    expect(result.suggestedMax).toBe(6);
    expect(result.purgeCandidateCount).toBe(18);
    expect(result.manualReviewCount).toBe(108);
    expect(result.manualReviewRule).toBe("> 6 mm");
  });

  it("matches the expected strict-mode outcomes from the audit brief", () => {
    const cases = [
      {
        category: "Air Terminals",
        expectedDominant: "0-2 mm",
        expectedMax: 2,
        counts: { "0-2 mm": 60, "2-4 mm": 4, "4-6 mm": 2, ">50 mm": 9 },
      },
      {
        category: "Conduits",
        expectedDominant: "2-4 mm",
        expectedMax: 4,
        counts: { "0-2 mm": 225, "2-4 mm": 2145, "4-6 mm": 484, ">50 mm": 211 },
      },
      {
        category: "Electrical Fixtures",
        expectedDominant: "4-6 mm",
        expectedMax: 6,
        counts: { "0-2 mm": 73, "2-4 mm": 40, "4-6 mm": 615, "6-8 mm": 51 },
      },
      {
        category: "Structural Rebar",
        expectedDominant: "4-6 mm",
        expectedMax: 16,
        counts: {
          "0-2 mm": 1219,
          "2-4 mm": 3110,
          "4-6 mm": 5330,
          "6-8 mm": 4414,
          "8-10 mm": 3397,
          "10-12 mm": 3685,
          "12-14 mm": 2615,
          "14-16 mm": 1906,
          "16-18 mm": 557,
        },
      },
    ];

    for (const testCase of cases) {
      const result = computeStrictPurgeThreshold(counts(testCase.counts));

      expect(
        {
          category: testCase.category,
          dominantRange: result.dominantRange,
          suggestedMax: result.suggestedMax,
        },
      ).toEqual({
        category: testCase.category,
        dominantRange: testCase.expectedDominant,
        suggestedMax: testCase.expectedMax,
      });
    }
  });

  it("does not duplicate generated note fragments on repeated audit refreshes", () => {
    const firstPass = reviseAuditRow({
      Category: "Air Terminals",
      "Discipline Model": "Mechanical",
      "Appears in ACC Clashes": "Yes",
      ...counts({ "0-2 mm": 60, "2-4 mm": 4, ">50 mm": 9 }),
      Notes: "Aggregated across 1 Selection A model; Dominant bucket 0-2 mm (60/73)",
    });

    const secondPass = reviseAuditRow(firstPass);
    const notes = String(secondPass.Notes);

    expect(notes.match(/Strict purge threshold/g)).toHaveLength(1);
    expect(notes.match(/Dominant purge range/g)).toHaveLength(1);
    expect(notes.match(/Purge candidates/g)).toHaveLength(1);
    expect(notes.match(/Manual review rule/g)).toHaveLength(1);
  });
});
