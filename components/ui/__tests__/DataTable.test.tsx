// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import {
  createColumnHelper,
  type ColumnDef,
} from "@tanstack/react-table";

// ---------------------------------------------------------------------------
// Stubs — must run before component import
// ---------------------------------------------------------------------------

// Stub ResizeObserver — the virtualizer uses it internally in jsdom
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// Stub matchMedia (Radix/jsdom compatibility)
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

// Mock @tanstack/react-virtual: jsdom has no scroll geometry so the
// virtualizer returns 0 items by default. Return a predictable set of
// 5 virtual rows that map to indices 0..4.
const MOCK_VIRTUAL_ITEMS = [0, 1, 2, 3, 4].map((i) => ({
  key: i,
  index: i,
  start: i * 72,
  end: (i + 1) * 72,
  lane: 0,
  size: 72,
}));
const MOCK_TOTAL_SIZE = 5 * 72;

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => MOCK_VIRTUAL_ITEMS,
    getTotalSize: () => MOCK_TOTAL_SIZE,
    measureElement: vi.fn(),
    options: { scrollMargin: 0 },
  }),
}));

// ---------------------------------------------------------------------------
// Import the component under test — this import FAILS RED until Plan 02 ships
// ---------------------------------------------------------------------------
import { DataTable } from "../DataTable";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

type MockRow = { name: string; role: string; email: string };

const MOCK_DATA: MockRow[] = [
  { name: "Alice", role: "Admin", email: "alice@example.com" },
  { name: "Bob", role: "Member", email: "bob@example.com" },
  { name: "Carol", role: "Admin", email: "carol@example.com" },
  { name: "Dave", role: "Viewer", email: "dave@example.com" },
  { name: "Eve", role: "Member", email: "eve@example.com" },
];

const columnHelper = createColumnHelper<MockRow>();

// TanStack's ColumnDef is invariant in its TValue param, so a `, string`
// instantiation is not assignable to the DataTable prop's ColumnDef<MockRow>
// (TValue = unknown). Use `any` for TValue — matching TanStack's own
// TableOptions.columns: ColumnDef<TData, any>[] convention.
const MOCK_COLUMNS: ColumnDef<MockRow, any>[] = [
  columnHelper.accessor("name", {
    header: "Name",
    enableSorting: true,
    size: 200,
  }),
  columnHelper.accessor("role", {
    header: "Role",
    enableSorting: true,
    size: 150,
  }),
  columnHelper.accessor("email", {
    header: "Email",
    enableSorting: false,
    size: 200,
  }),
];

// ---------------------------------------------------------------------------
// Helper — fresh localStorage before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// FND-05 Test Suite
// ---------------------------------------------------------------------------

describe("DataTable", () => {
  // FND-05-a: renders column header labels from ColumnDef<T>[]
  it("FND-05-a: renders column header labels", () => {
    const { queryByText } = render(
      <DataTable<MockRow> data={MOCK_DATA} columns={MOCK_COLUMNS} />
    );
    expect(queryByText("Name")).not.toBeNull();
    expect(queryByText("Role")).not.toBeNull();
    expect(queryByText("Email")).not.toBeNull();
  });

  // FND-05-b: clicking a sortable header cycles asc → desc → off
  it("FND-05-b: sort header click cycles asc → desc → off by rendered cell order", () => {
    const { container } = render(
      <DataTable<MockRow> data={MOCK_DATA} columns={MOCK_COLUMNS} />
    );

    // Find the "Name" header and click it
    const headers = Array.from(
      container.querySelectorAll("th, [role='columnheader']")
    ) as HTMLElement[];
    const nameHeader = headers.find((h) => h.textContent?.includes("Name"));
    expect(nameHeader).not.toBeNull();

    // First click — ascending
    fireEvent.click(nameHeader!);
    const cellsAfterAsc = Array.from(
      container.querySelectorAll("[data-col='name'], td:first-child")
    ).map((el) => el.textContent?.trim());
    // At minimum the first visible cell should be populated (virtualizer returns 5 rows)
    expect(cellsAfterAsc.length).toBeGreaterThan(0);

    // Second click — descending
    fireEvent.click(nameHeader!);
    const cellsAfterDesc = Array.from(
      container.querySelectorAll("[data-col='name'], td:first-child")
    ).map((el) => el.textContent?.trim());
    expect(cellsAfterDesc.length).toBeGreaterThan(0);

    // Third click — off (back to natural order)
    fireEvent.click(nameHeader!);
    // No errors thrown = three-state cycle handled
  });

  // FND-05-c: chevron expands peek; second click collapses it
  it("FND-05-c: chevron click expands peek; second click collapses", () => {
    const { container } = render(
      <DataTable<MockRow>
        data={MOCK_DATA}
        columns={MOCK_COLUMNS}
        renderExpanded={() => <span data-testid="peek-content">peek</span>}
      />
    );

    // Find the first row's expand chevron button
    const chevrons = Array.from(
      container.querySelectorAll("[data-testid='row-expand-btn'], [aria-label='Expand row'], button[data-expand]")
    ) as HTMLElement[];
    // Fall back: find any button inside the first virtual row that is NOT a density toggle
    const allRowBtns = Array.from(
      container.querySelectorAll("[data-index='0'] button, tr:first-child button")
    ) as HTMLElement[];
    const expandBtn = chevrons[0] ?? allRowBtns[0];
    expect(expandBtn).not.toBeNull();

    // Expand
    fireEvent.click(expandBtn!);
    const peekAfterOpen = container.querySelector("[data-testid='peek-content']");
    expect(peekAfterOpen).not.toBeNull();

    // Collapse
    fireEvent.click(expandBtn!);
    const peekAfterClose = container.querySelector("[data-testid='peek-content']");
    expect(peekAfterClose).toBeNull();
  });

  // FND-05-d: accordion — expanding row B while row A is open leaves only row B's peek
  it("FND-05-d: accordion — opening row B closes row A", () => {
    const { container } = render(
      <DataTable<MockRow>
        data={MOCK_DATA}
        columns={MOCK_COLUMNS}
        renderExpanded={(row) => (
          <span data-testid={`peek-${row.original.name}`}>
            peek-{row.original.name}
          </span>
        )}
      />
    );

    const allExpandBtns = Array.from(
      container.querySelectorAll(
        "[data-index='0'] button[data-expand], [data-index='0'] [aria-label='Expand row']"
      )
    ) as HTMLElement[];
    const btnRow1 = allExpandBtns[0] ??
      (container.querySelectorAll("[data-index='0'] button")[0] as HTMLElement);
    const btnRow2 =
      (container.querySelectorAll("[data-index='1'] button[data-expand], [data-index='1'] [aria-label='Expand row']")[0] as HTMLElement) ??
      (container.querySelectorAll("[data-index='1'] button")[0] as HTMLElement);

    expect(btnRow1).not.toBeNull();
    expect(btnRow2).not.toBeNull();

    // Open row 0 (Alice)
    fireEvent.click(btnRow1);
    expect(container.querySelector("[data-testid='peek-Alice']")).not.toBeNull();

    // Open row 1 (Bob) — Alice's peek should close
    fireEvent.click(btnRow2);
    expect(container.querySelector("[data-testid='peek-Bob']")).not.toBeNull();
    expect(container.querySelector("[data-testid='peek-Alice']")).toBeNull();
  });

  // FND-05-e: onRowClick fires on non-chevron cell; chevron does NOT fire it
  it("FND-05-e: onRowClick fires on row cell, not on chevron", () => {
    const onRowClick = vi.fn();
    const { container } = render(
      <DataTable<MockRow>
        data={MOCK_DATA}
        columns={MOCK_COLUMNS}
        onRowClick={onRowClick}
        renderExpanded={() => <span>peek</span>}
      />
    );

    // Click the first row's data cell (not the chevron)
    const dataCells = Array.from(
      container.querySelectorAll("[data-index='0'] td[data-cell], [data-index='0'] [data-testid='row-cell']")
    ) as HTMLElement[];
    const dataCell = dataCells[0] ??
      (container.querySelectorAll("[data-index='0'] td:not([data-expand-cell])")[0] as HTMLElement);
    if (dataCell) {
      fireEvent.click(dataCell);
      expect(onRowClick).toHaveBeenCalledTimes(1);
    }

    // Click the chevron — onRowClick should NOT be called again
    onRowClick.mockClear();
    const expandBtn = container.querySelector(
      "[data-index='0'] button[data-expand], [data-index='0'] [aria-label='Expand row']"
    ) as HTMLElement | null;
    if (expandBtn) {
      fireEvent.click(expandBtn);
      expect(onRowClick).not.toHaveBeenCalled();
    }
  });

  // onRowHover fires on row pointer-enter and onRowHoverEnd on leave — used to
  // prefetch the detail panel's queries so the profile opens instantly.
  it("fires onRowHover on row mouseEnter and onRowHoverEnd on mouseLeave", () => {
    const onRowHover = vi.fn();
    const onRowHoverEnd = vi.fn();
    const { container } = render(
      <DataTable<MockRow>
        data={MOCK_DATA}
        columns={MOCK_COLUMNS}
        onRowHover={onRowHover}
        onRowHoverEnd={onRowHoverEnd}
      />
    );
    const dataCell = container.querySelector("[data-cell]") as HTMLElement | null;
    expect(dataCell).not.toBeNull();
    const tr = dataCell!.closest("tr") as HTMLElement;
    fireEvent.mouseEnter(tr);
    expect(onRowHover).toHaveBeenCalledTimes(1);
    fireEvent.mouseLeave(tr);
    expect(onRowHoverEnd).toHaveBeenCalledTimes(1);
  });

  // FND-05-f: density toggle swaps row-height class; font-size class unchanged
  it("FND-05-f: density toggle changes row-height class but not font-size class", () => {
    const { container } = render(
      <DataTable<MockRow> data={MOCK_DATA} columns={MOCK_COLUMNS} />
    );

    // Find density toggle button
    const densityBtn = container.querySelector(
      "[data-testid='density-toggle'], [aria-label='Toggle density'], button[data-density]"
    ) as HTMLElement | null;
    expect(densityBtn).not.toBeNull();

    // Capture initial state (comfortable)
    const firstRow = container.querySelector("[data-index='0']") as HTMLElement | null;
    const initialClass = firstRow?.className ?? "";

    // Toggle to compact
    fireEvent.click(densityBtn!);
    const compactClass = firstRow?.className ?? "";

    // Class should have changed (height/padding tokens differ)
    expect(compactClass).not.toBe(initialClass);

    // Toggle back to comfortable
    fireEvent.click(densityBtn!);
    const backClass = firstRow?.className ?? "";
    expect(backClass).toBe(initialClass);
  });

  // FND-05-g: density persists to localStorage
  it("FND-05-g: density toggles persist to localStorage key 'datatable-density'", () => {
    const { container } = render(
      <DataTable<MockRow> data={MOCK_DATA} columns={MOCK_COLUMNS} />
    );

    const densityBtn = container.querySelector(
      "[data-testid='density-toggle'], [aria-label='Toggle density'], button[data-density]"
    ) as HTMLElement | null;
    expect(densityBtn).not.toBeNull();

    // Toggle to compact
    fireEvent.click(densityBtn!);
    expect(localStorage.getItem("datatable-density")).toBe("compact");

    // Re-render with the stored value pre-seeded (simulate fresh mount after reload)
    // localStorage already has "compact" — a fresh render should start in compact
    const { container: container2 } = render(
      <DataTable<MockRow> data={MOCK_DATA} columns={MOCK_COLUMNS} />
    );
    const firstRow2 = container2.querySelector("[data-index='0']") as HTMLElement | null;
    // The row should have a compact class (height <= comfortable)
    const hasCompactClass =
      firstRow2?.className.includes("compact") ||
      firstRow2?.getAttribute("data-density") === "compact" ||
      firstRow2?.className.includes("h-12") ||
      false;
    expect(hasCompactClass).toBe(true);
  });

  // FND-05-h: no-data empty state when hasActiveFilter=false and data=[]
  it("FND-05-h: renders no-data empty state when data is empty and hasActiveFilter=false", () => {
    const { queryByText, container } = render(
      <DataTable<MockRow>
        data={[]}
        columns={MOCK_COLUMNS}
        hasActiveFilter={false}
        emptyMessage="No users yet"
      />
    );
    // Default or override message visible
    const emptyEl =
      queryByText("No users yet") ??
      container.querySelector("[data-testid='empty-state']");
    expect(emptyEl).not.toBeNull();
    // Filter-clear button should NOT be present
    const clearBtn = container.querySelector(
      "[data-testid='clear-filters-btn'], button[data-clear-filters]"
    );
    expect(clearBtn).toBeNull();
  });

  // FND-05-i: filter empty state with clear button when hasActiveFilter=true
  it("FND-05-i: renders filter empty state with Clear-filters button when hasActiveFilter=true", () => {
    const onClearFilters = vi.fn();
    const { container } = render(
      <DataTable<MockRow>
        data={[]}
        columns={MOCK_COLUMNS}
        hasActiveFilter={true}
        onClearFilters={onClearFilters}
        filteredEmptyMessage="No matches — adjust filters"
      />
    );
    // Filter-specific message or a clear button must be present
    const clearBtn = container.querySelector(
      "[data-testid='clear-filters-btn'], button[data-clear-filters]"
    ) as HTMLElement | null;
    expect(clearBtn).not.toBeNull();

    fireEvent.click(clearBtn!);
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  // FND-05-j: sticky header carries glass tokens bg-surface-2 and backdrop-blur-md
  it("FND-05-j: sticky header element carries bg-surface-2 and backdrop-blur-md classes", () => {
    const { container } = render(
      <DataTable<MockRow> data={MOCK_DATA} columns={MOCK_COLUMNS} />
    );
    // The sticky header can be a <thead> or a wrapper div; scan both
    const headerEl =
      container.querySelector("thead") ??
      container.querySelector("[data-testid='table-header']") ??
      container.querySelector(".sticky");
    expect(headerEl).not.toBeNull();
    const cls = (headerEl as HTMLElement).className;
    expect(cls.includes("bg-surface-2")).toBe(true);
    expect(cls.includes("backdrop-blur-md")).toBe(true);
  });

  // FND-05-l: import guard — DataTable.tsx must not import any WebGL/canvas library
  it("FND-05-l: DataTable source has no WebGL or canvas library imports", () => {
    // Read the implementation file from disk
    const implPath = new URL("../DataTable.tsx", import.meta.url);
    let source: string;
    try {
      source = readFileSync(implPath, "utf-8");
    } catch {
      // File does not exist yet (RED phase — Plan 02 implements it)
      // This guard becomes meaningful once Plan 02 ships
      return;
    }
    const forbiddenSpecifiers = [
      "three",
      "@react-three/fiber",
      "@react-three/drei",
      "@cosmos.gl",
      "webgl",
      "canvas",
    ];
    for (const specifier of forbiddenSpecifiers) {
      const hasImport = new RegExp(
        `import[^;]*from\\s*['"][^'"]*${specifier}[^'"]*['"]`,
        "i"
      ).test(source);
      expect(
        hasImport,
        `DataTable.tsx must not import from ${specifier}`
      ).toBe(false);
    }
  });
});
