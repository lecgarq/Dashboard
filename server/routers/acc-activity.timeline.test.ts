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

  it("registers getLastFileActivityBatch (Phase 09 LIST-03 display)", () => {
    const procedures = Object.keys(accActivityRouter._def.procedures);
    expect(procedures).toContain("getLastFileActivityBatch");
  });

  it("registers usersOrderedByLastFileActivity (Phase 09 LIST-03 sort)", () => {
    const procedures = Object.keys(accActivityRouter._def.procedures);
    expect(procedures).toContain("usersOrderedByLastFileActivity");
  });

  it("leaves getFileActivityForUser intact (Phase 03 ACTV-03 contract)", () => {
    const procedures = Object.keys(accActivityRouter._def.procedures);
    expect(procedures).toContain("getFileActivityForUser");
  });
});
