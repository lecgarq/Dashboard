import { describe, it, expect } from "vitest";
import { buildInstanceView, mergeRoleNames, type RawDc } from "./accessInstanceView";

describe("mergeRoleNames", () => {
  it("falls back to live AccRole names when the DC snapshot table is empty (the roles=0 regression)", () => {
    const merged = mergeRoleNames(
      [], // accDcRole is empty in production — this is the bug condition
      [{ id: "r1", name: "Construction Manager" }, { id: "r2", name: "MEP Consultant" }],
    );
    expect(merged.get("r1")).toBe("Construction Manager");
    expect(merged.get("r2")).toBe("MEP Consultant");
  });

  it("lets the DC snapshot name win when both sources have the same roleId", () => {
    const merged = mergeRoleNames(
      [{ id: "r1", name: "DC Name" }],
      [{ id: "r1", name: "Live Name" }],
    );
    expect(merged.get("r1")).toBe("DC Name"); // DC wins per snapshot architecture
  });
});

describe("buildInstanceView role resolution", () => {
  const raw: RawDc = {
    projectUsers: [{ projectId: "p1", userId: "u1", status: "active", addedOn: null }],
    users: [{ id: "u1", email: "a@hermosillo.com", name: "A" }],
    projects: [{ id: "p1", name: "Tower" }],
    products: [],
    roles: [{ projectId: "p1", userId: "u1", roleId: "r1" }],
    roleNames: [{ id: "r1", name: "Construction Manager" }],
    companies: [],
    companyNames: [],
  };

  it("resolves the role name onto the instance", () => {
    const [inst] = buildInstanceView(raw);
    expect(inst.roles).toEqual(["Construction Manager"]);
  });

  it("drops an assignment when no name source has the roleId (documents the silent-drop join)", () => {
    const [inst] = buildInstanceView({ ...raw, roleNames: [] });
    expect(inst.roles).toEqual([]);
  });
});
