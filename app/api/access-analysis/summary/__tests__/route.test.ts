import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/server/accessInstanceView", () => ({
  loadInstanceView: vi.fn(async () => ([
    { projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com", name: "A",
      isInternal: true, isAdmin: true, status: "active", addedOn: "2024-01-01", company: "Hermosillo",
      roles: ["Admin"], modules: ["build"], adminModules: ["build"] },
    { projectId: "p1", projectName: "Tower A", userId: "u2", email: "b@acme.com", name: "B",
      isInternal: false, isAdmin: false, status: "pending", addedOn: "2024-02-01", company: "Acme",
      roles: ["Member"], modules: ["insight"], adminModules: [] },
  ])),
}));

import { GET } from "../route";

const call = (filters?: object) => {
  const url = new URL("http://localhost/api/access-analysis/summary");
  if (filters) url.searchParams.set("filters", JSON.stringify(filters));
  return GET(new Request(url));
};

describe("GET /api/access-analysis/summary", () => {
  it("returns the full summary unfiltered", async () => {
    const res = await call();
    const body = await res.json();
    expect(body.counts.access).toBe(2);
    expect(body.composition.internalExternal).toEqual({ internal: 1, external: 1 });
  });
  it("applies filters", async () => {
    const res = await call({ internalExternal: "external" });
    const body = await res.json();
    expect(body.counts.access).toBe(1);
    expect(body.risk.externalMembers).toBe(1);
  });
});
