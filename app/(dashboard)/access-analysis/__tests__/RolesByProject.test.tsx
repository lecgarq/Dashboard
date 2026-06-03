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

const open = (getByTestId: (id: string) => HTMLElement) =>
  fireEvent.focus(getByTestId("project-search"));

describe("RolesByProject (project multi-select)", () => {
  it("shows all projects selected by default and the full donut", () => {
    const { getByTestId } = render(<RolesByProject rows={rows} />);
    expect(getByTestId("project-summary").textContent).toMatch(/all projects/i);
    // Member, Multiple roles, Designer = 3 slices across all projects.
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("3");
  });

  it("opens a checkbox per project on focus, all checked", () => {
    const { getByTestId, getAllByRole } = render(<RolesByProject rows={rows} />);
    open(getByTestId);
    const boxes = getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(3);
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it("filters the visible checkboxes by the search string", () => {
    const { getByTestId, getAllByRole } = render(<RolesByProject rows={rows} />);
    open(getByTestId);
    fireEvent.change(getByTestId("project-search"), { target: { value: "tower" } });
    const boxes = getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2); // Tower A + Tower B, Bridge North hidden
  });

  it("unchecking a project updates the donut in real time", () => {
    const { getByTestId, getByRole } = render(<RolesByProject rows={rows} />);
    open(getByTestId);
    fireEvent.click(getByRole("checkbox", { name: /tower b/i })); // drops the Designer role
    const el = getByTestId("echart");
    expect(el.getAttribute("data-slices")).toBe("2");
    expect(el.getAttribute("data-names")).not.toContain("Designer");
    expect(getByTestId("project-summary").textContent).toContain("2");
    expect(getByTestId("project-summary").textContent).toContain("3");
  });

  it("Clear unchecks all and shows the donut empty state", () => {
    const { getByTestId, queryByTestId, getByText, getByRole } = render(<RolesByProject rows={rows} />);
    open(getByTestId);
    fireEvent.click(getByRole("button", { name: /clear/i }));
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no role assignments/i)).toBeTruthy();
    expect(getByTestId("project-summary").textContent).toContain("0");
  });

  it("Select all re-checks every project", () => {
    const { getByTestId, getByRole } = render(<RolesByProject rows={rows} />);
    open(getByTestId);
    fireEvent.click(getByRole("button", { name: /clear/i }));
    fireEvent.click(getByRole("button", { name: /select all/i }));
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("3");
    expect(getByTestId("project-summary").textContent).toMatch(/all projects/i);
  });
});
