import { describe, expect, it } from "vitest";
import { assembleSignInRecency } from "./signInRecencyView";

describe("assembleSignInRecency", () => {
  const companies = [{ id: "c1", name: "PICSA" }];

  it("resolves name/company and serializes lastSignIn to ISO string", () => {
    const users = [
      { id: "u1", name: "Ana", email: "ana@x.com", companyId: "c1", lastSignIn: new Date("2026-01-01T00:00:00.000Z") },
    ];
    const projectUsers = [{ projectId: "p1", userId: "u1" }];

    const rows = assembleSignInRecency(projectUsers, users, companies);

    expect(rows).toEqual([
      { projectId: "p1", name: "Ana", company: "PICSA", lastSignIn: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("keeps rows whose userId has no AccDcUser match — never drops them", () => {
    const projectUsers = [{ projectId: "p1", userId: "ghost" }];
    const rows = assembleSignInRecency(projectUsers, [], companies);

    expect(rows).toEqual([
      { projectId: "p1", name: "Unknown user", company: "Unknown company", lastSignIn: null },
    ]);
  });

  it("falls back to email when name is null", () => {
    const users = [{ id: "u1", name: null, email: "ana@x.com", companyId: null, lastSignIn: null }];
    const projectUsers = [{ projectId: "p1", userId: "u1" }];
    const rows = assembleSignInRecency(projectUsers, users, companies);

    expect(rows[0].name).toBe("ana@x.com");
  });

  it("uses 'Unknown user' when both name and email are null", () => {
    const users = [{ id: "u1", name: null, email: null, companyId: null, lastSignIn: null }];
    const projectUsers = [{ projectId: "p1", userId: "u1" }];
    const rows = assembleSignInRecency(projectUsers, users, companies);

    expect(rows[0].name).toBe("Unknown user");
  });

  it("uses 'Unknown company' when companyId does not resolve", () => {
    const users = [{ id: "u1", name: "Ana", email: "ana@x.com", companyId: "missing", lastSignIn: null }];
    const projectUsers = [{ projectId: "p1", userId: "u1" }];
    const rows = assembleSignInRecency(projectUsers, users, companies);

    expect(rows[0].company).toBe("Unknown company");
  });

  it("keeps lastSignIn null when the user has never signed in", () => {
    const users = [{ id: "u1", name: "Ana", email: "ana@x.com", companyId: "c1", lastSignIn: null }];
    const projectUsers = [{ projectId: "p1", userId: "u1" }];
    const rows = assembleSignInRecency(projectUsers, users, companies);

    expect(rows[0].lastSignIn).toBeNull();
  });

  it("never throws on JSON.stringify (RSC-boundary-safe)", () => {
    const users = [
      { id: "u1", name: "Ana", email: "ana@x.com", companyId: "c1", lastSignIn: new Date("2025-06-01T00:00:00.000Z") },
      { id: "u2", name: null, email: null, companyId: null, lastSignIn: null },
    ];
    const projectUsers = [
      { projectId: "p1", userId: "u1" },
      { projectId: "p1", userId: "u2" },
      { projectId: "p2", userId: "ghost" },
    ];
    const rows = assembleSignInRecency(projectUsers, users, companies);

    expect(() => JSON.stringify(rows)).not.toThrow();
    expect(rows).toHaveLength(3);
  });
});
