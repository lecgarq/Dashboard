// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
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
    expect(screen.getByText("Alberto")).toBeInTheDocument();
    expect(screen.getByText("alberto.sanchez@hermosillo.com")).toBeInTheDocument();
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getAllByText("Hermosillo").length).toBeGreaterThan(0);
    expect(screen.getByText("Guest")).toBeInTheDocument();
    expect(screen.getByText("No role")).toBeInTheDocument();
  });
});
