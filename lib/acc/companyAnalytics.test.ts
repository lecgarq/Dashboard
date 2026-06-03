import { describe, expect, it } from "vitest";
import { aggregateCompanyStats, classifyFirmType } from "./companyAnalytics";

describe("companyAnalytics", () => {
  it("classifies firm types correctly based on names", () => {
    expect(classifyFirmType("LECG Digital Solutions")).toBe("Internal");
    expect(classifyFirmType("LECG Consulting")).toBe("Internal");
    expect(classifyFirmType("ACME Clients Ltd")).toBe("Partner");
    expect(classifyFirmType("Project Owner Group")).toBe("Partner");
    expect(classifyFirmType("Apex Engineering & Design")).toBe("Consultant");
    expect(classifyFirmType("Super Architect Firm")).toBe("Consultant");
    expect(classifyFirmType("Generic General Contractor")).toBe("External");
  });

  it("aggregates stats for a group of companies, users, and projects", () => {
    const companies = [
      { id: "c1", name: "LECG HQ" },
      { id: "c2", name: "Apex Design Group" },
      { id: "c3", name: "Global Clients" },
    ];

    const users = [
      // 3 users in c1 (Internal)
      { id: "u1", email: "u1@lecg.com", companyId: "c1", activeTier: "7d" as const, activityCount: 150, projectCount: 2 },
      { id: "u2", email: "u2@lecg.com", companyId: "c1", activeTier: "30d" as const, activityCount: 50, projectCount: 1 },
      { id: "u3", email: "u3@lecg.com", companyId: "c1", activeTier: "Never" as const, activityCount: 0, projectCount: 0 },
      // 2 users in c2 (Consultant)
      { id: "u4", email: "u4@apex.com", companyId: "c2", activeTier: "90d" as const, activityCount: 10, projectCount: 1 },
      { id: "u5", email: "u5@apex.com", companyId: "c2", activeTier: "Never" as const, activityCount: 0, projectCount: 0 },
      // 1 user in unassigned
      { id: "u6", email: "u6@gmail.com", companyId: null, activeTier: "30d" as const, activityCount: 5, projectCount: 1 },
    ];

    const projectUserCompanies = [
      // c1 in project A & B
      { companyId: "c1", projectId: "pA", userId: "u1" },
      { companyId: "c1", projectId: "pB", userId: "u1" },
      { companyId: "c1", projectId: "pA", userId: "u2" },
      // c2 in project B
      { companyId: "c2", projectId: "pB", userId: "u4" },
      // unassigned in project C
      { companyId: "unknown_company", projectId: "pC", userId: "u6" },
    ];

    const stats = aggregateCompanyStats({
      companies,
      users,
      projectUserCompanies,
    });

    // We expect 4 records: c1, c2, c3, unknown_company
    expect(stats.length).toBe(4);

    const c1 = stats.find((s) => s.companyId === "c1")!;
    expect(c1.companyName).toBe("LECG HQ");
    expect(c1.firmType).toBe("Internal");
    expect(c1.memberCount).toBe(3);
    expect(c1.projectCount).toBe(2);
    expect(c1.activityCount).toBe(200); // 150 + 50
    expect(c1.activeTiers).toEqual({
      "7d": 1,
      "30d": 1,
      "90d": 0,
      ">90d": 0,
      "Never": 1,
    });

    const c2 = stats.find((s) => s.companyId === "c2")!;
    expect(c2.companyName).toBe("Apex Design Group");
    expect(c2.firmType).toBe("Consultant");
    expect(c2.memberCount).toBe(2);
    expect(c2.projectCount).toBe(1);
    expect(c2.activityCount).toBe(10);
    expect(c2.activeTiers).toEqual({
      "7d": 0,
      "30d": 0,
      "90d": 1,
      ">90d": 0,
      "Never": 1,
    });

    const c3 = stats.find((s) => s.companyId === "c3")!;
    expect(c3.companyName).toBe("Global Clients");
    expect(c3.memberCount).toBe(0); // No members
    expect(c3.projectCount).toBe(0);

    const unassigned = stats.find((s) => s.companyId === "unknown_company")!;
    expect(unassigned.companyName).toBe("Unassigned/Unknown Company");
    expect(unassigned.memberCount).toBe(1);
    expect(unassigned.projectCount).toBe(1);
    expect(unassigned.activityCount).toBe(5);
  });
});
