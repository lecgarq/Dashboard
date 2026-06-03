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
      />
    );
  },
}));

import { RolesPieChart } from "../components/RolesPieChart";

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

  it("expands Others (+) back to every role, in legend and on the pie", () => {
    const { getByTestId, getByRole, queryByText } = render(<RolesPieChart data={data} distinctRoles={4} />);
    fireEvent.change(getByTestId("topn-input"), { target: { value: "2" } });
    fireEvent.click(getByRole("button", { name: /expand/i }));
    const legend = getByTestId("role-legend");
    expect(within(legend).getByRole("button", { name: /Charlie/ })).toBeTruthy();
    expect(within(legend).getByRole("button", { name: /Delta/ })).toBeTruthy();
    expect(queryByText(/Others \(/)).toBeNull();
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("6");
  });

  it("toggles a role off from the legend", () => {
    const { getByTestId } = render(<RolesPieChart data={data} distinctRoles={4} />);
    const legend = getByTestId("role-legend");
    const alpha = within(legend).getByRole("button", { name: /Alpha/ });
    fireEvent.click(alpha);
    expect(alpha.getAttribute("aria-pressed")).toBe("false");
    expect(getByTestId("echart").getAttribute("data-active")).toBe("5"); // 6 shown, 1 hidden
    expect(getByTestId("role-metrics").textContent).toContain("125 users"); // 150 - 25
  });
});
