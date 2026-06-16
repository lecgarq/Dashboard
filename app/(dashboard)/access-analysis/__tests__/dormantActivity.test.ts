import { describe, it, expect } from "vitest";
import { rankDormantByPeople } from "../dormantActivity";

/** n distinct people, each holding one seat. */
const P = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ email: `u${i}@x.com`, name: `U${i}`, count: 1 }));

describe("rankDormantByPeople", () => {
  it("keeps only entities with members but no activity, ranked by headcount desc", () => {
    const members = new Map([
      ["PICSA", P(3)],
      ["Estructure", P(1)],
      ["Hermosillo", P(5)], // active → excluded
      ["Unknown company", P(2)], // excluded bucket
    ]);
    const active = new Set(["Hermosillo"]);
    const excluded = new Set(["Unknown company"]);
    const out = rankDormantByPeople(members, active, excluded);
    expect(out.map((d) => [d.label, d.userCount])).toEqual([
      ["PICSA", 3],
      ["Estructure", 1],
    ]);
  });

  it("breaks headcount ties alphabetically", () => {
    const members = new Map([["Beta", P(2)], ["Alpha", P(2)]]);
    const out = rankDormantByPeople(members, new Set(), new Set());
    expect(out.map((d) => d.label)).toEqual(["Alpha", "Beta"]);
  });

  it("carries the people list for drill-through (with their seat counts)", () => {
    const members = new Map([["PICSA", [{ email: "a@x.com", name: "Ana", count: 2 }]]]);
    const out = rankDormantByPeople(members, new Set(), new Set());
    expect(out[0]).toEqual({
      label: "PICSA",
      userCount: 1,
      people: [{ email: "a@x.com", name: "Ana", count: 2 }],
    });
  });

  it("returns empty when every entity has activity", () => {
    const members = new Map([["A", P(1)], ["B", P(1)]]);
    expect(rankDormantByPeople(members, new Set(["A", "B"]), new Set())).toEqual([]);
  });
});
