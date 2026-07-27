import { describe, it, expect } from "vitest";
import { summarizeFolderActivityByCompany } from "../folderActivityByCompanyCounts";
import { UNKNOWN_COMPANY } from "../companyCounts";
import type { ActivityActorInput, MembershipCompanyInput } from "../companyActivityCounts";

function activity(over: Partial<ActivityActorInput>): ActivityActorInput {
  return { projectId: "p1", userEmail: "user@hermosillo.com", userName: "User", count: 1, ...over };
}
function membership(over: Partial<MembershipCompanyInput>): MembershipCompanyInput {
  return { projectId: "p1", email: "user@hermosillo.com", company: "Acme", ...over };
}

describe("summarizeFolderActivityByCompany", () => {
  it("reuses summarizeActivityByCompany semantics: activity with no membership buckets into UNKNOWN_COMPANY", () => {
    const activityRows = [activity({ userEmail: "nobody@hermosillo.com", count: 5 })];
    const summary = summarizeFolderActivityByCompany(activityRows, []);
    const unknown = summary.bars.find((b) => b.company === UNKNOWN_COMPANY);
    expect(unknown).toBeDefined();
    expect(unknown!.count).toBe(5);
    expect(summary.total).toBe(5);
  });

  it("keeps top-N companies as individual bars and collapses the remainder into 'Other (N companies)'", () => {
    const companies = Array.from({ length: 12 }, (_, i) => `Company ${i}`);
    const activityRows = companies.map((c, i) =>
      activity({ userEmail: `${c.toLowerCase().replace(/\s/g, "")}@x.com`, count: 100 - i }),
    );
    const membershipRows = companies.map((c) =>
      membership({ email: `${c.toLowerCase().replace(/\s/g, "")}@x.com`, company: c }),
    );
    const summary = summarizeFolderActivityByCompany(activityRows, membershipRows, 10);
    expect(summary.bars.length).toBeLessThanOrEqual(11);
    const other = summary.bars.find((b) => b.company.startsWith("Other ("));
    expect(other).toBeDefined();
    expect(other!.company).toBe("Other (2 companies)");
    expect(other!.memberEmails).toEqual([]);
  });

  it("bars.length never exceeds topN + 1", () => {
    const companies = Array.from({ length: 25 }, (_, i) => `Company ${i}`);
    const activityRows = companies.map((c, i) =>
      activity({ userEmail: `${c.toLowerCase().replace(/\s/g, "")}@x.com`, count: 25 - i }),
    );
    const membershipRows = companies.map((c) =>
      membership({ email: `${c.toLowerCase().replace(/\s/g, "")}@x.com`, company: c }),
    );
    const summary = summarizeFolderActivityByCompany(activityRows, membershipRows, 10);
    expect(summary.bars.length).toBeLessThanOrEqual(11);
  });

  it("memberEmails on each bar match that company's usersByCompany drill list", () => {
    const activityRows = [
      activity({ userEmail: "a@acme.com", userName: "Alice", count: 3 }),
      activity({ userEmail: "b@acme.com", userName: "Bob", count: 2 }),
    ];
    const membershipRows = [
      membership({ email: "a@acme.com", company: "Acme" }),
      membership({ email: "b@acme.com", company: "Acme" }),
    ];
    const summary = summarizeFolderActivityByCompany(activityRows, membershipRows);
    const acme = summary.bars.find((b) => b.company === "Acme")!;
    const drillEmails = (summary.usersByCompany.get("Acme") ?? []).map((u) => u.email);
    expect([...acme.memberEmails].sort()).toEqual([...drillEmails].sort());
    expect(acme.memberEmails).toContain("a@acme.com");
    expect(acme.memberEmails).toContain("b@acme.com");
  });

  it("never drops UNKNOWN_COMPANY's activity, even when it collapses into Other — total stays lossless", () => {
    // 11 real companies (rank above Unknown) + Unknown last, so Unknown lands beyond topN=10.
    const companies = Array.from({ length: 11 }, (_, i) => `Company ${i}`);
    const activityRows: ActivityActorInput[] = companies.map((c, i) =>
      activity({ userEmail: `${c.toLowerCase().replace(/\s/g, "")}@x.com`, count: 100 - i }),
    );
    const membershipRows: MembershipCompanyInput[] = companies.map((c) =>
      membership({ email: `${c.toLowerCase().replace(/\s/g, "")}@x.com`, company: c }),
    );
    // Unknown-company activity: no membership row, low count so it ranks last.
    activityRows.push(activity({ userEmail: "ghost@nowhere.com", count: 1 }));

    const summary = summarizeFolderActivityByCompany(activityRows, membershipRows, 10);

    // Lossless: sum of bar counts (incl. the collapsed Other bucket) equals total.
    const sum = summary.bars.reduce((s, b) => s + b.count, 0);
    expect(sum).toBe(summary.total);

    // UNKNOWN_COMPANY never appears as its own top-level bar here (it ranked last)...
    expect(summary.bars.find((b) => b.company === UNKNOWN_COMPANY)).toBeUndefined();
    // ...but its activity (count 1) is folded into the Other bucket, not dropped.
    const other = summary.bars.find((b) => b.company.startsWith("Other ("));
    expect(other).toBeDefined();
    expect(other!.count).toBeGreaterThanOrEqual(1);
  });

  it("UNKNOWN_COMPANY renders as its own bar when it ranks within top-N", () => {
    const activityRows = [
      activity({ userEmail: "ghost@nowhere.com", count: 50 }), // no membership -> Unknown, high count
      activity({ userEmail: "a@acme.com", count: 5 }),
    ];
    const membershipRows = [membership({ email: "a@acme.com", company: "Acme" })];
    const summary = summarizeFolderActivityByCompany(activityRows, membershipRows, 10);
    const unknown = summary.bars.find((b) => b.company === UNKNOWN_COMPANY);
    expect(unknown).toBeDefined();
    expect(unknown!.count).toBe(50);
  });
});
