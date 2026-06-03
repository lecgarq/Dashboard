// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const series = props.option.series?.[0]?.data ?? [];
    const titles = Array.isArray(props.option.title) ? props.option.title : [props.option.title];
    const subtexts = titles.map((t: any) => t?.subtext).filter(Boolean).join(" | ");
    return <div data-testid="echart" data-slices={series.length} data-subtexts={subtexts} />;
  },
}));

import { RolesPieChart } from "../components/RolesPieChart";

describe("RolesPieChart", () => {
  it("renders an empty state when there is no data", () => {
    const { queryByTestId, getByText } = render(<RolesPieChart data={[]} distinctRoles={0} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no role assignments/i)).toBeTruthy();
  });

  it("sends every slice to the donut and lists every role + count in the full legend", () => {
    const data = [
      { name: "Member", value: 70 },
      { name: "Admin", value: 20 },
      { name: "Unknown", value: 8 },
      { name: "Intern", value: 2 },
    ];
    const { getByTestId } = render(<RolesPieChart data={data} distinctRoles={3} />);
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("4");
    expect(getByTestId("echart").getAttribute("data-subtexts")).toContain("3 roles");

    const legend = getByTestId("role-legend");
    for (const d of data) {
      expect(legend.textContent).toContain(d.name);
      expect(legend.textContent).toContain(d.value.toLocaleString());
    }
  });
});
