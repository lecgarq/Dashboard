import { describe, it, expect } from "vitest";
import { accActivityRouter } from "./acc-activity";

describe("accActivityRouter timeline procedures", () => {
  it("registers getTimeline", () => {
    const procedures = Object.keys(accActivityRouter._def.procedures);
    expect(procedures).toContain("getTimeline");
  });

  it("registers getHeadlineEvent", () => {
    const procedures = Object.keys(accActivityRouter._def.procedures);
    expect(procedures).toContain("getHeadlineEvent");
  });
});
