import { describe, it, expect } from "vitest";
import { DEFAULT_FORMA_ROLES, FORMA_GROUPS } from "./defaultRoles";

describe("default forma roles", () => {
  it("has 25 roles", () => {
    expect(DEFAULT_FORMA_ROLES).toHaveLength(25);
  });

  it("every role has a unique slug id", () => {
    const ids = DEFAULT_FORMA_ROLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("every role's group is one of the declared FORMA_GROUPS", () => {
    for (const r of DEFAULT_FORMA_ROLES) expect(FORMA_GROUPS).toContain(r.group);
  });

  it("covers all 9 groups", () => {
    expect(new Set(DEFAULT_FORMA_ROLES.map((r) => r.group)).size).toBe(9);
    expect(FORMA_GROUPS).toHaveLength(9);
  });
});
