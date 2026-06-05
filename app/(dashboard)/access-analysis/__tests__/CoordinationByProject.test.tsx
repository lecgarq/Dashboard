// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoordinationByProject } from "../components/CoordinationByProject";
import type { CoordinationSummary } from "../coordinationCounts";

const summary: CoordinationSummary = {
  total: 1765,
  byProject: [
    { projectId: "a", projectName: "MTY AE-01", count: 532 },
    { projectId: "b", projectName: "Danfoss Sensores", count: 297 },
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
