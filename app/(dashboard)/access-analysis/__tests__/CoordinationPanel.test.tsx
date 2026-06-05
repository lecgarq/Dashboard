// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoordinationPanel } from "../components/CoordinationPanel";
import type { CoordinationSummary } from "@/lib/server/coordinationView";

const summary: CoordinationSummary = {
  totalIssues: 1200, coordinationCount: 318, validatedCount: 290,
  byStatus: [{ status: "open", count: 120 }, { status: "closed", count: 198 }],
  byProject: [{ projectId: "p1", projectName: "PREPATEC", count: 200 }],
  auditCount: 7,
};

describe("CoordinationPanel", () => {
  it("shows the coordination count and validated subtitle", () => {
    render(<CoordinationPanel summary={summary} />);
    expect(screen.getByText("318")).toBeTruthy();
    expect(screen.getByText(/290 validated/i)).toBeTruthy();
  });

  it("shows the audit footnote when auditCount > 0", () => {
    render(<CoordinationPanel summary={summary} />);
    expect(screen.getByText(/7 low-confidence/i)).toBeTruthy();
  });
});
