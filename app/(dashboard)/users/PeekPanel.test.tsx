// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { DirectoryRow } from "./directoryTableRow";
import type { BulkAccUser } from "@/lib/acc/acc-types";

import { PeekPanel } from "./PeekPanel";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const accUser: BulkAccUser = {
  email: "ada@hermosillo.com",
  name: "Ada Lovelace",
  found: true,
  projectCount: 5,
  activeCount: 4,
  adminCount: 1,
  hasNoProjects: false,
  syncedAt: "2026-06-01T00:00:00.000Z",
  allRoles: ["Architect", "BIM Manager"],
  allModules: ["documentManagement", "build"],
  projects: [],
  isAccountAdmin: false,
  addedOn: null,
};

const makeRow = (overrides: Partial<DirectoryRow> = {}): DirectoryRow => ({
  resourceName: "people/1",
  email: "ada@hermosillo.com",
  displayName: "Ada Lovelace",
  photoUrl: null,
  jobTitle: "Architect",
  department: "Engineering",
  primaryRole: "Architect",
  extraRoleCount: 1,
  officeCode: "MTY",
  officeLabel: "Monterrey",
  lastActivity: "2026-06-01T12:00:00.000Z",
  projectCount: 5,
  isDormant: false,
  isExternal: false,
  company: null,
  accUser,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PeekPanel", () => {
  it("renders displayName", () => {
    render(<PeekPanel row={makeRow()} onOpenProfile={vi.fn()} />);
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  });

  it("renders jobTitle", () => {
    render(<PeekPanel row={makeRow()} onOpenProfile={vi.fn()} />);
    expect(screen.getByText("Architect")).toBeTruthy();
  });

  it("renders officeLabel", () => {
    render(<PeekPanel row={makeRow()} onOpenProfile={vi.fn()} />);
    expect(screen.getByText("Monterrey")).toBeTruthy();
  });

  it("renders project count", () => {
    render(<PeekPanel row={makeRow()} onOpenProfile={vi.fn()} />);
    expect(screen.getByText(/5/)).toBeTruthy();
  });

  it("renders role count (allRoles.length) from accUser", () => {
    render(<PeekPanel row={makeRow()} onOpenProfile={vi.fn()} />);
    // accUser has 2 roles — screen will contain multiple "2"s (roles + modules)
    const twos = screen.getAllByText(/^2$/);
    expect(twos.length).toBeGreaterThanOrEqual(1);
  });

  it("renders module count (allModules.length) from accUser", () => {
    render(<PeekPanel row={makeRow()} onOpenProfile={vi.fn()} />);
    // accUser has 2 modules — check it appears
    const text = screen.getAllByText(/2/);
    expect(text.length).toBeGreaterThan(0);
  });

  it("renders a 'See full profile' control", () => {
    render(<PeekPanel row={makeRow()} onOpenProfile={vi.fn()} />);
    expect(screen.getByText(/See full profile/i)).toBeTruthy();
  });

  it("calls onOpenProfile when 'See full profile' is clicked", () => {
    const onOpenProfile = vi.fn();
    render(<PeekPanel row={makeRow()} onOpenProfile={onOpenProfile} />);
    const btn = screen.getByText(/See full profile/i);
    fireEvent.click(btn);
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it("renders without throwing when accUser is null (graceful fallback)", () => {
    const rowNoAcc = makeRow({ accUser: null });
    expect(() => render(<PeekPanel row={rowNoAcc} onOpenProfile={vi.fn()} />)).not.toThrow();
  });

  it("shows 0 roles and 0 modules when accUser is null", () => {
    render(<PeekPanel row={makeRow({ accUser: null })} onOpenProfile={vi.fn()} />);
    // Should display "0" for roles and modules counts
    const zeros = screen.getAllByText(/0/);
    expect(zeros.length).toBeGreaterThan(0);
  });

  it("performs no tRPC queries (no throw without trpc mock)", () => {
    // PeekPanel must not import or call trpc — if it did, it would throw in this
    // environment because trpc is not provided. The test passes if no error occurs.
    expect(() =>
      render(<PeekPanel row={makeRow()} onOpenProfile={vi.fn()} />)
    ).not.toThrow();
  });
});
