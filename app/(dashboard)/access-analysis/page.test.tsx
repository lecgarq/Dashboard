// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/server/accessInstanceView", () => ({
  loadInstanceView: vi.fn(async () => ([
    { projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com", name: "Ana",
      isInternal: true, isAdmin: true, status: "active", addedOn: "2024-01-01", company: "Hermosillo",
      roles: ["Admin"], modules: ["build"], adminModules: ["build"] },
  ])),
}));
vi.mock("./AccessAnalysisDashboard", () => ({
  AccessAnalysisDashboard: (props: { filterOptions: unknown }) =>
    <div data-testid="dashboard" data-opts={JSON.stringify(props.filterOptions)} />,
}));

import AccessAnalysisRoute from "./page";

describe("AccessAnalysisRoute (new)", () => {
  it("loads the instance view and passes derived filter options to the dashboard", async () => {
    const ui = await AccessAnalysisRoute();
    const { getByTestId } = render(ui);
    const el = getByTestId("dashboard");
    const opts = JSON.parse(el.getAttribute("data-opts")!);
    expect(opts.projects).toEqual([{ value: "p1", label: "Tower A" }]);
    expect(opts.companies).toEqual([{ value: "Hermosillo", label: "Hermosillo" }]);
    expect(opts.roles).toEqual([{ value: "Admin", label: "Admin" }]);
  });
});
