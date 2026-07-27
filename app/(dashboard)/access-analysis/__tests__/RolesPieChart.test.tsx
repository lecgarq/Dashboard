// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const series = props.option.series?.[0]?.data ?? [];
    return (
      <div
        data-testid="echart"
        data-slices={series.length}
        data-active={series.filter((d: any) => d.value > 0).length}
        data-names={series.map((d: any) => d.name).join("|")}
        data-centre-subtext={props.option.title?.[1]?.subtext ?? ""}
        data-header-subtext={props.option.title?.[0]?.subtext ?? ""}
        data-tooltip={props.option.tooltip?.formatter ?? ""}
      />
    );
  },
}));

import { RolesPieChart } from "../components/RolesPieChart";
import { PremiumSurface } from "@/components/ui/PremiumSurface";

const data = [
  { name: "Unknown", value: 50 },
  { name: "Multiple roles", value: 30 },
  { name: "Alpha", value: 25 },
  { name: "Bravo", value: 20 },
  { name: "Charlie", value: 15 },
  { name: "Delta", value: 10 },
];

describe("RolesPieChart", () => {
  it("renders an empty state when there is no data", () => {
    const { queryByTestId, getByText } = render(<RolesPieChart data={[]} distinctRoles={0} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no role assignments/i)).toBeTruthy();
  });

  it("shows all roles by default (top default ≥ role count) with no Others", () => {
    const { getByTestId, queryByText } = render(<RolesPieChart data={data} distinctRoles={4} />);
    const legend = getByTestId("role-legend");
    expect(legend.textContent).toContain("Charlie");
    expect(legend.textContent).toContain("Delta");
    expect(queryByText(/Others \(/)).toBeNull();
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("6");
  });

  it("flags Unknown and Multiple roles as warnings", () => {
    const { getAllByTestId } = render(<RolesPieChart data={data} distinctRoles={4} />);
    expect(getAllByTestId("warning-icon")).toHaveLength(2);
  });

  it("typing a top-N collapses the rest into Others", () => {
    const { getByTestId, queryByText } = render(<RolesPieChart data={data} distinctRoles={4} />);
    fireEvent.change(getByTestId("topn-input"), { target: { value: "2" } });
    const legend = getByTestId("role-legend");
    expect(within(legend).getByText(/Others \(2 roles\)/)).toBeTruthy();
    expect(within(legend).queryByRole("button", { name: /Charlie/ })).toBeNull();
    expect(within(legend).queryByRole("button", { name: /Delta/ })).toBeNull();
    // Donut shows Unknown, Multiple, Alpha, Bravo, Others = 5 slices.
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("5");
  });

  it("expands Others back to every role, in legend and on the pie", () => {
    const { getByTestId, queryByText } = render(<RolesPieChart data={data} distinctRoles={4} />);
    fireEvent.change(getByTestId("topn-input"), { target: { value: "2" } });
    const legend = getByTestId("role-legend");
    fireEvent.click(within(legend).getByRole("button", { name: /Others \(2 roles\)/ }));
    expect(within(legend).getByRole("button", { name: /Charlie/ })).toBeTruthy();
    expect(within(legend).getByRole("button", { name: /Delta/ })).toBeTruthy();
    expect(queryByText(/Others \(/)).toBeNull();
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("6");
  });

  // The slice total counts (user, project) memberships, not people: a person on
  // six projects contributes six. Calling that number "users" states a headcount
  // the data does not support — and it is the number a presenter reads aloud.
  it("labels the totals as memberships, never users", () => {
    const { getByTestId } = render(
      <RolesPieChart data={data} distinctRoles={4} />,
    );
    const chart = getByTestId("echart");
    expect(chart.getAttribute("data-centre-subtext")).toBe("memberships");
    expect(chart.getAttribute("data-tooltip")).toContain("memberships");
    expect(chart.getAttribute("data-tooltip")).not.toMatch(/\busers\b/);
    expect(chart.getAttribute("data-header-subtext")).toContain("memberships");
  });

  it("titles each legend row with memberships, never users", () => {
    const { getByTestId } = render(<RolesPieChart data={data} distinctRoles={4} />);
    const row = within(getByTestId("role-legend")).getByRole("button", { name: /Alpha/ });
    expect(row.getAttribute("title")).toContain("25 memberships");
    expect(row.getAttribute("title")).not.toMatch(/\busers\b/);
  });

  // `.panel-elevated:hover` translates Y by -3px, so a nested shell lifted the
  // panel twice on one hover — the visible half of the card-inside-card bug.
  it("adds no second card when rendered inside a panel surface", () => {
    const { container } = render(
      <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
        <RolesPieChart data={data} distinctRoles={4} />
      </PremiumSurface>,
    );
    expect(container.querySelectorAll(".panel-elevated")).toHaveLength(1);
  });

  it("drills into the people behind a role and fires onUserClick", () => {
    const onUserClick = vi.fn();
    const usersByRole = new Map([
      ["Alpha", [
        { email: "ana@x.com", name: "Ana", count: 3 },
        { email: "al@x.com", name: "Al", count: 1 },
      ]],
    ]);
    const { getByTestId } = render(
      <RolesPieChart data={data} distinctRoles={4} usersByRole={usersByRole} onUserClick={onUserClick} />,
    );
    fireEvent.click(within(getByTestId("role-legend")).getByRole("button", { name: /Alpha/ }));
    const drill = getByTestId("role-drilldown");
    expect(drill.textContent).toContain("Ana");
    expect(drill.textContent).toContain("Al");
    fireEvent.click(within(drill).getByRole("button", { name: /Ana/ }));
    expect(onUserClick).toHaveBeenCalledWith("ana@x.com");
  });
});
