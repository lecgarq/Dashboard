// @vitest-environment jsdom
/**
 * TemplateMembersTable — tests against the DataTable-based shell.
 *
 * The test still imports `TemplateMembersTable` (the re-export alias) so it
 * exercises the same public surface that callers use.
 *
 * DataTable uses @tanstack/react-virtual. jsdom has no scroll geometry so
 * the virtualizer returns 0 items by default. We mock it to return a
 * predictable set of rows (same pattern as components/ui/__tests__/DataTable.test.tsx).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { TemplateMember } from "@/lib/server/templateView";

// ---------------------------------------------------------------------------
// Stubs — must appear BEFORE any component import
// ---------------------------------------------------------------------------

// Stub ResizeObserver — the virtualizer uses it internally in jsdom
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// Stub scrollIntoView and scrollTo used by Radix / jsdom layout
beforeAll(() => {
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  }
  if (typeof window !== "undefined" && !window.scrollTo) {
    window.scrollTo = vi.fn() as typeof window.scrollTo;
  }
  // matchMedia stub for Radix / media-query hooks
  if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }
});

// Mock @tanstack/react-virtual so the virtualizer renders all rows in jsdom.
// 2 test members → return 2 virtual items.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => {
    const count = opts.count ?? 0;
    const items = Array.from({ length: count }, (_, i) => ({
      key: i,
      index: i,
      start: i * 72,
      end: (i + 1) * 72,
      lane: 0,
      size: 72,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * 72,
      measureElement: vi.fn(),
      options: { scrollMargin: 0 },
    };
  },
}));

// ---------------------------------------------------------------------------
// Import the component AFTER stubs (the re-export alias is valid)
// ---------------------------------------------------------------------------
// eslint-disable-next-line import/first
import { TemplateMembersTable } from "../components/TemplateMembersTable";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const members: TemplateMember[] = [
  {
    name: "Alberto",
    email: "alberto@hermosillo.com",
    company: "Hermosillo",
    role: "Core",
    accessLevel: "Project Admin",
    isInternal: true,
    isAdmin: true,
  },
  {
    name: "Guest",
    email: "guest@outside.com",
    company: "Outside Co",
    role: "Designer",
    accessLevel: "Project Member",
    isInternal: false,
    isAdmin: false,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

/**
 * Return all text-content values for data cells in a given column.
 * DataTable renders data cells as <td data-cell data-col="{id}">.
 */
function getCellTexts(container: HTMLElement, colId: string): string[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(`td[data-cell][data-col="${colId}"]`),
  ).map((el) => el.textContent?.trim() ?? "");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TemplateMembersTable (DataTable-based shell)", () => {
  it("renders one row per member with name, email, role, company, and access level", () => {
    render(<TemplateMembersTable members={members} />);
    // Name + email appear in the Member column cell
    expect(screen.getByText("Alberto")).toBeTruthy();
    expect(screen.getByText("alberto@hermosillo.com")).toBeTruthy();
    expect(screen.getByText("Core")).toBeTruthy();
    expect(screen.getByText("Project Admin")).toBeTruthy();
    expect(screen.getAllByText("Hermosillo").length).toBeGreaterThan(0);
    expect(screen.getByText("Guest")).toBeTruthy();
    expect(screen.getByText("Project Member")).toBeTruthy();
    // "External" appears both as the Origin pill for Guest and the filter chip
    expect(screen.getAllByText("External").length).toBeGreaterThan(0);
  });

  it("filters rows by the search box", () => {
    render(<TemplateMembersTable members={members} />);
    fireEvent.change(screen.getByLabelText("Search members"), {
      target: { value: "guest" },
    });
    expect(screen.queryByText("Alberto")).toBeNull();
    expect(screen.getByText("Guest")).toBeTruthy();
  });

  it("filters rows by the External chip", () => {
    render(<TemplateMembersTable members={members} />);
    fireEvent.click(screen.getByRole("button", { name: "External" }));
    expect(screen.queryByText("Alberto")).toBeNull();
    expect(screen.getByText("Guest")).toBeTruthy();
  });

  it("sorts by Member name descending when the column header is clicked", () => {
    const { container } = render(<TemplateMembersTable members={members} />);

    // Default: sorted asc by name (Alberto before Guest).
    // Click the Member header to toggle to desc (Guest before Alberto).
    // DataTable renders sortable <th role="columnheader"> elements.
    const headers = Array.from(
      container.querySelectorAll<HTMLElement>("th[role='columnheader'], th"),
    );
    const memberHeader = headers.find((h) =>
      h.textContent?.includes("Member"),
    );
    expect(memberHeader).toBeTruthy();

    // Click once: default was asc → becomes desc (Guest first)
    fireEvent.click(memberHeader!);

    // Read name-column cell text — first cell should now be "Guest…" (desc order)
    const nameCells = getCellTexts(container, "name");
    // Each cell contains "name\nemail" concatenated; check the first cell starts with Guest
    expect(nameCells[0]).toContain("Guest");
  });

  it("calls onSelectMember with the row's email on click", () => {
    const onSelectMember = vi.fn();
    const { container } = render(
      <TemplateMembersTable members={members} onSelectMember={onSelectMember} />,
    );
    // Click a data cell in the Alberto row — DataTable fires onRowClick via td[data-cell] onClick
    const nameCells = Array.from(
      container.querySelectorAll<HTMLElement>("td[data-cell][data-col='name']"),
    );
    const albertoCell = nameCells.find((el) => el.textContent?.includes("Alberto"));
    expect(albertoCell).toBeTruthy();
    fireEvent.click(albertoCell!);
    expect(onSelectMember).toHaveBeenCalledWith("alberto@hermosillo.com");
  });

  it("does NOT call onSelectMember when a member without an email is clicked", () => {
    const onSelectMember = vi.fn();
    const noEmailMember: TemplateMember = {
      name: "NoEmail",
      email: "",
      company: "Acme",
      role: "Viewer",
      accessLevel: "Project Member",
      isInternal: false,
      isAdmin: false,
    };
    const { container } = render(
      <TemplateMembersTable
        members={[noEmailMember]}
        onSelectMember={onSelectMember}
      />,
    );
    // Row is rendered (name visible)
    expect(screen.getByText("NoEmail")).toBeTruthy();

    // Click all data cells in the row — none should fire onSelectMember
    const cells = Array.from(
      container.querySelectorAll<HTMLElement>("td[data-cell]"),
    );
    cells.forEach((cell) => fireEvent.click(cell));
    expect(onSelectMember).not.toHaveBeenCalled();
  });
});
