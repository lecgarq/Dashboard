import { describe, it, expect } from "vitest";
import { summarizeActivityByCompany } from "../companyActivityCounts";
import { UNKNOWN_COMPANY } from "../companyCounts";

type Activity = { projectId: string; userEmail: string; userName: string; count: number };
type Membership = { projectId: string; email: string; company: string | null };

const act = (projectId: string, userEmail: string, count: number, userName = userEmail): Activity => ({ projectId, userEmail, userName, count });
const mem = (projectId: string, email: string, company: string | null): Membership => ({ projectId, email, company });

describe("summarizeActivityByCompany", () => {
  it("returns an empty summary for no activity", () => {
    const s = summarizeActivityByCompany([], []);
    expect(s.slices).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.distinctCompanies).toBe(0);
    expect(s.usersByCompany.size).toBe(0);
  });

  it("attributes a user's activity to their company on that project", () => {
    const s = summarizeActivityByCompany(
      [act("p1", "a@x.com", 40, "Ana")],
      [mem("p1", "a@x.com", "Hermosillo")],
    );
    expect(s.slices).toEqual([{ name: "Hermosillo", value: 40 }]);
    expect(s.total).toBe(40);
    expect(s.distinctCompanies).toBe(1);
    expect(s.usersByCompany.get("Hermosillo")).toEqual([{ email: "a@x.com", name: "Ana", count: 40 }]);
  });

  it("buckets activity with no membership into Unknown company", () => {
    const s = summarizeActivityByCompany(
      [act("p1", "ghost@x.com", 7)],
      [mem("p1", "a@x.com", "Hermosillo")],
    );
    expect(s.slices).toEqual([{ name: UNKNOWN_COMPANY, value: 7 }]);
    expect(s.distinctCompanies).toBe(0);
    expect(s.usersByCompany.get(UNKNOWN_COMPANY)).toEqual([{ email: "ghost@x.com", name: "ghost@x.com", count: 7 }]);
  });

  it("buckets activity whose membership has a null company into Unknown company", () => {
    const s = summarizeActivityByCompany(
      [act("p1", "a@x.com", 7)],
      [mem("p1", "a@x.com", null)],
    );
    expect(s.slices).toEqual([{ name: UNKNOWN_COMPANY, value: 7 }]);
  });

  it("matches company per project: same person, different company in each project", () => {
    const s = summarizeActivityByCompany(
      [act("p1", "a@x.com", 10), act("p2", "a@x.com", 5)],
      [mem("p1", "a@x.com", "Hermosillo"), mem("p2", "a@x.com", "Estructure")],
    );
    expect(new Map(s.slices.map((x) => [x.name, x.value]))).toEqual(
      new Map([["Hermosillo", 10], ["Estructure", 5]]),
    );
  });

  it("sums one company across projects and merges a user active in several projects", () => {
    const s = summarizeActivityByCompany(
      [act("p1", "a@x.com", 10, "Ana"), act("p2", "a@x.com", 6, "Ana"), act("p1", "b@x.com", 4, "Ben")],
      [mem("p1", "a@x.com", "Hermosillo"), mem("p2", "a@x.com", "Hermosillo"), mem("p1", "b@x.com", "Hermosillo")],
    );
    expect(s.slices).toEqual([{ name: "Hermosillo", value: 20 }]);
    expect(s.total).toBe(20);
    expect(s.usersByCompany.get("Hermosillo")).toEqual([
      { email: "a@x.com", name: "Ana", count: 16 },
      { email: "b@x.com", name: "Ben", count: 4 },
    ]);
  });

  it("sorts slices by activity volume descending and they sum to total", () => {
    const s = summarizeActivityByCompany(
      [act("p1", "a@x.com", 3), act("p1", "b@x.com", 9), act("p1", "c@x.com", 5)],
      [mem("p1", "a@x.com", "Low"), mem("p1", "b@x.com", "High"), mem("p1", "c@x.com", "Mid")],
    );
    expect(s.slices.map((x) => x.name)).toEqual(["High", "Mid", "Low"]);
    expect(s.slices.reduce((sum, x) => sum + x.value, 0)).toBe(s.total);
    expect(s.total).toBe(17);
  });
});
