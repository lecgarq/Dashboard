// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const summary = {
  counts: { users: 1, projects: 1, access: 1, roles: 1, companies: 1 },
  composition: { internalExternal: { internal: 1, external: 0 }, permission: { admin: 1, member: 0 } },
  modules: [], rankings: { topProjects: [], membersPerRole: [], topCompanies: [] },
  risk: { externalMembers: 0, externalAdmins: 0, projectAdmins: 1, pending: 0 },
};
vi.mock("../queries", () => ({
  useSummary: () => ({ data: summary, isLoading: false }),
  useTrends: () => ({ data: { activityPerWeek: [], accessAdded: [] }, isLoading: false }),
  useMembers: () => ({ data: { total: 0, page: 0, size: 50, rows: [] }, isLoading: false }),
}));
vi.mock("../components/EChart", () => ({ EChart: () => <div data-testid="echart" /> }));

import { AccessAnalysisDashboard } from "../AccessAnalysisDashboard";

describe("AccessAnalysisDashboard", () => {
  it("renders the count tiles + risk + table sections", () => {
    const { getAllByText } = render(
      <AccessAnalysisDashboard filterOptions={{ projects: [], companies: [], roles: [] }} projectTotal={1152} />,
    );
    expect(getAllByText(/Access/).length).toBeGreaterThan(0);
    expect(getAllByText(/Members/).length).toBeGreaterThan(0);
  });
});
