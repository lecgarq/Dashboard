import { describe, it, expect } from "vitest";
import { summarizeCompanies, collapseCompanySlices, UNKNOWN_COMPANY } from "../companyCounts";

describe("summarizeCompanies", () => {
  it("returns an empty summary for no rows", () => {
    expect(summarizeCompanies([])).toEqual({ slices: [], distinctCompanies: 0, total: 0, usersByCompany: new Map() });
  });

  it("buckets memberships by company and tallies counts", () => {
    const s = summarizeCompanies([
      { company: "Hermosillo" }, { company: "Hermosillo" },
      { company: "Estructure" },
      { company: null },   // -> Unknown company
      { company: "  " },   // blank -> Unknown company
    ]);
    expect(s.total).toBe(5);
    expect(s.slices).toEqual([
      { name: "Hermosillo", value: 2 },
      { name: UNKNOWN_COMPANY, value: 2 },
      { name: "Estructure", value: 1 },
    ]);
  });

  it("counts distinct real company names, excluding Unknown company", () => {
    const s = summarizeCompanies([
      { company: "Hermosillo" }, { company: "Estructure" }, { company: "PICSA" }, { company: null },
    ]);
    expect(s.distinctCompanies).toBe(3);
  });

  it("treats undefined company as Unknown company", () => {
    const s = summarizeCompanies([{}, { company: undefined }]);
    expect(s.slices).toEqual([{ name: UNKNOWN_COMPANY, value: 2 }]);
    expect(s.distinctCompanies).toBe(0);
  });

  it("collects the people behind each company bucket (seat count per person)", () => {
    const s = summarizeCompanies([
      { company: "Hermosillo", name: "Ana", email: "ana@x.com" },
      { company: "Hermosillo", name: "Ana", email: "ana@x.com" }, // same person, 2nd seat
      { company: "Hermosillo", name: "Bo", email: "bo@x.com" },
      { company: null, name: "Di", email: "di@x.com" }, // -> Unknown company
    ]);
    expect(s.usersByCompany.get("Hermosillo")).toEqual([
      { email: "ana@x.com", name: "Ana", count: 2 },
      { email: "bo@x.com", name: "Bo", count: 1 },
    ]);
    expect(s.usersByCompany.get(UNKNOWN_COMPANY)).toEqual([{ email: "di@x.com", name: "Di", count: 1 }]);
    const seats = s.usersByCompany.get("Hermosillo")!.reduce((n, p) => n + p.count, 0);
    expect(seats).toBe(s.slices.find((x) => x.name === "Hermosillo")!.value);
  });

  it("leaves the people list empty when rows carry no email (back-compat)", () => {
    const s = summarizeCompanies([{ company: "Hermosillo" }, { company: "Hermosillo" }]);
    expect(s.slices).toEqual([{ name: "Hermosillo", value: 2 }]);
    expect(s.usersByCompany.size).toBe(0);
  });
});

describe("collapseCompanySlices", () => {
  const slices = [
    { name: UNKNOWN_COMPANY, value: 100 },
    { name: "A", value: 30 },
    { name: "B", value: 20 },
    { name: "C", value: 10 },
    { name: "D", value: 5 },
    { name: "E", value: 1 },
  ];

  it("pins Unknown company, keeps the top N, folds the rest into Others", () => {
    expect(collapseCompanySlices(slices, 2)).toEqual([
      { name: UNKNOWN_COMPANY, value: 100 },
      { name: "A", value: 30 },
      { name: "B", value: 20 },
      { name: "Others (3 companies)", value: 16 }, // C+D+E
    ]);
  });

  it("never folds the Unknown company bucket, even at top 1", () => {
    const out = collapseCompanySlices(slices, 1);
    // Kept: A (30). Others = B+C+D+E = 36, which outranks A.
    expect(out.map((s) => s.name)).toEqual([UNKNOWN_COMPANY, "Others (4 companies)", "A"]);
  });

  it("adds no Others slice when topN covers every company", () => {
    const out = collapseCompanySlices(slices, 10);
    expect(out.some((s) => s.name.startsWith("Others"))).toBe(false);
    expect(out).toHaveLength(slices.length);
  });

  it("uses singular wording for a single leftover company", () => {
    expect(collapseCompanySlices(slices, 4).find((s) => s.name.startsWith("Others"))).toEqual({
      name: "Others (1 company)",
      value: 1,
    });
  });
});
