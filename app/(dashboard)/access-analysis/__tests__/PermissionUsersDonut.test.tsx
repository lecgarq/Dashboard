// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

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

import { PermissionUsersDonut } from "../components/PermissionUsersDonut";
import type { PermissionUserCounts } from "@/lib/server/permissionUserView";

const counts: PermissionUserCounts = {
  tiers: [
    { permType: "Full Controller", users: 471 },
    { permType: "View+Download+Upload+Edit", users: 1279 },
    { permType: "View+Download", users: 231 },
    { permType: "View Only", users: 3 },
  ],
  usersWithGrants: 1984,
  usersWithRoles: 2524,
  totalDcUsers: 3791,
};

describe("PermissionUsersDonut", () => {
  it("renders one slice per tier and lists them in the legend with counts", () => {
    const { getByTestId } = render(<PermissionUsersDonut counts={counts} />);
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("4");
    const legend = getByTestId("permission-users-legend");
    expect(legend.textContent).toContain("Full Controller");
    expect(legend.textContent).toContain("471");
    expect(legend.textContent).toContain("View Only");
  });

  it("states the strongest-grant semantics and live coverage figures in the caption", () => {
    const { getByTestId } = render(<PermissionUsersDonut counts={counts} />);
    const caption = getByTestId("permission-users-caption").textContent ?? "";
    expect(caption).toContain("strongest folder-permission level");
    expect(caption).toContain("1,984");
    expect(caption).toContain("2,524");
    expect(caption).toContain("3,791");
  });

  it("renders an empty state when there are no tiers", () => {
    const { queryByTestId, getByText } = render(
      <PermissionUsersDonut counts={{ tiers: [], usersWithGrants: 0, usersWithRoles: 0, totalDcUsers: 0 }} />,
    );
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no recorded folder permissions/i)).toBeTruthy();
  });
});
