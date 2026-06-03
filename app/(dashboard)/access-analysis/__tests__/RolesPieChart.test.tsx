// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("echarts-for-react", () => ({
  default: (props: { option: { series?: Array<{ data?: Array<{ name?: string }> }> } }) => {
    const data = props.option.series?.[0]?.data ?? [];
    return <div data-testid="echart" data-slices={data.length} data-names={data.map((d) => d.name).join("|")} />;
  },
}));

import { RolesPieChart } from "../components/RolesPieChart";

describe("RolesPieChart", () => {
  it("renders an empty state when there is no data", () => {
    const { queryByTestId, getByText } = render(<RolesPieChart data={[]} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no role assignments/i)).toBeTruthy();
  });

  it("renders one donut slice per bucket, preserving names", () => {
    const { getByTestId } = render(
      <RolesPieChart data={[{ name: "Member", value: 7 }, { name: "Admin", value: 3 }, { name: "Unknown", value: 2 }]} />,
    );
    const el = getByTestId("echart");
    expect(el.getAttribute("data-slices")).toBe("3");
    expect(el.getAttribute("data-names")).toBe("Member|Admin|Unknown");
  });
});
