import { describe, it, expect } from "vitest";
import { accMembersRouter } from "./acc-members";

describe("accMembersRouter KPI", () => {
  it("registers getKpiSummary", () => {
    const procedures = Object.keys(accMembersRouter._def.procedures);
    expect(procedures).toContain("getKpiSummary");
  });
});
