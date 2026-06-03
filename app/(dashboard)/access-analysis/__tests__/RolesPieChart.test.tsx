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
      />
    );
  },
}));

import { RolesPieChart } from "../components/RolesPieChart";

const data = [
  { name: "Member", value: 70 },
  { name: "Admin", value: 20 },
  { name: "Unknown", value: 8 },
  { name: "Intern", value: 2 },
];

describe("RolesPieChart", () => {
  it("renders an empty state when there is no data", () => {
    const { queryByTestId, getByText } = render(<RolesPieChart data={[]} distinctRoles={0} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no role assignments/i)).toBeTruthy();
  });

  it("lists every role + count in the legend and starts with all selected", () => {
    const { getByTestId } = render(<RolesPieChart data={data} distinctRoles={3} />);
    const legend = getByTestId("role-legend");
    for (const d of data) {
      expect(legend.textContent).toContain(d.name);
      expect(legend.textContent).toContain(d.value.toLocaleString());
    }
    // All four slices present and active on first render.
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("4");
    expect(getByTestId("echart").getAttribute("data-active")).toBe("4");
    const metrics = getByTestId("role-metrics");
    expect(metrics.textContent).toContain("4/4");
    expect(metrics.textContent).toContain("100 users");
  });

  it("toggles a role off: metrics + active slice count update", () => {
    const { getByTestId } = render(<RolesPieChart data={data} distinctRoles={3} />);
    const legend = getByTestId("role-legend");
    const memberBtn = within(legend).getByRole("button", { name: /Member/ });

    fireEvent.click(memberBtn);

    expect(memberBtn.getAttribute("aria-pressed")).toBe("false");
    expect(getByTestId("echart").getAttribute("data-active")).toBe("3"); // Member now 0
    const metrics = getByTestId("role-metrics");
    expect(metrics.textContent).toContain("3/4");
    expect(metrics.textContent).toContain("30 users"); // 20 + 8 + 2
  });

  it("can restore everything with 'Show all'", () => {
    const { getByTestId, getByRole } = render(<RolesPieChart data={data} distinctRoles={3} />);
    const legend = getByTestId("role-legend");
    fireEvent.click(within(legend).getByRole("button", { name: /Member/ }));
    fireEvent.click(getByRole("button", { name: /show all/i }));
    expect(getByTestId("echart").getAttribute("data-active")).toBe("4");
    expect(getByTestId("role-metrics").textContent).toContain("4/4");
  });
});
