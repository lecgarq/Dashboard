import { describe, it, expect } from "vitest";
import {
  ACTIVITY_RECENCY_BANDS,
  bucketActivityRecency,
  attributeRole,
  summarizeActivityRecencyByRole,
} from "../activityRecencyCounts";
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";
import type { ActivityRecencyRow } from "@/lib/server/activityRecencyView";

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW - n * DAY_MS).toISOString();

function row(overrides: Partial<ActivityRecencyRow>): ActivityRecencyRow {
  return {
    projectId: "p1",
    email: "user@hermosillo.com",
    name: "User",
    company: "Hermosillo",
    roles: [],
    lastActivityAt: null,
    ...overrides,
  };
}

describe("bucketActivityRecency", () => {
  it("boundary edges: 29->[<30d], 30->[30-90d], 90->[30-90d], 91->[90-365d], 365->[90-365d], 366->[>365d]", () => {
    expect(bucketActivityRecency(daysAgo(29), NOW)).toBe("<30d");
    expect(bucketActivityRecency(daysAgo(30), NOW)).toBe("30–90d");
    expect(bucketActivityRecency(daysAgo(90), NOW)).toBe("30–90d");
    expect(bucketActivityRecency(daysAgo(91), NOW)).toBe("90–365d");
    expect(bucketActivityRecency(daysAgo(365), NOW)).toBe("90–365d");
    expect(bucketActivityRecency(daysAgo(366), NOW)).toBe(">365d");
  });

  it("null and garbage strings -> Never active", () => {
    expect(bucketActivityRecency(null, NOW)).toBe("Never active");
    expect(bucketActivityRecency(undefined, NOW)).toBe("Never active");
    expect(bucketActivityRecency("not-a-date", NOW)).toBe("Never active");
    expect(bucketActivityRecency("", NOW)).toBe("Never active");
  });
});

describe("attributeRole", () => {
  it("0 roles -> UNKNOWN_ROLE, 1 -> that role, 2+ -> MULTIPLE_ROLES", () => {
    expect(attributeRole([])).toBe(UNKNOWN_ROLE);
    expect(attributeRole(["BIM Manager"])).toBe("BIM Manager");
    expect(attributeRole(["BIM Manager", "Project Admin"])).toBe(MULTIPLE_ROLES);
    expect(attributeRole(["BIM Manager", "BIM Manager"])).toBe("BIM Manager"); // dedup
  });
});

describe("summarizeActivityRecencyByRole", () => {
  it("all 5 bands always present, zeros kept", () => {
    const summary = summarizeActivityRecencyByRole([], NOW);
    expect(summary.bands.map((b) => b.band)).toEqual([...ACTIVITY_RECENCY_BANDS]);
    expect(summary.bands.every((b) => b.count === 0)).toBe(true);
  });

  it("lossless invariant: sum(band counts) === rows.length AND sum(countsByRole) === rows.length", () => {
    const rows: ActivityRecencyRow[] = [
      row({ roles: ["BIM Manager"], lastActivityAt: daysAgo(5) }),
      row({ roles: ["Project Admin"], lastActivityAt: daysAgo(45) }),
      row({ roles: [], lastActivityAt: daysAgo(400) }),
      row({ roles: ["BIM Manager", "Project Admin"], lastActivityAt: null }),
      row({ roles: ["BIM Manager"], lastActivityAt: null }),
    ];
    const summary = summarizeActivityRecencyByRole(rows, NOW);
    const bandSum = summary.bands.reduce((s, b) => s + b.count, 0);
    expect(bandSum).toBe(rows.length);

    let roleSum = 0;
    for (const counts of summary.countsByRole.values()) {
      roleSum += counts.reduce((s, c) => s + c, 0);
    }
    expect(roleSum).toBe(rows.length);
    expect(summary.total).toBe(rows.length);
  });

  it("usersByBand drill lists sorted oldest-activity-first per dated band", () => {
    const rows: ActivityRecencyRow[] = [
      row({ name: "Newer", roles: ["A"], lastActivityAt: daysAgo(5) }),
      row({ name: "Older", roles: ["A"], lastActivityAt: daysAgo(20) }),
    ];
    const summary = summarizeActivityRecencyByRole(rows, NOW);
    const band = summary.usersByBand.get("<30d")!;
    expect(band.map((p) => p.name)).toEqual(["Older", "Newer"]);
  });

  it("Never active band keeps input order (no date to rank by)", () => {
    const rows: ActivityRecencyRow[] = [
      row({ name: "First", lastActivityAt: null }),
      row({ name: "Second", lastActivityAt: null }),
    ];
    const summary = summarizeActivityRecencyByRole(rows, NOW);
    const band = summary.usersByBand.get("Never active")!;
    expect(band.map((p) => p.name)).toEqual(["First", "Second"]);
  });

  it("top-8 roles + trailing Other roles collapse when more than 8 roles exist", () => {
    // 10 distinct single-role names, each with a distinct membership count so ordering is deterministic.
    const rows: ActivityRecencyRow[] = [];
    const roleCounts = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]; // 10 roles, role-01 largest
    roleCounts.forEach((count, idx) => {
      const roleName = `Role-${idx + 1}`;
      for (let i = 0; i < count; i++) {
        rows.push(row({ roles: [roleName], lastActivityAt: daysAgo(5), name: `${roleName}-user-${i}` }));
      }
    });
    const summary = summarizeActivityRecencyByRole(rows, NOW);

    // Top 8 by count desc: Role-1..Role-8, then "Other roles" folds Role-9 + Role-10 (2+1=3).
    expect(summary.roleNames).toEqual([
      "Role-1", "Role-2", "Role-3", "Role-4", "Role-5", "Role-6", "Role-7", "Role-8", "Other roles",
    ]);
    const otherCounts = summary.countsByRole.get("Other roles")!;
    const otherTotal = otherCounts.reduce((s, c) => s + c, 0);
    expect(otherTotal).toBe(3); // Role-9 (2) + Role-10 (1)

    // Every listed roleName has a countsByRole entry.
    for (const name of summary.roleNames) {
      expect(summary.countsByRole.has(name)).toBe(true);
    }

    // Still lossless overall.
    const bandSum = summary.bands.reduce((s, b) => s + b.count, 0);
    expect(bandSum).toBe(rows.length);
  });

  it("no Other-roles bucket when 8 or fewer distinct roles exist", () => {
    const rows: ActivityRecencyRow[] = [
      row({ roles: ["A"], lastActivityAt: daysAgo(5) }),
      row({ roles: ["B"], lastActivityAt: daysAgo(5) }),
    ];
    const summary = summarizeActivityRecencyByRole(rows, NOW);
    expect(summary.roleNames).not.toContain("Other roles");
    expect(summary.roleNames.sort()).toEqual(["A", "B"]);
  });
});
