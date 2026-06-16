import { describe, it, expect } from "vitest";
import { getInitials } from "./getInitials";

describe("getInitials", () => {
  it("uses first + last of a full name", () => {
    expect(getInitials("Ada Lovelace", "x@y.com")).toBe("AL");
  });
  it("uses first two letters of a single name", () => {
    expect(getInitials("Ghost", "x@y.com")).toBe("GH");
  });
  it("derives from the email local-part when name is missing", () => {
    expect(getInitials(null, "john.doe@hermosillo.com")).toBe("JD");
  });
  it("returns a placeholder when nothing is usable", () => {
    expect(getInitials("", "")).toBe("?");
  });
});
