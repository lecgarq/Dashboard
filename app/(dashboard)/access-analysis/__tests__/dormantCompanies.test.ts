import { describe, it, expect } from "vitest";
import { summarizeDormantCompanies } from "../dormantCompanies";
import { UNKNOWN_COMPANY } from "../companyCounts";

const usersByCompany = new Map<string, Array<{ email: string }>>([
  ["Hermosillo", [{ email: "a@x.com" }, { email: "b@x.com" }]],
  ["Estructure", [{ email: "c@x.com" }]],
  ["PICSA", [{ email: "d@x.com" }, { email: "e@x.com" }, { email: "f@x.com" }]],
  [UNKNOWN_COMPANY, [{ email: "g@x.com" }]], // must never count as a real company
]);

describe("summarizeDormantCompanies", () => {
  it("lists roster companies with no users, excluding tombstones, sorted", () => {
    const roster = ["Hermosillo", "Estructure", "PICSA", "Zeta", "Acme", "removed at 2024-01-01 abc-uuid"];
    const out = summarizeDormantCompanies(roster, usersByCompany, new Set(["Hermosillo", "Estructure", "PICSA"]));
    expect(out.noUsers).toEqual(["Acme", "Zeta"]); // Zeta + Acme have no users; tombstone dropped
  });

  it("ignores the Unknown company bucket when deriving companies-with-users", () => {
    const roster = ["Hermosillo"];
    const out = summarizeDormantCompanies(roster, usersByCompany, new Set(["Hermosillo"]));
    // Unknown company is not a roster name and never appears in noUsers/noActivity.
    expect(out.noUsers).toEqual([]);
    expect(out.noActivity.some((d) => d.company === UNKNOWN_COMPANY)).toBe(false);
  });

  it("lists companies that have users but no activity, with user counts, sorted desc", () => {
    // Only Hermosillo has activity → Estructure (1 user) and PICSA (3 users) are dormant.
    const out = summarizeDormantCompanies(["Hermosillo", "Estructure", "PICSA"], usersByCompany, new Set(["Hermosillo"]));
    expect(out.noActivity).toEqual([
      { company: "PICSA", userCount: 3 },
      { company: "Estructure", userCount: 1 },
    ]);
  });

  it("sorts equal user counts alphabetically", () => {
    const ubc = new Map<string, Array<{ email: string }>>([
      ["Beta", [{ email: "x@x.com" }]],
      ["Alpha", [{ email: "y@y.com" }]],
    ]);
    const out = summarizeDormantCompanies(["Alpha", "Beta"], ubc, new Set());
    expect(out.noActivity.map((d) => d.company)).toEqual(["Alpha", "Beta"]);
  });

  it("de-duplicates roster names and handles empty inputs", () => {
    expect(summarizeDormantCompanies([], new Map(), new Set())).toEqual({ noUsers: [], noActivity: [] });
    const out = summarizeDormantCompanies(["Acme", "Acme"], new Map(), new Set());
    expect(out.noUsers).toEqual(["Acme"]);
  });
});
