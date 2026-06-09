// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TemplateMembersTable } from "../components/TemplateMembersTable";
import type { TemplateMember } from "@/lib/server/templateView";

const members: TemplateMember[] = [
  { name: "Alberto", email: "alberto.sanchez@hermosillo.com", company: "Hermosillo",
    roleNames: ["Core"], modules: ["dataManagement", "build"], isInternal: true, isAdmin: true },
  { name: "Guest", email: "guest@outside.com", company: "Outside Co",
    roleNames: [], modules: [], isInternal: false, isAdmin: false },
];

describe("TemplateMembersTable", () => {
  it("renders one row per member with name, email, role, and company", () => {
    render(<TemplateMembersTable members={members} />);
    expect(screen.getByText("Alberto")).toBeTruthy();
    expect(screen.getByText("alberto.sanchez@hermosillo.com")).toBeTruthy();
    expect(screen.getByText("Core")).toBeTruthy();
    expect(screen.getAllByText("Hermosillo").length).toBeGreaterThan(0);
    expect(screen.getByText("Guest")).toBeTruthy();
    expect(screen.getByText("No role")).toBeTruthy();
  });
});
