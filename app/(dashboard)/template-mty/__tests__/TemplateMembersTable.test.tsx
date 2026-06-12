// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
    // "External" now appears both as the Origin pill and the filter chip.
    expect(screen.getAllByText("External").length).toBeGreaterThan(0);
  });

  it("filters rows by the search box", () => {
    render(<TemplateMembersTable members={members} />);
    fireEvent.change(screen.getByLabelText("Search members"), { target: { value: "guest" } });
    expect(screen.queryByText("Alberto")).toBeNull();
    expect(screen.getByText("Guest")).toBeTruthy();
  });

  it("filters rows by the External chip", () => {
    render(<TemplateMembersTable members={members} />);
    fireEvent.click(screen.getByRole("button", { name: "External" }));
    expect(screen.queryByText("Alberto")).toBeNull();
    expect(screen.getByText("Guest")).toBeTruthy();
  });

  it("sorts by Member name when the header is toggled to desc", () => {
    render(<TemplateMembersTable members={members} />);
    const grid = screen.getByRole("table");
    // default asc → Alberto first; click toggles to desc → Guest first
    fireEvent.click(screen.getByRole("columnheader", { name: /Member/i }));
    const rows = within(grid).getAllByRole("row");
    // rows[0] is the header row; rows[1] is the first data row
    expect(within(rows[1]).getByText("Guest")).toBeTruthy();
  });

  it("calls onSelectMember with the row's email on click", () => {
    const onSelectMember = vi.fn();
    render(<TemplateMembersTable members={members} onSelectMember={onSelectMember} />);
    fireEvent.click(screen.getByText("Alberto"));
    expect(onSelectMember).toHaveBeenCalledWith("alberto@hermosillo.com");
  });
});
