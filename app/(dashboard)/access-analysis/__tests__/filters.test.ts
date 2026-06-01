import { describe, it, expect } from "vitest";
import { matchesFilters } from "../filters";
import { EMPTY_FILTERS, type AccessInstance } from "../types";

const base: AccessInstance = {
  projectId: "p1", projectName: "Tower A", userId: "u1",
  email: "ana@hermosillo.com", name: "Ana", isInternal: true, isAdmin: false,
  status: "active", addedOn: "2024-03-01", company: "Hermosillo",
  roles: ["Member"], modules: ["build", "insight"], adminModules: [],
};

describe("matchesFilters", () => {
  it("passes everything with empty filters", () => {
    expect(matchesFilters(base, EMPTY_FILTERS)).toBe(true);
  });
  it("filters by internal/external", () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, internalExternal: "external" })).toBe(false);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, internalExternal: "internal" })).toBe(true);
  });
  it("filters by admin/member", () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, adminMember: "admin" })).toBe(false);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, adminMember: "member" })).toBe(true);
  });
  it("filters by module (any-of)", () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, module: ["datum"] })).toBe(false);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, module: ["datum", "build"] })).toBe(true);
  });
  it("filters by project, company, role (any-of)", () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, projectId: ["p2"] })).toBe(false);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, company: ["Hermosillo"] })).toBe(true);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, role: ["Admin"] })).toBe(false);
  });
  it("filters by addedOn date range", () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, dateFrom: "2024-01-01", dateTo: "2024-12-31" })).toBe(true);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, dateFrom: "2025-01-01" })).toBe(false);
  });
  it("fuzzy search matches name/email/project/company, case-insensitive", () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, search: "tower" })).toBe(true);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, search: "ANA@" })).toBe(true);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, search: "zzz" })).toBe(false);
  });
});
