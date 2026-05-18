import { describe, it, expect } from "vitest";
import { reduceMemberStatus } from "./accStatusReduction";

describe("reduceMemberStatus", () => {
  it("returns 'deleted' for an empty array", () => {
    expect(reduceMemberStatus([])).toBe("deleted");
  });

  it("returns 'active' for ['active']", () => {
    expect(reduceMemberStatus(["active"])).toBe("active");
  });

  it("returns 'pending' for ['pending']", () => {
    expect(reduceMemberStatus(["pending"])).toBe("pending");
  });

  it("returns 'deleted' for ['deleted']", () => {
    expect(reduceMemberStatus(["deleted"])).toBe("deleted");
  });

  it("returns 'pending' for ['pending','deleted'] (pending wins over deleted)", () => {
    expect(reduceMemberStatus(["pending", "deleted"])).toBe("pending");
  });

  it("returns 'active' for ['active','pending','deleted'] (active wins overall)", () => {
    expect(reduceMemberStatus(["active", "pending", "deleted"])).toBe("active");
  });

  it("returns 'active' for ['foo','active'] (unknown ignored, active wins)", () => {
    expect(reduceMemberStatus(["foo", "active"])).toBe("active");
  });

  it("returns 'deleted' for all-unknown values", () => {
    expect(reduceMemberStatus(["foo", "bar", "baz"])).toBe("deleted");
  });
});
