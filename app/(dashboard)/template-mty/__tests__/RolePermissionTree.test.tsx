// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RolePermissionTree } from "../components/RolePermissionTree";
import type { RoleTreeNode } from "@/lib/server/templateRoleTree";

const nodes: RoleTreeNode[] = [
  {
    roleId: "rArch", roleName: "Architect", folderCount: 3,
    tiers: [
      { rank: 5, label: "Full control", folders: [{ id: "f2", name: "Design Docs", path: "/PF/Design Docs" }] },
      { rank: 1, label: "View only", folders: [{ id: "f1", name: "Client Docs", path: "/PF/Client Docs" }] },
    ],
  },
];

describe("RolePermissionTree", () => {
  it("shows the role with its folder count, then reveals tiers + folders on expand", () => {
    render(<RolePermissionTree nodes={nodes} />);
    expect(screen.getByText("Architect")).toBeTruthy();
    expect(screen.getByText("3 folders")).toBeTruthy();
    // collapsed: folders not yet shown
    expect(screen.queryByText("Design Docs")).toBeNull();
    // expand
    fireEvent.click(screen.getByText("Architect"));
    expect(screen.getByText("Full control")).toBeTruthy();
    expect(screen.getByText("Design Docs")).toBeTruthy();
    expect(screen.getByText("Client Docs")).toBeTruthy();
  });

  it("renders the empty state with no roles", () => {
    render(<RolePermissionTree nodes={[]} />);
    expect(screen.getByText(/no folder permissions found/i)).toBeTruthy();
  });
});
