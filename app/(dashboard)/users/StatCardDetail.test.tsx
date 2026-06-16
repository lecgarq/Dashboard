// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// ECharts renders to canvas (unhappy in jsdom) — stub it to a div.
vi.mock("../access-analysis/components/EChart", () => ({
  EChart: () => <div data-testid="echart" />,
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

import { StatCardDetail } from "./StatCardDetail";
import type { ProjectData } from "./AccProfileSection";

const proj = (o: Partial<ProjectData>): ProjectData => ({
  id: "x", name: "P", status: "active", isAdmin: false, roles: [], modules: [], ...o,
});

describe("StatCardDetail", () => {
  it("admin → lists the admin projects with their role", () => {
    render(
      <StatCardDetail
        kind="admin"
        projects={[proj({ id: "1", name: "Acme Tower", isAdmin: true, roles: ["Project Admin"] })]}
      />,
    );
    expect(screen.getByTestId("stat-detail-admin")).toBeTruthy();
    expect(screen.getByText("Acme Tower")).toBeTruthy();
    expect(screen.getByText(/Project Admin/)).toBeTruthy();
  });

  it("roles → legend lists each role name", () => {
    render(
      <StatCardDetail
        kind="roles"
        projects={[proj({ id: "1", roles: ["BIM Manager"] }), proj({ id: "2", roles: ["BIM Manager"] })]}
      />,
    );
    expect(screen.getByText("BIM Manager")).toBeTruthy();
  });

  it("modules → legend maps keys to friendly labels", () => {
    render(<StatCardDetail kind="modules" projects={[proj({ modules: ["documentManagement"] })]} />);
    expect(screen.getByText("Forma Data Management")).toBeTruthy();
  });
});
