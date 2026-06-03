// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/server/accessInstanceView", () => ({
  loadInstanceView: vi.fn(async () => ([
    // Multi-role on one membership -> one combined "Admin + Member" slice.
    { projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com", name: "Ana",
      isInternal: true, isAdmin: true, status: "active", addedOn: "2024-01-01", company: "Hermosillo",
      roles: ["Admin", "Member"], modules: ["build"], adminModules: ["build"] },
    // Single role -> "Member" slice.
    { projectId: "p2", projectName: "Tower B", userId: "u2", email: "b@acme.com", name: "Bob",
      isInternal: false, isAdmin: false, status: "active", addedOn: "2024-02-01", company: "Acme",
      roles: ["Member"], modules: ["insight"], adminModules: [] },
    // No role -> "Unknown" slice.
    { projectId: "p3", projectName: "Tower C", userId: "u3", email: "c@acme.com", name: "Cara",
      isInternal: false, isAdmin: false, status: "active", addedOn: "2024-03-01", company: "Acme",
      roles: [], modules: [], adminModules: [] },
  ])),
}));
vi.mock("echarts-for-react", () => ({
  default: (props: { option: { series?: Array<{ data?: Array<{ name?: string }> }> } }) => {
    const data = props.option.series?.[0]?.data ?? [];
    return <div data-testid="echart" data-slices={data.length} data-names={data.map((d) => d.name).join("|")} />;
  },
}));

import AccessAnalysisRoute from "./page";

describe("AccessAnalysisRoute (roles donut)", () => {
  it("renders one slice per bucket: combined multi-role, single role, and Unknown", async () => {
    const ui = await AccessAnalysisRoute();
    const { getByTestId, getByText } = render(ui);
    const el = getByTestId("echart");
    expect(el.getAttribute("data-slices")).toBe("3");
    const names = el.getAttribute("data-names")!.split("|");
    expect(names).toContain("Admin + Member");
    expect(names).toContain("Member");
    expect(names).toContain("Unknown");
    expect(getByText("Access Analysis")).toBeTruthy();
  });
});
