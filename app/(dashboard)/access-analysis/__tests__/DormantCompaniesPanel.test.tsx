// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { DormantCompaniesPanel } from "../components/DormantCompaniesPanel";

const summary = {
  noUsers: ["Acme", "Zeta"],
  noActivity: [
    { company: "PICSA", userCount: 3 },
    { company: "Estructure", userCount: 1 },
  ],
};

describe("DormantCompaniesPanel", () => {
  it("renders both tabs with counts and defaults to the No-activity tab", () => {
    const { getByTestId } = render(<DormantCompaniesPanel summary={summary} />);
    expect(getByTestId("dormant-tab-no-users").textContent).toContain("2");
    expect(getByTestId("dormant-tab-no-activity").textContent).toContain("2");
    // Default tab = No activity (both populated) → shows PICSA.
    expect(getByTestId("dormant-panel").textContent).toContain("PICSA");
  });

  it("switches to the No-users tab and lists those companies", () => {
    const { getByTestId } = render(<DormantCompaniesPanel summary={summary} />);
    fireEvent.click(getByTestId("dormant-tab-no-users"));
    const panel = getByTestId("dormant-panel");
    expect(panel.textContent).toContain("Acme");
    expect(panel.textContent).toContain("Zeta");
  });

  it("defaults to the No-users tab when there is no dormant activity", () => {
    const { getByTestId } = render(<DormantCompaniesPanel summary={{ noUsers: ["Acme"], noActivity: [] }} />);
    expect(getByTestId("dormant-panel").textContent).toContain("Acme");
  });

  it("shows an empty state when a tab has no entries", () => {
    const { getByTestId } = render(<DormantCompaniesPanel summary={{ noUsers: [], noActivity: [] }} />);
    const panel = getByTestId("dormant-panel");
    fireEvent.click(getByTestId("dormant-tab-no-users"));
    expect(within(panel).getByText(/every company has users/i)).toBeTruthy();
  });
});
