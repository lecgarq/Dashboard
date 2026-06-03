// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const series = props.option.series?.[0]?.data ?? [];
    return (
      <div
        data-testid="echart"
        data-slices={series.length}
        data-names={series.map((d: any) => d.name).join("|")}
      />
    );
  },
}));

import { RolesByProject } from "../components/RolesByProject";
import type { ProjectRoleRow } from "../projectFilter";

const rows: ProjectRoleRow[] = [
  { projectId: "p1", projectName: "Tower A", roles: ["Member"] },
  { projectId: "p1", projectName: "Tower A", roles: ["Admin", "Member"] },
  { projectId: "p2", projectName: "Tower B", roles: ["Designer"] },
  { projectId: "p3", projectName: "Bridge North", roles: ["Member"] },
];

describe("RolesByProject", () => {
  it("renders a project search box and the full donut by default", () => {
    const { getByTestId } = render(<RolesByProject rows={rows} />);
    expect(getByTestId("project-search")).toBeTruthy();
    // Member, Multiple roles, Designer = 3 slices across all projects.
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("3");
  });

  it("filters the donut to a single project when its name is searched", () => {
    const { getByTestId } = render(<RolesByProject rows={rows} />);
    fireEvent.change(getByTestId("project-search"), { target: { value: "bridge" } });
    const el = getByTestId("echart");
    expect(el.getAttribute("data-slices")).toBe("1");
    expect(el.getAttribute("data-names")).toBe("Member");
  });

  it("reports how many projects matched the query", () => {
    const { getByTestId } = render(<RolesByProject rows={rows} />);
    fireEvent.change(getByTestId("project-search"), { target: { value: "tower" } });
    expect(getByTestId("project-match").textContent).toContain("2");
    expect(getByTestId("project-match").textContent).toContain("3");
  });

  it("clears the search and restores the full donut", () => {
    const { getByTestId, getByRole } = render(<RolesByProject rows={rows} />);
    fireEvent.change(getByTestId("project-search"), { target: { value: "bridge" } });
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("1");
    fireEvent.click(getByRole("button", { name: /clear/i }));
    expect((getByTestId("project-search") as HTMLInputElement).value).toBe("");
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("3");
  });

  it("shows the donut empty state when no project matches", () => {
    const { getByTestId, queryByTestId, getByText } = render(<RolesByProject rows={rows} />);
    fireEvent.change(getByTestId("project-search"), { target: { value: "nonexistent" } });
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no role assignments/i)).toBeTruthy();
  });
});
