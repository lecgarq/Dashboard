// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleAccessPie } from "../components/RoleAccessPie";
import type { RoleTreeNode } from "@/lib/server/templateRoleTree";

const nodes: RoleTreeNode[] = [
  {
    roleId: "rArch", roleName: "Architect", folderCount: 3,
    tiers: [
      { rank: 5, label: "Full control", folders: [{ id: "f2", name: "Design Docs", path: "/PF/Design Docs" }] },
      { rank: 1, label: "View only", folders: [{ id: "f1", name: "Client Docs", path: "/PF/Client Docs" }, { id: "f3", name: "IFC", path: "/PF/IFC" }] },
    ],
  },
];

describe("RoleAccessPie", () => {
  it("renders a legend row per role with its folder count", () => {
    render(<RoleAccessPie nodes={nodes} />);
    expect(screen.getByText("Architect")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("renders the empty state with no roles", () => {
    render(<RoleAccessPie nodes={[]} />);
    expect(screen.getByText(/no folder permissions found/i)).toBeTruthy();
  });
});
