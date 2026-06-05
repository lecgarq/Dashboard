// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/server/accessInstanceView", () => ({
  loadInstanceView: vi.fn(async () => ([
    // Multi-role on one membership -> "Multiple roles".
    { projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com", name: "Ana",
      isInternal: true, isAdmin: true, status: "active", addedOn: "2024-01-01", company: "Hermosillo",
      roles: ["Admin", "Member"], modules: ["build"], adminModules: ["build"] },
    // Single role -> "Member".
    { projectId: "p2", projectName: "Tower B", userId: "u2", email: "b@acme.com", name: "Bob",
      isInternal: false, isAdmin: false, status: "active", addedOn: "2024-02-01", company: "Acme",
      roles: ["Member"], modules: ["insight"], adminModules: [] },
    // No role -> "Unknown".
    { projectId: "p3", projectName: "Tower C", userId: "u3", email: "c@acme.com", name: "Cara",
      isInternal: false, isAdmin: false, status: "active", addedOn: "2024-03-01", company: "Acme",
      roles: [], modules: [], adminModules: [] },
  ])),
}));
// Empty activity -> the modules donut renders its empty state (no second echart),
// keeping this test focused on the roles donut.
vi.mock("@/lib/server/moduleActivityView", () => ({
  loadModuleActivity: vi.fn(async () => []),
}));
vi.mock("@/lib/server/coordinationByProjectView", () => ({
  loadCoordinationByProject: () => Promise.resolve({ rows: [], accessibleProjects: 0, forbiddenProjects: 0 }),
}));
/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const series = props.option.series?.[0]?.data ?? [];
    const titles = Array.isArray(props.option.title) ? props.option.title : [props.option.title];
    const subtexts = titles.map((t: any) => t?.subtext).filter(Boolean).join(" | ");
    return (
      <div
        data-testid="echart"
        data-slices={series.length}
        data-names={series.map((d: any) => d.name).join("|")}
        data-subtexts={subtexts}
      />
    );
  },
}));

import AccessAnalysisRoute from "./page";

describe("AccessAnalysisRoute (roles donut)", () => {
  it("buckets single role, Multiple roles, and Unknown, and reports the role count", async () => {
    const ui = await AccessAnalysisRoute();
    const { getByTestId, getByText } = render(ui);
    const el = getByTestId("echart");
    expect(el.getAttribute("data-slices")).toBe("3");
    const names = el.getAttribute("data-names")!.split("|");
    expect(names).toContain("Member");
    expect(names).toContain("Multiple roles");
    expect(names).toContain("Unknown");
    // Distinct roles seen anywhere = Admin, Member = 2.
    expect(el.getAttribute("data-subtexts")).toContain("2 roles");
    expect(getByText("Access Analysis")).toBeTruthy();
    // The modules section is wired in below the roles donut.
    expect(getByText(/Module activity/)).toBeTruthy();
  });
});
