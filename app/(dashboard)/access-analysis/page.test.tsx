// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/server/accessInstanceView", () => ({
  loadInstanceView: vi.fn(async () => ([
    { projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com", name: "Ana",
      isInternal: true, isAdmin: true, status: "active", addedOn: "2024-01-01", company: "Hermosillo",
      roles: ["Admin", "Member"], modules: ["build"], adminModules: ["build"] },
    { projectId: "p2", projectName: "Tower B", userId: "u2", email: "b@acme.com", name: "Bob",
      isInternal: false, isAdmin: false, status: "active", addedOn: "2024-02-01", company: "Acme",
      roles: ["Member"], modules: ["insight"], adminModules: [] },
  ])),
}));
vi.mock("echarts-for-react", () => ({
  default: (props: { option: { series?: Array<{ data?: unknown[] }> } }) => (
    <div data-testid="echart" data-slices={props.option.series?.[0]?.data?.length ?? 0} />
  ),
}));

import AccessAnalysisRoute from "./page";

describe("AccessAnalysisRoute (roles pie)", () => {
  it("renders a pie with one slice per distinct role", async () => {
    const ui = await AccessAnalysisRoute();
    const { getByTestId, getByText } = render(ui);
    // Across the two instances: Admin x1, Member x2 -> 2 distinct slices.
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("2");
    expect(getByText("Access Analysis")).toBeTruthy();
  });
});
