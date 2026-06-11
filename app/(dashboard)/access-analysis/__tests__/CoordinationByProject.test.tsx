// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CoordinationByProject } from "../components/CoordinationByProject";
import type { CoordinationSummary } from "../coordinationCounts";
import type { ClashIssue } from "../coordinationClash";

const summary: CoordinationSummary = {
  total: 1765,
  byProject: [
    { projectId: "a", projectName: "MTY AE-01", count: 532, open: 300, closed: 232 },
    { projectId: "b", projectName: "Clash-MC", count: 297, open: 297, closed: 0 },
  ],
  byStatus: [{ status: "open", count: 1200 }, { status: "closed", count: 565 }],
};

describe("CoordinationByProject", () => {
  it("shows the headline total and a per-project row", () => {
    render(<CoordinationByProject summary={summary} accessibleProjects={427} forbiddenProjects={123} />);
    expect(screen.getByText("1,765")).toBeTruthy();
    expect(screen.getByText("MTY AE-01")).toBeTruthy();
    expect(screen.getByText("532")).toBeTruthy();
  });

  it("shows status chips with their counts", () => {
    render(<CoordinationByProject summary={summary} accessibleProjects={427} forbiddenProjects={123} />);
    expect(screen.getByText(/open/i)).toBeTruthy();
    expect(screen.getByText("1,200")).toBeTruthy();
    expect(screen.getByText("565")).toBeTruthy();
  });

  it("derives an office badge from the project name (and 'Other' when none)", () => {
    render(<CoordinationByProject summary={summary} accessibleProjects={427} forbiddenProjects={123} />);
    expect(screen.getByText("MTY")).toBeTruthy(); // from "MTY AE-01"
    expect(screen.getByText("Other")).toBeTruthy(); // from "Clash-MC"
  });

  it("shows the latest-extraction freshness chip when given a run timestamp", () => {
    render(
      <CoordinationByProject
        summary={summary}
        accessibleProjects={427}
        forbiddenProjects={0}
        latestRunAt={new Date(Date.now() - 60_000).toISOString()}
      />,
    );
    expect(screen.getByText(/Extracted .* ago/i)).toBeTruthy();
  });

  const clash = (over: Partial<ClashIssue> = {}): ClashIssue => ({
    displayId: 146,
    title: "Panel vs Fire-Protection clash",
    description: "1 clash between A.rvt and B.rvt",
    status: "closed",
    author: "Edgar Martinez",
    authorEmail: "edgar@hermosillo.com",
    confidence: "high",
    source: "description",
    validated: true,
    createdAt: new Date().toISOString(),
    closedAt: null,
    commentCount: 2,
    attachmentCount: null,
    ...over,
  });

  it("lazy-loads and renders a project's clashes (with author + top-authors) on expand", async () => {
    const loadClashes = vi.fn().mockResolvedValue([clash()]);
    render(
      <CoordinationByProject summary={summary} accessibleProjects={427} forbiddenProjects={0} loadClashes={loadClashes} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /MTY AE-01/i }));
    expect(loadClashes).toHaveBeenCalledWith("a");
    expect(await screen.findByText("Panel vs Fire-Protection clash")).toBeTruthy();
    expect(screen.getByText(/Clash-verified/i)).toBeTruthy();
    expect(screen.getByText(/Top authors/i)).toBeTruthy();
    // Author shown in both the top-authors chip and the clash card.
    expect(screen.getAllByText("Edgar Martinez").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onAuthorClick with the author's email when a name is clicked", async () => {
    const loadClashes = vi.fn().mockResolvedValue([clash()]);
    const onAuthorClick = vi.fn();
    render(
      <CoordinationByProject
        summary={summary}
        accessibleProjects={427}
        forbiddenProjects={0}
        loadClashes={loadClashes}
        onAuthorClick={onAuthorClick}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /MTY AE-01/i }));
    const link = await screen.findAllByRole("button", { name: /Edgar Martinez/i });
    fireEvent.click(link[0]);
    expect(onAuthorClick).toHaveBeenCalledWith("edgar@hermosillo.com");
  });

  it("shows the coverage footnote when projects were forbidden", () => {
    render(<CoordinationByProject summary={summary} accessibleProjects={427} forbiddenProjects={123} />);
    expect(screen.getByText(/427 accessible projects/i)).toBeTruthy();
    expect(screen.getByText(/123 projects could not be scanned/i)).toBeTruthy();
  });

  it("shows an empty state when no projects are selected", () => {
    const empty: CoordinationSummary = { total: 0, byProject: [], byStatus: [] };
    render(<CoordinationByProject summary={empty} accessibleProjects={427} forbiddenProjects={123} />);
    expect(screen.getByText(/no coordination issues/i)).toBeTruthy();
  });
});
