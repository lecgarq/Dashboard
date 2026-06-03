// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const series = props.option.series?.[0]?.data ?? [];
    const titles = Array.isArray(props.option.title) ? props.option.title : [props.option.title];
    const subtexts = titles.map((t: any) => t?.subtext).filter(Boolean).join(" | ");
    return (
      <div
        data-testid="echart"
        data-slices={series.length}
        data-names={series.map((d: any) => d.name).join("|")}
        data-subtexts={subtexts}
      />
    );
  },
}));

import { RolesPieChart } from "../components/RolesPieChart";

describe("RolesPieChart", () => {
  it("renders an empty state when there is no data", () => {
    const { queryByTestId, getByText } = render(<RolesPieChart data={[]} distinctRoles={0} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no role assignments/i)).toBeTruthy();
  });

  it("renders one slice per bucket and surfaces the distinct-role count", () => {
    const { getByTestId } = render(
      <RolesPieChart
        data={[{ name: "Member", value: 7 }, { name: "Unknown", value: 2 }, { name: "Other (3 roles)", value: 5 }]}
        distinctRoles={52}
      />,
    );
    const el = getByTestId("echart");
    expect(el.getAttribute("data-slices")).toBe("3");
    expect(el.getAttribute("data-names")).toBe("Member|Unknown|Other (3 roles)");
    expect(el.getAttribute("data-subtexts")).toContain("52 roles");
  });
});
