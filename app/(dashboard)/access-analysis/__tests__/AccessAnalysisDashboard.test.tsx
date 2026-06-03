// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const usersData = {
  total: 2,
  page: 0,
  size: 50,
  rows: [
    { userId: "u1", name: "Ana", email: "a@hermosillo.com", type: "Internal", isAdminAnywhere: true,
      projectCount: 2, modules: ["build"], roles: ["Architect"], companies: ["Hermosillo"],
      projects: [{ projectId: "p1", project: "Tower A", modules: ["build"], adminModules: ["build"], role: "Architect", company: "Hermosillo", access: "Admin" }] },
    { userId: "u2", name: "Bob", email: "b@acme.com", type: "External", isAdminAnywhere: false,
      projectCount: 1, modules: [], roles: [], companies: ["Acme"], projects: [] },
  ],
};

vi.mock("../queries", () => ({
  useUsers: () => ({ data: usersData, isLoading: false }),
}));

import { AccessAnalysisDashboard } from "../AccessAnalysisDashboard";

describe("AccessAnalysisDashboard (simplified)", () => {
  it("renders the user table with one row per user and no analytics panels", () => {
    const { getByText, getAllByText, queryByText } = render(
      <AccessAnalysisDashboard filterOptions={{ projects: [], companies: [], roles: [] }} />,
    );
    // user table is present with both users
    expect(getAllByText(/Users \(/).length).toBeGreaterThan(0);
    expect(getByText("Ana")).toBeTruthy();
    expect(getByText("Bob")).toBeTruthy();
    expect(getByText("Architect")).toBeTruthy();
    // analytics panels are gone
    expect(queryByText(/Members \(/)).toBeNull();
  });
});
