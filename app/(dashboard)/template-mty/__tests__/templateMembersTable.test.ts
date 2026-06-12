import { describe, it, expect } from "vitest";
import { filterMembers, sortMembers } from "../templateMembersTable";
import type { TemplateMember } from "@/lib/server/templateView";

const m = (over: Partial<TemplateMember>): TemplateMember => ({
  name: "X", email: "x@x.com", company: "Co", role: "R",
  accessLevel: "Project Member", isInternal: true, isAdmin: false, ...over,
});

const members: TemplateMember[] = [
  m({ name: "Alberto", email: "alberto@hermosillo.com", company: "Hermosillo", role: "Core", isInternal: true, isAdmin: true, accessLevel: "Project Admin" }),
  m({ name: "Beatriz", email: "bea@outside.com", company: "Outside", role: "Designer", isInternal: false, isAdmin: false }),
  m({ name: "Carlos", email: "carlos@hermosillo.com", company: "Hermosillo", role: "Modeler", isInternal: true, isAdmin: false }),
];

describe("filterMembers", () => {
  it("matches name/email/role/company on search (case-insensitive)", () => {
    expect(filterMembers(members, "alberto", "all").map((x) => x.name)).toEqual(["Alberto"]);
    expect(filterMembers(members, "DESIGNER", "all").map((x) => x.name)).toEqual(["Beatriz"]);
    expect(filterMembers(members, "hermosillo", "all").map((x) => x.name)).toEqual(["Alberto", "Carlos"]);
  });
  it("internal/external/admin chips filter", () => {
    expect(filterMembers(members, "", "internal").map((x) => x.name)).toEqual(["Alberto", "Carlos"]);
    expect(filterMembers(members, "", "external").map((x) => x.name)).toEqual(["Beatriz"]);
    expect(filterMembers(members, "", "admin").map((x) => x.name)).toEqual(["Alberto"]);
  });
  it("combines chip + search", () => {
    expect(filterMembers(members, "carlos", "internal").map((x) => x.name)).toEqual(["Carlos"]);
    expect(filterMembers(members, "carlos", "external")).toEqual([]);
  });
});

describe("sortMembers", () => {
  it("sorts by name asc and desc without mutating input", () => {
    const asc = sortMembers(members, "name", "asc").map((x) => x.name);
    expect(asc).toEqual(["Alberto", "Beatriz", "Carlos"]);
    expect(sortMembers(members, "name", "desc").map((x) => x.name)).toEqual(["Carlos", "Beatriz", "Alberto"]);
    expect(members[0].name).toBe("Alberto"); // input untouched
  });
  it("sorts by origin (External sorts before Internal asc)", () => {
    const names = sortMembers(members, "origin", "asc").map((x) => x.name);
    expect(names[0]).toBe("Beatriz"); // the only External member leads in asc
  });
});
