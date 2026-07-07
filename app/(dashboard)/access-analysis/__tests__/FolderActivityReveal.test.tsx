// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import { FolderActivityReveal } from "../components/FolderActivityReveal";
import type { FolderRankTotal } from "@/lib/server/folderActivityView";
import type { FolderProjectRow } from "../folderActivityCounts";

const memberships = [
  { projectId: "p1", email: "ana@x.com", roles: ["Manager"] },
  { projectId: "p2", email: "ben@x.com", roles: ["Viewer"] },
];
const ranking: FolderRankTotal[] = [
  { folderName: "Project Files", activity: 13, projects: 2, users: 2 },
  { folderName: "ARQ", activity: 9, projects: 1, users: 1 },
];
const detailProjectFiles: FolderProjectRow[] = [
  { projectId: "p1", projectName: "Torre", userEmail: "ana@x.com", userName: "Ana", count: 9 },
  { projectId: "p2", projectName: "Hospital", userEmail: "ben@x.com", userName: "Ben", count: 4 },
];

describe("FolderActivityReveal (folder-first: Folders → Projects → Roles → People)", () => {
  it("does not load until expanded", () => {
    const loadFolders = vi.fn(async () => [] as FolderRankTotal[]);
    const loadDetail = vi.fn(async () => [] as FolderProjectRow[]);
    render(
      <FolderActivityReveal selectedProjectIds={["p1"]} memberships={memberships} loadFolders={loadFolders} loadDetail={loadDetail} />,
    );
    expect(loadFolders).not.toHaveBeenCalled();
  });

  it("renders ranked folder rows first and lazy-loads a folder's detail on expand", async () => {
    const loadFolders = vi.fn(async () => ranking);
    const loadDetail = vi.fn(async () => detailProjectFiles);
    const { getByTestId, getAllByTestId } = render(
      <FolderActivityReveal
        selectedProjectIds={["p1", "p2"]}
        memberships={memberships}
        loadFolders={loadFolders}
        loadDetail={loadDetail}
      />,
    );
    fireEvent.click(getByTestId("folder-activity-expand"));
    await waitFor(() => expect(getAllByTestId("fa-folder-row")).toHaveLength(2));
    // Folder level shows the cross-project rollup, biggest first.
    expect(getAllByTestId("fa-folder-row")[0].textContent).toContain("Project Files");
    expect(getAllByTestId("fa-folder-row")[0].textContent).toContain("2 projects");
    expect(loadDetail).not.toHaveBeenCalled(); // not loaded until a folder is expanded

    // Expand the folder → its PROJECTS appear (level 2).
    fireEvent.click(within(getAllByTestId("fa-folder-row")[0]).getAllByRole("button")[0]);
    await waitFor(() => expect(getByTestId("folder-activity-panel").textContent).toContain("Torre"));
    expect(getByTestId("folder-activity-panel").textContent).toContain("Hospital");
    expect(loadDetail).toHaveBeenCalledWith("Project Files", ["p1", "p2"]);
  });

  it("drills project → role → person inside an expanded folder", async () => {
    const loadFolders = vi.fn(async () => [ranking[0]]);
    const loadDetail = vi.fn(async () => detailProjectFiles);
    const onUserClick = vi.fn();
    const { getByTestId, getAllByTestId, getByText } = render(
      <FolderActivityReveal
        selectedProjectIds={["p1", "p2"]}
        memberships={memberships}
        loadFolders={loadFolders}
        loadDetail={loadDetail}
        onUserClick={onUserClick}
      />,
    );
    fireEvent.click(getByTestId("folder-activity-expand"));
    await waitFor(() => expect(getAllByTestId("fa-folder-row")).toHaveLength(1));
    fireEvent.click(within(getAllByTestId("fa-folder-row")[0]).getAllByRole("button")[0]);
    // Level 2: project node → expand → level 3: role row → expand → level 4: person.
    await waitFor(() => expect(getByText("Torre")).toBeTruthy());
    fireEvent.click(getByText("Torre"));
    await waitFor(() => expect(getByText("Manager")).toBeTruthy());
    fireEvent.click(getByText("Manager"));
    await waitFor(() => expect(getByText("Ana")).toBeTruthy());
    // Person click surfaces the PLAIN email (projectId prefix stripped by the fold).
    fireEvent.click(getByText("Ana"));
    expect(onUserClick).toHaveBeenCalledWith("ana@x.com");
  });
});
