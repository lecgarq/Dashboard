import { describe, it, expect } from "vitest";
import { accMembersRouter } from "./acc-members";

describe("accMembersRouter KPI", () => {
  it("registers getKpiSummary", () => {
    const procedures = Object.keys(accMembersRouter._def.procedures);
    expect(procedures).toContain("getKpiSummary");
  });

  it("registers enrichedUsers (Phase 5.1 contract unchanged)", () => {
    const procedures = Object.keys(accMembersRouter._def.procedures);
    expect(procedures).toContain("enrichedUsers");
  });

  it("registers getProductsForUser (Phase 09 LIST-04)", () => {
    const procedures = Object.keys(accMembersRouter._def.procedures);
    expect(procedures).toContain("getProductsForUser");
  });
});
