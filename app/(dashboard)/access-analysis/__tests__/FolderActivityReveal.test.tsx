// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import { FolderActivityReveal } from "../components/FolderActivityReveal";
import type { ProjectActivityTotal } from "@/lib/server/folderActivityView";
import type { FolderActivityRow } from "../folderActivityCounts";

const memberships = [
  { projectId: "p1", email: "ana@x.com", roles: ["Manager"] },
  { projectId: "p2", email: "ben@x.com", roles: ["Viewer"] },
];
const treeP1: FolderActivityRow[] = [{ folderName: "ARQ", userEmail: "ana@x.com", userName: "Ana", count: 9 }];
const treeP2: FolderActivityRow[] = [{ folderName: "EST", userEmail: "ben@x.com", userName: "Ben", count: 4 }];

describe("FolderActivityReveal", () => {
  it("does not load until expanded", () => {
    const loadProjects = vi.fn(async () => [] as ProjectActivityTotal[]);
    const loadTree = vi.fn(async () => [] as FolderActivityRow[]);
    render(<FolderActivityReveal selectedProjectIds={["p1"]} memberships={memberships} loadProjects={loadProjects} loadTree={loadTree} />);
    expect(loadProjects).not.toHaveBeenCalled();
  });

  it("auto-renders the single project's tree when one project is selected", async () => {
    const loadProjects = vi.fn(async () => [{ projectId: "p1", projectName: "Torre", activity: 9, folders: 1 }]);
    const loadTree = vi.fn(async () => treeP1);
    const { getByTestId } = render(
      <FolderActivityReveal selectedProjectIds={["p1"]} memberships={memberships} loadProjects={loadProjects} loadTree={loadTree} />,
    );
    fireEvent.click(getByTestId("folder-activity-expand"));
    await waitFor(() => expect(getByTestId("folder-activity-tree").textContent).toContain("ARQ"));
    expect(loadTree).toHaveBeenCalledWith("p1");
  });

  it("renders project rows for multiple projects and lazy-loads a tree on expand", async () => {
    const loadProjects = vi.fn(async () => [
      { projectId: "p1", projectName: "Torre", activity: 9, folders: 1 },
      { projectId: "p2", projectName: "Hospital", activity: 4, folders: 1 },
    ]);
    const loadTree = vi.fn(async (id: string) => (id === "p1" ? treeP1 : treeP2));
    const { getByTestId, getAllByTestId } = render(
      <FolderActivityReveal selectedProjectIds={["p1", "p2"]} memberships={memberships} loadProjects={loadProjects} loadTree={loadTree} />,
    );
    fireEvent.click(getByTestId("folder-activity-expand"));
    await waitFor(() => expect(getAllByTestId("fa-project-row")).toHaveLength(2));
    expect(loadTree).not.toHaveBeenCalled(); // not loaded until a project is expanded
    fireEvent.click(within(getAllByTestId("fa-project-row")[1]).getByRole("button"));
    await waitFor(() => expect(getByTestId("folder-activity-panel").textContent).toContain("EST"));
    expect(loadTree).toHaveBeenCalledWith("p2");
  });
});
