// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { FolderActivityByRole } from "../components/FolderActivityByRole";
import type { FolderActivitySummary } from "../folderActivityCounts";

const summary: FolderActivitySummary = {
  total: 30,
  distinctRoles: 2,
  folders: [
    {
      name: "01_Arquitectura",
      total: 20,
      roleSlices: [
        { name: "Manager", value: 14 },
        { name: "Viewer", value: 6 },
      ],
      usersByRole: new Map([
        ["Manager", [
          { email: "ana@x.com", name: "Ana", count: 9 },
          { email: "al@x.com", name: "Al", count: 5 },
        ]],
        ["Viewer", [{ email: "ben@x.com", name: "Ben", count: 6 }]],
      ]),
    },
    {
      name: "00_PDF",
      total: 10,
      roleSlices: [{ name: "Manager", value: 10 }],
      usersByRole: new Map([["Manager", [{ email: "ana@x.com", name: "Ana", count: 10 }]]]),
    },
  ],
};

describe("FolderActivityByRole", () => {
  it("renders one row per folder, sorted as given, with totals", () => {
    const { getByTestId, getAllByTestId } = render(<FolderActivityByRole summary={summary} />);
    const tree = getByTestId("folder-activity-tree");
    expect(tree.textContent).toContain("01_Arquitectura");
    expect(tree.textContent).toContain("00_PDF");
    expect(getAllByTestId("folder-row")).toHaveLength(2);
  });

  it("expands a folder to reveal its role rows", () => {
    const { getAllByTestId, getByTestId } = render(<FolderActivityByRole summary={summary} />);
    fireEvent.click(within(getAllByTestId("folder-row")[0]).getByRole("button"));
    const roles = getByTestId("folder-activity-tree").querySelectorAll('[data-testid="role-row"]');
    expect(roles.length).toBe(2); // Manager + Viewer
  });

  it("expands a role to reveal its user rows", () => {
    const { getAllByTestId } = render(<FolderActivityByRole summary={summary} />);
    fireEvent.click(within(getAllByTestId("folder-row")[0]).getByRole("button"));
    fireEvent.click(within(getAllByTestId("role-row")[0]).getByRole("button"));
    const users = getAllByTestId("user-row");
    expect(users.some((u) => u.textContent?.includes("Ana"))).toBe(true);
    expect(users.some((u) => u.textContent?.includes("Al"))).toBe(true);
  });

  it("calls onUserClick with the email when a user row is clicked", () => {
    const onUserClick = vi.fn();
    const { getAllByTestId } = render(<FolderActivityByRole summary={summary} onUserClick={onUserClick} />);
    fireEvent.click(within(getAllByTestId("folder-row")[0]).getByRole("button"));
    fireEvent.click(within(getAllByTestId("role-row")[0]).getByRole("button"));
    fireEvent.click(within(getAllByTestId("user-row").find((u) => u.textContent?.includes("Ana"))!).getByRole("button"));
    expect(onUserClick).toHaveBeenCalledWith("ana@x.com");
  });

  it("collapses folders beyond Top-N behind a show-all control", () => {
    const { getByTestId, getAllByTestId } = render(<FolderActivityByRole summary={summary} defaultTopN={1} />);
    expect(getAllByTestId("folder-row")).toHaveLength(1); // only the busiest folder
    fireEvent.click(getByTestId("folder-activity-showall"));
    expect(getAllByTestId("folder-row")).toHaveLength(2);
  });
});
