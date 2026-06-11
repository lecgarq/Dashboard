import { describe, it, expect } from "vitest";
import { summarizeActivityByRole } from "../roleActivityCounts";
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";

type Activity = { projectId: string; userEmail: string; userName: string; count: number };
type Membership = { projectId: string; email: string; roles: string[] };

const act = (projectId: string, userEmail: string, count: number, userName = userEmail): Activity => ({
  projectId,
  userEmail,
  userName,
  count,
});
const mem = (projectId: string, email: string, roles: string[]): Membership => ({ projectId, email, roles });

describe("summarizeActivityByRole", () => {
  it("returns an empty summary for no activity", () => {
    const s = summarizeActivityByRole([], []);
    expect(s.slices).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.distinctRoles).toBe(0);
    expect(s.usersByRole.size).toBe(0);
  });

  it("attributes a single-role user's activity to that role", () => {
    const s = summarizeActivityByRole(
      [act("p1", "a@x.com", 40, "Ana")],
      [mem("p1", "a@x.com", ["BIM Manager"])],
    );
    expect(s.slices).toEqual([{ name: "BIM Manager", value: 40 }]);
    expect(s.total).toBe(40);
    expect(s.distinctRoles).toBe(1);
    expect(s.usersByRole.get("BIM Manager")).toEqual([{ email: "a@x.com", name: "Ana", count: 40 }]);
  });

  it("buckets a multi-role user's activity into 'Multiple roles'", () => {
    const s = summarizeActivityByRole(
      [act("p1", "a@x.com", 12)],
      [mem("p1", "a@x.com", ["Admin", "Member"])],
    );
    expect(s.slices).toEqual([{ name: MULTIPLE_ROLES, value: 12 }]);
    expect(s.distinctRoles).toBe(0); // multi-role names are not credited as a slice role
    expect(s.usersByRole.get(MULTIPLE_ROLES)).toEqual([{ email: "a@x.com", name: "a@x.com", count: 12 }]);
  });

  it("buckets activity with no membership/role into 'Unknown'", () => {
    const s = summarizeActivityByRole(
      [act("p1", "ghost@x.com", 7)],
      [mem("p1", "a@x.com", ["Member"])], // ghost has no membership here
    );
    expect(s.slices).toEqual([{ name: UNKNOWN_ROLE, value: 7 }]);
    expect(s.usersByRole.get(UNKNOWN_ROLE)).toEqual([{ email: "ghost@x.com", name: "ghost@x.com", count: 7 }]);
  });

  it("matches roles per project: same person, different role in each project", () => {
    const s = summarizeActivityByRole(
      [act("p1", "a@x.com", 10), act("p2", "a@x.com", 5)],
      [mem("p1", "a@x.com", ["Manager"]), mem("p2", "a@x.com", ["Viewer"])],
    );
    expect(new Map(s.slices.map((x) => [x.name, x.value]))).toEqual(
      new Map([["Manager", 10], ["Viewer", 5]]),
    );
  });

  it("sums one role across projects and merges a user active in several projects", () => {
    const s = summarizeActivityByRole(
      [
        act("p1", "a@x.com", 10, "Ana"),
        act("p2", "a@x.com", 6, "Ana"),
        act("p1", "b@x.com", 4, "Ben"),
      ],
      [
        mem("p1", "a@x.com", ["Member"]),
        mem("p2", "a@x.com", ["Member"]),
        mem("p1", "b@x.com", ["Member"]),
      ],
    );
    expect(s.slices).toEqual([{ name: "Member", value: 20 }]);
    expect(s.total).toBe(20);
    // Ana's two projects merge into one row (16), sorted above Ben (4).
    expect(s.usersByRole.get("Member")).toEqual([
      { email: "a@x.com", name: "Ana", count: 16 },
      { email: "b@x.com", name: "Ben", count: 4 },
    ]);
  });

  it("sorts slices by activity volume descending and they sum to total", () => {
    const s = summarizeActivityByRole(
      [act("p1", "a@x.com", 3), act("p1", "b@x.com", 9), act("p1", "c@x.com", 5)],
      [
        mem("p1", "a@x.com", ["Low"]),
        mem("p1", "b@x.com", ["High"]),
        mem("p1", "c@x.com", ["Mid"]),
      ],
    );
    expect(s.slices.map((x) => x.name)).toEqual(["High", "Mid", "Low"]);
    expect(s.slices.reduce((sum, x) => sum + x.value, 0)).toBe(s.total);
    expect(s.total).toBe(17);
  });
});
