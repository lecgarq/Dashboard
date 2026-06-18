import { describe, it, expect, beforeEach, vi } from "vitest";
import type { BulkAccUser, BulkAccProject } from "@/lib/acc/acc-types";
import type { OrgPerson } from "./useMergedAccUsers";

import { buildDirectoryRows, DORMANT_THRESHOLD_DAYS } from "./directoryTableRow";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const person = (overrides: Partial<OrgPerson> = {}): OrgPerson => ({
  resourceName: "people/123",
  displayName: "Ada Lovelace",
  email: "ada@hermosillo.com",
  photoUrl: null,
  department: "Engineering",
  jobTitle: "Architect",
  phoneNumber: null,
  costCenter: null,
  ...overrides,
});

const project = (overrides: Partial<BulkAccProject> = {}): BulkAccProject => ({
  id: "p1",
  name: "MTY Tower A",
  status: "active",
  isAdmin: false,
  roles: [],
  modules: [],
  lastActivity: null,
  ...overrides,
});

const accUser = (overrides: Partial<BulkAccUser> = {}): BulkAccUser => ({
  email: "ada@hermosillo.com",
  name: "Ada Lovelace",
  found: true,
  projectCount: 0,
  activeCount: 0,
  adminCount: 0,
  hasNoProjects: true,
  syncedAt: "2026-06-01T00:00:00.000Z",
  allRoles: [],
  allModules: [],
  projects: [],
  isAccountAdmin: false,
  addedOn: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildDirectoryRows", () => {
  it("derives lastActivity as the max (latest) project.lastActivity across all projects", () => {
    const user = accUser({
      projects: [
        project({ id: "p1", lastActivity: "2026-01-01T00:00:00.000Z" }),
        project({ id: "p2", lastActivity: "2026-06-01T00:00:00.000Z" }),
        project({ id: "p3", lastActivity: null }),
      ],
    });
    const map = new Map([[person().email.toLowerCase(), user]]);
    const rows = buildDirectoryRows([person()], map);
    expect(rows[0].lastActivity).toBe("2026-06-01T00:00:00.000Z");
  });

  it("returns lastActivity=null when EVERY project.lastActivity is null/absent", () => {
    const user = accUser({
      lastSignIn: "2026-06-15T00:00:00.000Z", // must NOT be used
      projects: [
        project({ id: "p1", lastActivity: null }),
        project({ id: "p2" }), // no lastActivity field at all
      ],
    });
    const map = new Map([[person().email.toLowerCase(), user]]);
    const rows = buildDirectoryRows([person()], map);
    expect(rows[0].lastActivity).toBeNull();
  });

  it("ignores BulkAccUser.lastSignIn — recent lastSignIn with all-null project.lastActivity yields null", () => {
    const user = accUser({
      lastSignIn: "2026-06-17T12:00:00.000Z",
      projects: [
        project({ id: "p1", lastActivity: null }),
      ],
    });
    const map = new Map([[person().email.toLowerCase(), user]]);
    const rows = buildDirectoryRows([person()], map);
    // CRITICAL: must NOT fall back to lastSignIn
    expect(rows[0].lastActivity).toBeNull();
  });

  it("derives primaryRole from allRoles[0] and extraRoleCount as max(0, allRoles.length - 1)", () => {
    const user = accUser({ allRoles: ["Architect", "BIM Manager", "Coordinator"] });
    const map = new Map([[person().email.toLowerCase(), user]]);
    const rows = buildDirectoryRows([person()], map);
    expect(rows[0].primaryRole).toBe("Architect");
    expect(rows[0].extraRoleCount).toBe(2);
  });

  it("sets primaryRole=null and extraRoleCount=0 when allRoles is empty", () => {
    const user = accUser({ allRoles: [] });
    const map = new Map([[person().email.toLowerCase(), user]]);
    const rows = buildDirectoryRows([person()], map);
    expect(rows[0].primaryRole).toBeNull();
    expect(rows[0].extraRoleCount).toBe(0);
  });

  it("derives officeCode via the mode (most frequent) officeCodeFor across projects (NO mtyIds)", () => {
    const user = accUser({
      projects: [
        project({ id: "p1", name: "MTY Tower A" }),
        project({ id: "p2", name: "MTY Offices B" }),
        project({ id: "p3", name: "CDMX HQ" }),
      ],
    });
    const map = new Map([[person().email.toLowerCase(), user]]);
    const rows = buildDirectoryRows([person()], map);
    expect(rows[0].officeCode).toBe("MTY");
    expect(rows[0].officeLabel).toBe("Monterrey");
  });

  it("sets officeCode=null and officeLabel=null when user has no projects", () => {
    const user = accUser({ projects: [] });
    const map = new Map([[person().email.toLowerCase(), user]]);
    const rows = buildDirectoryRows([person()], map);
    expect(rows[0].officeCode).toBeNull();
    expect(rows[0].officeLabel).toBeNull();
  });

  it("derives projectCount from the number of project memberships (ALL projects)", () => {
    const user = accUser({
      projects: [
        project({ id: "p1", status: "active" }),
        project({ id: "p2", status: "archived" }),
        project({ id: "p3", status: "inactive" }),
      ],
    });
    const map = new Map([[person().email.toLowerCase(), user]]);
    const rows = buildDirectoryRows([person()], map);
    expect(rows[0].projectCount).toBe(3);
  });

  it("isDormant=true when lastActivity is non-null AND older than 90 days", () => {
    // 91 days ago
    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const user = accUser({
      projects: [project({ id: "p1", lastActivity: ninetyOneDaysAgo })],
    });
    const map = new Map([[person().email.toLowerCase(), user]]);
    const rows = buildDirectoryRows([person()], map);
    expect(rows[0].isDormant).toBe(true);
  });

  it("isDormant=false when lastActivity is recent (within 90 days)", () => {
    const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const user = accUser({
      projects: [project({ id: "p1", lastActivity: recentDate })],
    });
    const map = new Map([[person().email.toLowerCase(), user]]);
    const rows = buildDirectoryRows([person()], map);
    expect(rows[0].isDormant).toBe(false);
  });

  it("isDormant=false (status unknown) when lastActivity is null", () => {
    const user = accUser({
      projects: [project({ id: "p1", lastActivity: null })],
    });
    const map = new Map([[person().email.toLowerCase(), user]]);
    const rows = buildDirectoryRows([person()], map);
    expect(rows[0].isDormant).toBe(false);
  });

  it("falls back gracefully when accSummaryMap has no entry for person.email", () => {
    const emptyMap = new Map<string, BulkAccUser>();
    const rows = buildDirectoryRows([person()], emptyMap);
    expect(rows).toHaveLength(1);
    expect(rows[0].accUser).toBeNull();
    expect(rows[0].projectCount).toBe(0);
    expect(rows[0].lastActivity).toBeNull();
    expect(rows[0].officeCode).toBeNull();
    expect(rows[0].isDormant).toBe(false);
  });

  it("keys the row by resourceName", () => {
    const user = accUser();
    const map = new Map([[person().email.toLowerCase(), user]]);
    const rows = buildDirectoryRows([person()], map);
    expect(rows[0].resourceName).toBe("people/123");
  });

  it("exports DORMANT_THRESHOLD_DAYS = 90", () => {
    expect(DORMANT_THRESHOLD_DAYS).toBe(90);
  });

  it("email lookup is case-insensitive (downcases person.email)", () => {
    const user = accUser({ email: "ada@hermosillo.com" });
    const map = new Map([["ada@hermosillo.com", user]]);
    const p = person({ email: "Ada@Hermosillo.com" }); // uppercase
    const rows = buildDirectoryRows([p], map);
    expect(rows[0].accUser).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // G1 fix: optional lastActivityByEmail override map
  // ---------------------------------------------------------------------------

  it("G1: when lastActivityByEmail map is provided, row.lastActivity comes from the map (not project.lastActivity)", () => {
    // project.lastActivity is stale/wrong; map has the real value
    const user = accUser({
      projects: [project({ id: "p1", lastActivity: "2025-01-01T00:00:00.000Z" })],
    });
    const map = new Map([[person().email.toLowerCase(), user]]);
    const lastActivityByEmail = new Map<string, string | null>([
      ["ada@hermosillo.com", "2026-06-15T12:00:00.000Z"],
    ]);
    const rows = buildDirectoryRows([person()], map, lastActivityByEmail);
    // Must come from the override map, not from project.lastActivity
    expect(rows[0].lastActivity).toBe("2026-06-15T12:00:00.000Z");
  });

  it("G1: when lastActivityByEmail map has null for the email, row.lastActivity is null", () => {
    const user = accUser({
      projects: [project({ id: "p1", lastActivity: "2026-01-01T00:00:00.000Z" })],
    });
    const map = new Map([[person().email.toLowerCase(), user]]);
    const lastActivityByEmail = new Map<string, string | null>([
      ["ada@hermosillo.com", null],
    ]);
    const rows = buildDirectoryRows([person()], map, lastActivityByEmail);
    // Explicit null in map means "no file activity" — must not fall back to project.lastActivity
    expect(rows[0].lastActivity).toBeNull();
  });

  it("G1: when lastActivityByEmail map has no entry for email, row.lastActivity falls back to project.lastActivity", () => {
    const user = accUser({
      projects: [project({ id: "p1", lastActivity: "2026-03-01T00:00:00.000Z" })],
    });
    const emptyMap = new Map<string, string | null>();
    const rows = buildDirectoryRows([person()], new Map([[person().email.toLowerCase(), user]]), emptyMap);
    // No entry → fall back to project.lastActivity
    expect(rows[0].lastActivity).toBe("2026-03-01T00:00:00.000Z");
  });

  it("G1: lastActivityByEmail is case-insensitive (uses lowercased email key)", () => {
    const user = accUser({ projects: [] });
    const accMap = new Map([[person().email.toLowerCase(), user]]);
    const lastActivityByEmail = new Map<string, string | null>([
      // Key is lowercase even if person email might differ
      ["ada@hermosillo.com", "2026-06-10T00:00:00.000Z"],
    ]);
    const p = person({ email: "Ada@Hermosillo.com" }); // uppercase
    const rows = buildDirectoryRows([p], accMap, lastActivityByEmail);
    expect(rows[0].lastActivity).toBe("2026-06-10T00:00:00.000Z");
  });

  it("G1: isDormant recomputed from lastActivityByEmail override (recent map value → not dormant)", () => {
    const recentIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
    const user = accUser({ projects: [] });
    const accMap = new Map([[person().email.toLowerCase(), user]]);
    const lastActivityByEmail = new Map<string, string | null>([
      ["ada@hermosillo.com", recentIso],
    ]);
    const rows = buildDirectoryRows([person()], accMap, lastActivityByEmail);
    expect(rows[0].isDormant).toBe(false);
  });

  it("G1: isDormant recomputed from lastActivityByEmail override (old map value → dormant)", () => {
    const oldIso = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(); // 100 days ago
    const user = accUser({ projects: [] });
    const accMap = new Map([[person().email.toLowerCase(), user]]);
    const lastActivityByEmail = new Map<string, string | null>([
      ["ada@hermosillo.com", oldIso],
    ]);
    const rows = buildDirectoryRows([person()], accMap, lastActivityByEmail);
    expect(rows[0].isDormant).toBe(true);
  });

  it("G1: without lastActivityByEmail param, existing project.lastActivity behavior is unchanged (backward compat)", () => {
    const user = accUser({
      projects: [
        project({ id: "p1", lastActivity: "2026-01-01T00:00:00.000Z" }),
        project({ id: "p2", lastActivity: "2026-06-01T00:00:00.000Z" }),
      ],
    });
    const map = new Map([[person().email.toLowerCase(), user]]);
    // No third argument — old behavior
    const rows = buildDirectoryRows([person()], map);
    expect(rows[0].lastActivity).toBe("2026-06-01T00:00:00.000Z");
  });
});
