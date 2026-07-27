// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { DirectoryRow } from "./directoryTableRow";

import { USERS_COLUMNS } from "./DirectoryTableColumns";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const row = (overrides: Partial<DirectoryRow> = {}): DirectoryRow => ({
  resourceName: "people/1",
  email: "ada@hermosillo.com",
  displayName: "Ada Lovelace",
  photoUrl: null,
  jobTitle: "Architect",
  department: "Engineering",
  costCenter: null,
  primaryRole: "BIM Manager",
  extraRoleCount: 0,
  officeCode: "MTY",
  officeLabel: "Monterrey",
  lastActivity: "2026-06-01T12:00:00.000Z",
  projectCount: 5,
  isDormant: false,
  isExternal: false,
  company: null,
  accUser: null,
  ...overrides,
});

// Test-internal loose type to sidestep TanStack v8 strict generics in test helpers.
interface LooseCol {
  id?: string;
  enableSorting?: boolean;
  header?: unknown;
  cell?: (ctx: { getValue: () => unknown; row: { original: DirectoryRow } }) => React.ReactNode;
}

const cols = USERS_COLUMNS as unknown as LooseCol[];

/** Render a single cell from the column by id and return { container }. */
function renderCell(colId: string, data: DirectoryRow): { container: HTMLElement } {
  const col = cols.find((c) => c.id === colId);
  if (!col) throw new Error(`Column '${colId}' not found in USERS_COLUMNS`);
  const CellComponent = col.cell!;
  const cell = { getValue: () => (data as unknown as Record<string, unknown>)[colId], row: { original: data } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<>{CellComponent(cell as any)}</>);
}

// ---------------------------------------------------------------------------
// USERS_COLUMNS structure
// ---------------------------------------------------------------------------

describe("USERS_COLUMNS", () => {
  it("has exactly 6 columns", () => {
    expect(USERS_COLUMNS).toHaveLength(6);
  });

  it("column ids are: name, role, company, office, lastActive, projects (in order)", () => {
    const ids = cols.map((c) => c.id);
    expect(ids).toEqual(["name", "role", "company", "office", "lastActive", "projects"]);
  });

  it("name column has enableSorting true", () => {
    const nameCol = cols.find((c) => c.id === "name");
    expect(nameCol?.enableSorting).toBe(true);
  });

  it("office, projects columns have enableSorting true", () => {
    const sortable = ["office", "projects"];
    for (const id of sortable) {
      const col = cols.find((c) => c.id === id);
      expect(col?.enableSorting).toBe(true);
    }
  });

  it("lastActive column has TanStack sorting OFF — its header drives the server-truth activity sort", () => {
    // The header component cycles cycleActivitySort (off → desc → asc → off);
    // client-sorting the partial lastActivity field would contradict it.
    const col = cols.find((c) => c.id === "lastActive");
    expect(col?.enableSorting).toBe(false);
    expect(typeof col?.header).toBe("function");
  });

  it("role column has enableSorting false (multi-role badge not meaningfully sortable)", () => {
    const roleCol = cols.find((c) => c.id === "role");
    expect(roleCol?.enableSorting).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NameCell
// ---------------------------------------------------------------------------

describe("NameCell", () => {
  it("renders displayName", () => {
    renderCell("name", row());
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  });

  it("renders initials fallback (ProfileAvatar with null photoUrl) when photoUrl is null", () => {
    renderCell("name", row({ photoUrl: null, displayName: "Ada Lovelace" }));
    // AvatarFallback renders initials "AL"
    expect(screen.getByText("AL")).toBeTruthy();
  });

  it("renders a status dot (data-dormant attribute) when isDormant=true", () => {
    const { container } = renderCell("name", row({ isDormant: true, lastActivity: "2025-01-01T00:00:00.000Z" }));
    const dot = container.querySelector("[data-dormant]");
    expect(dot).not.toBeNull();
  });

  it("does NOT render a status dot when isDormant=false", () => {
    const { container } = renderCell("name", row({ isDormant: false }));
    const dot = container.querySelector("[data-dormant]");
    expect(dot).toBeNull();
  });

  it("does NOT render a status dot when lastActivity is null (status unknown)", () => {
    const { container } = renderCell("name", row({ lastActivity: null, isDormant: false }));
    const dot = container.querySelector("[data-dormant]");
    expect(dot).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LastActiveCell
// ---------------------------------------------------------------------------

describe("LastActiveCell", () => {
  it("renders muted '— No data' text when lastActivity iso is null", () => {
    renderCell("lastActive", row({ lastActivity: null }));
    expect(screen.getByText(/No data/)).toBeTruthy();
  });

  it("renders relative text containing 'ago' for a real ISO", () => {
    // Use a date ~30 days ago so formatDistanceToNowStrict returns "X days ago"
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    renderCell("lastActive", row({ lastActivity: thirtyDaysAgo }));
    expect(screen.getByText(/ago/)).toBeTruthy();
  });

  it("exposes the exact date string on the title attribute for hover tooltip", () => {
    const iso = "2026-06-01T12:00:00.000Z";
    const { container } = renderCell("lastActive", row({ lastActivity: iso }));
    // The wrapper element should carry a title with the ISO or formatted date
    const withTitle = container.querySelector("[title]");
    expect(withTitle).not.toBeNull();
    expect(withTitle?.getAttribute("title")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// RoleCell
// ---------------------------------------------------------------------------

describe("RoleCell", () => {
  it("renders only the primary role when extraRoleCount=0", () => {
    renderCell("role", row({ primaryRole: "BIM Manager", extraRoleCount: 0 }));
    expect(screen.getByText("BIM Manager")).toBeTruthy();
    expect(screen.queryByText(/\+\d/)).toBeNull();
  });

  it("renders primary role + '+2' badge when extraRoleCount=2", () => {
    renderCell("role", row({ primaryRole: "Architect", extraRoleCount: 2 }));
    expect(screen.getByText("Architect")).toBeTruthy();
    expect(screen.getByText("+2")).toBeTruthy();
  });

  it("renders nothing critical when primaryRole is null", () => {
    // Should not throw; renders gracefully (e.g. empty span)
    expect(() => renderCell("role", row({ primaryRole: null, extraRoleCount: 0 }))).not.toThrow();
  });
});
