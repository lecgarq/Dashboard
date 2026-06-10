// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TemplateMembersTable } from "../components/TemplateMembersTable";
import type { TemplateMember } from "@/lib/server/templateView";

const members: TemplateMember[] = [
  { name: "Alberto", email: "alberto@hermosillo.com", company: "Hermosillo",
    role: "Core", accessLevel: "Project Admin", isInternal: true, isAdmin: true },
  { name: "Guest", email: "guest@outside.com", company: "Outside Co",
    role: "Designer", accessLevel: "Project Member", isInternal: false, isAdmin: false },
];

describe("TemplateMembersTable", () => {
  it("renders one row per member with name, email, role, company, and access level", () => {
    render(<TemplateMembersTable members={members} />);
    expect(screen.getByText("Alberto")).toBeTruthy();
    expect(screen.getByText("alberto@hermosillo.com")).toBeTruthy();
    expect(screen.getByText("Core")).toBeTruthy();
    expect(screen.getByText("Project Admin")).toBeTruthy();
    expect(screen.getAllByText("Hermosillo").length).toBeGreaterThan(0);
    expect(screen.getByText("Guest")).toBeTruthy();
    expect(screen.getByText("Project Member")).toBeTruthy();
    expect(screen.getByText("External")).toBeTruthy();
  });
});
