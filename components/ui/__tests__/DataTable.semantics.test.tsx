// @vitest-environment jsdom
/**
 * Table semantics under virtualization.
 *
 * DataTable used to render three separate tables — a header-only one, a body one
 * whose single cell held the virtual canvas, and one more PER ROW — so assistive
 * tech saw N+2 unrelated tables and the aria-sort described a table with no data
 * cells. Group bands were role="rowheader" divs outside any row.
 *
 * These assertions are about the accessibility tree, not about looks, so they are
 * the ones most likely to be silently undone by a layout change later.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import React from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// jsdom has no scroll geometry, so the real virtualizer yields nothing.
// Render a fixed window of 5 items, as the sibling suite does.
const MOCK_VIRTUAL_ITEMS = [0, 1, 2, 3, 4].map((i) => ({
  key: i,
  index: i,
  start: i * 72,
  end: (i + 1) * 72,
  lane: 0,
  size: 72,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => MOCK_VIRTUAL_ITEMS,
    getTotalSize: () => 5 * 72,
    measureElement: vi.fn(),
    options: { scrollMargin: 0 },
  }),
}));

import { DataTable } from "../DataTable";

type MockRow = { name: string; role: string; email: string };

const MOCK_DATA: MockRow[] = [
  { name: "Alice", role: "Admin", email: "alice@example.com" },
  { name: "Bob", role: "Member", email: "bob@example.com" },
  { name: "Carol", role: "Admin", email: "carol@example.com" },
  { name: "Dave", role: "Viewer", email: "dave@example.com" },
  { name: "Eve", role: "Member", email: "eve@example.com" },
];

const helper = createColumnHelper<MockRow>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MOCK_COLUMNS: ColumnDef<MockRow, any>[] = [
  helper.accessor("name", { header: "Name", enableSorting: true, size: 200 }),
  helper.accessor("role", { header: "Role", enableSorting: true, size: 150 }),
  helper.accessor("email", { header: "Email", enableSorting: false, size: 200 }),
];

beforeEach(() => localStorage.clear());

describe("DataTable table semantics", () => {
  it("renders exactly one table, however many rows are virtualized", () => {
    const { container } = render(
      <DataTable<MockRow> data={MOCK_DATA} columns={MOCK_COLUMNS} label="Test people" />,
    );
    expect(container.querySelectorAll("table")).toHaveLength(1);
    // …and no stray tbody/thead from a nested one.
    expect(container.querySelectorAll("thead")).toHaveLength(1);
    expect(container.querySelectorAll("tbody")).toHaveLength(1);
  });

  it("keeps every data cell inside a row inside the one table", () => {
    const { container } = render(
      <DataTable<MockRow> data={MOCK_DATA} columns={MOCK_COLUMNS} label="Test people" />,
    );
    const cells = container.querySelectorAll("td[data-cell]");
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.closest("tr")).not.toBeNull();
      expect(cell.closest("table")).toBe(container.querySelector("table"));
    }
  });

  it("states ARIA roles explicitly, because display:grid drops the implicit ones", () => {
    const { container } = render(
      <DataTable<MockRow> data={MOCK_DATA} columns={MOCK_COLUMNS} label="Test people" />,
    );
    expect(container.querySelector("table")?.getAttribute("role")).toBe("table");
    expect(container.querySelector("thead")?.getAttribute("role")).toBe("rowgroup");
    expect(container.querySelector("tbody")?.getAttribute("role")).toBe("rowgroup");
    for (const tr of container.querySelectorAll("tr")) {
      expect(tr.getAttribute("role")).toBe("row");
    }
    for (const td of container.querySelectorAll("td")) {
      expect(td.getAttribute("role")).toBe("cell");
    }
    for (const th of container.querySelectorAll("th")) {
      expect(th.getAttribute("role")).toBe("columnheader");
    }
  });

  it("carries an accessible name", () => {
    const { container } = render(
      <DataTable<MockRow> data={MOCK_DATA} columns={MOCK_COLUMNS} label="ACC users directory" />,
    );
    expect(container.querySelector("table")?.getAttribute("aria-label")).toBe("ACC users directory");
  });

  // Under virtualization ~20 of 1,100 rows are in the DOM. Without these the
  // reader announces "row 4 of 20" — a confident, wrong position.
  it("reports the full row count and each row's true index", () => {
    const { container } = render(
      <DataTable<MockRow> data={MOCK_DATA} columns={MOCK_COLUMNS} label="Test people" />,
    );
    // 5 data rows + 1 header row.
    expect(container.querySelector("table")?.getAttribute("aria-rowcount")).toBe("6");

    const headerRow = container.querySelector("thead tr");
    expect(headerRow?.getAttribute("aria-rowindex")).toBe("1");

    const bodyRows = [...container.querySelectorAll("tbody tr")];
    expect(bodyRows.length).toBeGreaterThan(0);
    // First body row follows the header row.
    expect(bodyRows[0].getAttribute("aria-rowindex")).toBe("2");
    // Indices are contiguous and never restart at 1.
    bodyRows.forEach((tr, i) => {
      expect(tr.getAttribute("aria-rowindex")).toBe(String(i + 2));
    });
  });

  it("names each expand control after its row instead of repeating one label", () => {
    const { container } = render(
      <DataTable<MockRow>
        data={MOCK_DATA}
        columns={MOCK_COLUMNS}
        label="Test people"
        getRowLabel={(r) => r.name}
        renderExpanded={() => <span>peek</span>}
      />,
    );
    const labels = [...container.querySelectorAll("button[data-expand]")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels.length).toBeGreaterThan(1);
    expect(new Set(labels).size).toBe(labels.length); // all distinct
    expect(labels[0]).toBe("Expand Alice");
  });

  it("falls back to a generic expand label when no getRowLabel is supplied", () => {
    const { container } = render(
      <DataTable<MockRow> data={MOCK_DATA} columns={MOCK_COLUMNS} label="Test people" />,
    );
    expect(
      container.querySelector("button[data-expand]")?.getAttribute("aria-label"),
    ).toBe("Expand row");
  });

  it("marks the expand control's state and target", () => {
    const { container } = render(
      <DataTable<MockRow>
        data={MOCK_DATA}
        columns={MOCK_COLUMNS}
        label="Test people"
        renderExpanded={() => <span data-testid="peek">peek</span>}
      />,
    );
    const btn = container.querySelector("button[data-expand]") as HTMLButtonElement;
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    const after = container.querySelector("button[data-expand]") as HTMLButtonElement;
    expect(after.getAttribute("aria-expanded")).toBe("true");
    const controls = after.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    // jsdom has no CSS.escape, and row ids are not guaranteed selector-safe.
    expect(container.querySelector(`[id="${controls}"]`)).not.toBeNull();
  });

  it("renders a group band as a real row, not a floating rowheader div", () => {
    const { container } = render(
      <DataTable<MockRow>
        data={MOCK_DATA}
        columns={MOCK_COLUMNS}
        label="Test people"
        getGroupLabel={(r) => r.role}
      />,
    );
    const band = container.querySelector("[data-testid='group-header']");
    expect(band).not.toBeNull();
    expect(band!.tagName.toLowerCase()).toBe("tr");
    expect(band!.getAttribute("role")).toBe("row");
    // The band's own cell spans the row and is scoped to the group.
    const th = band!.querySelector("th");
    expect(th?.getAttribute("scope")).toBe("colgroup");
    // No element anywhere still uses the old free-floating rowheader role.
    expect(container.querySelectorAll("div[role='rowheader']")).toHaveLength(0);
  });

  it("exposes the density control as a toggle, not a plain button", () => {
    const { container } = render(
      <DataTable<MockRow> data={MOCK_DATA} columns={MOCK_COLUMNS} label="Test people" />,
    );
    const toggle = container.querySelector("[data-testid='density-toggle']") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(
      (container.querySelector("[data-testid='density-toggle']") as HTMLButtonElement)
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("puts aria-sort on a header that belongs to the table holding the data", () => {
    const { container } = render(
      <DataTable<MockRow>
        data={MOCK_DATA}
        columns={MOCK_COLUMNS}
        label="Test people"
        defaultSort={[{ id: "name", desc: false }]}
      />,
    );
    const table = container.querySelector("table")!;
    const sorted = [...table.querySelectorAll("th[aria-sort]")].find(
      (th) => th.getAttribute("aria-sort") !== "none",
    );
    expect(sorted?.getAttribute("aria-sort")).toBe("ascending");
    // The same table must actually contain data cells — the old split markup
    // put the sorted header in a table that had none.
    expect(table.querySelectorAll("td[data-cell]").length).toBeGreaterThan(0);
  });
});
