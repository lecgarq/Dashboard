// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("echarts-for-react", () => ({
  default: (props: { option: { series?: Array<{ data?: unknown[] }> } }) => (
    <div data-testid="echart" data-slices={props.option.series?.[0]?.data?.length ?? 0} />
  ),
}));

import { RolesPieChart } from "../components/RolesPieChart";

describe("RolesPieChart", () => {
  it("renders an empty state when there is no data", () => {
    const { queryByTestId, getByText } = render(<RolesPieChart data={[]} assignments={0} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no role assignments/i)).toBeTruthy();
  });
  it("passes one pie slice per role", () => {
    const { getByTestId } = render(
      <RolesPieChart data={[{ name: "Admin", value: 3 }, { name: "Member", value: 7 }]} assignments={10} />,
    );
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("2");
  });
});
