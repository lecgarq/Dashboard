// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Radix Slider uses ResizeObserver, which is absent in jsdom.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { CatalogSection } from "./dimensionCatalog";

// ---------------------------------------------------------------------------
// Mock useSliders — isolates the component from the real SliderProvider
// ---------------------------------------------------------------------------

const mockSetSliderValue = vi.fn();
const mockResetAll = vi.fn();
const mockResetOne = vi.fn();

vi.mock("./SliderContext", () => ({
  useSliders: () => ({
    values: {} as Record<string, number>,
    setSliderValue: mockSetSliderValue,
    resetAll: mockResetAll,
    resetOne: mockResetOne,
  }),
}));

// ---------------------------------------------------------------------------
// Mock getCatalogSections and filterSections to control the tree directly.
// We inject them via vi.mock so the component uses our fake sections.
// ---------------------------------------------------------------------------

// Build a minimal catalog that covers:
//  - structural: one available slider dim + one greyed (no slider surface)
//  - activity: one module → one group → one available action + one greyed action
//  - folder: one greyed dim

const dim = (
  over: Partial<CatalogDimension> & { id: string; label: string },
): CatalogDimension => ({
  family: "structure",
  kind: "categorical",
  source: "t",
  confidence: "high",
  available: true,
  surfaces: ["slider"],
  extract: () => null,
  ...over,
});

const FAKE_SECTIONS: CatalogSection[] = [
  {
    kind: "structural",
    label: "Structure & Access",
    dims: [
      dim({ id: "project", label: "Project" }),
      dim({ id: "role", label: "Role", surfaces: [], available: false }),
    ],
  },
  {
    kind: "activity",
    label: "Activity",
    modules: [
      {
        moduleId: "build",
        moduleLabel: "Build",
        groups: [
          {
            groupId: "contentChange",
            groupLabel: "Content Change",
            actions: [
              dim({ id: "issue-create", label: "Create Issue", family: "activity" }),
              dim({ id: "issue-delete", label: "Delete Issue", family: "activity", available: false }),
            ],
          },
        ],
      },
    ],
  },
  {
    kind: "folder",
    label: "Folder attributes",
    dims: [dim({ id: "folder:size", label: "Folder Size", family: "folder", surfaces: [], available: false })],
  },
];

// The mocks must capture the query passed to filterSections so we can simulate
// the filter result. We replace filterSections with a simple substring filter
// over our FAKE_SECTIONS, and getCatalogSections returns the fixture directly.

vi.mock("./dimensionCatalog", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./dimensionCatalog")>();
  return {
    ...orig,
    getCatalogSections: () => FAKE_SECTIONS,
  };
});

vi.mock("./catalogSearch", () => ({
  filterSections: (sections: CatalogSection[], query: string): CatalogSection[] => {
    const q = query.trim().toLowerCase();
    if (q === "") return sections;
    return sections.map((s) => {
      if (s.kind === "activity") {
        const modules = (s.modules ?? [])
          .map((m) => ({
            ...m,
            groups: m.groups
              .map((g) => ({
                ...g,
                actions: g.actions.filter((a) => a.label.toLowerCase().includes(q)),
              }))
              .filter((g) => g.actions.length > 0),
          }))
          .filter((m) => m.groups.length > 0);
        return { ...s, modules };
      }
      const dims = (s.dims ?? []).filter((d) => d.label.toLowerCase().includes(q));
      return { ...s, dims };
    });
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import { CatalogSliderSidebar, renderFlatDim } from "./CatalogSliderSidebar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Empty catalog — getCatalogSections is mocked to always return FAKE_SECTIONS */
const EMPTY_CATALOG: CatalogDimension[] = [];

function renderSidebar(): void {
  render(<CatalogSliderSidebar catalog={EMPTY_CATALOG} />);
}

beforeEach(() => {
  mockSetSliderValue.mockClear();
  mockResetAll.mockClear();
  mockResetOne.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CatalogSliderSidebar", () => {
  // Test 1: sidebar mounts + structural section header
  it("renders the sidebar and the structural section header", () => {
    renderSidebar();
    expect(screen.getByTestId("catalog-slider-sidebar")).toBeTruthy();
    expect(screen.getByText("Structure & Access")).toBeTruthy();
  });

  // Test 2: available structural dim renders slider thumb; greyed dim renders DisabledRow
  it("renders a thumb for the available structural dim and a disabled row for the greyed one", () => {
    renderSidebar();
    // The available "Project" dim should have a slider thumb with aria-label
    const thumb = screen.getByRole("slider", { name: "Project thumb" });
    expect(thumb).toBeTruthy();

    // The greyed "Role" dim renders a disabled-dim-row with "no data"
    const disabledRows = screen.getAllByTestId("disabled-dim-row");
    // At minimum the Role row is present (plus folder row)
    const roleRow = disabledRows.find((el) => el.textContent?.includes("Role"));
    expect(roleRow).toBeTruthy();
    expect(roleRow!.textContent).toMatch(/no data/i);
  });

  // Test 3: activity module collapsed by default; expand module then group to see actions
  it("activity module is collapsed by default; clicking module + group reveals actions", () => {
    renderSidebar();

    // Activity section header is present
    expect(screen.getByTestId("catalog-section-activity")).toBeTruthy();

    // The "Build" module button should be visible
    const moduleBtns = screen.getAllByRole("button");
    const buildBtn = moduleBtns.find((b) => b.textContent?.includes("Build"));
    expect(buildBtn).toBeTruthy();

    // Actions are NOT in the document while module is collapsed
    expect(screen.queryByRole("slider", { name: "Create Issue thumb" })).toBeNull();

    // Click the module button to expand
    fireEvent.click(buildBtn!);

    // Now the group button should appear ("Content Change")
    const groupBtns = screen.getAllByRole("button");
    const groupBtn = groupBtns.find((b) => b.textContent?.includes("Content Change"));
    expect(groupBtn).toBeTruthy();

    // Action sliders are still not visible (group is collapsed)
    expect(screen.queryByRole("slider", { name: "Create Issue thumb" })).toBeNull();

    // Click the group button to expand
    fireEvent.click(groupBtn!);

    // Now the available action's slider appears
    const actionSlider = screen.getByRole("slider", { name: "Create Issue thumb" });
    expect(actionSlider).toBeTruthy();

    // The greyed action renders a disabled row
    const disabledRows = screen.getAllByTestId("disabled-dim-row");
    const deleteRow = disabledRows.find((el) => el.textContent?.includes("Delete Issue"));
    expect(deleteRow).toBeTruthy();
  });

  // Test 4: typing in the search box filters the structural section
  it("typing a query in the search box filters the structural section to matching dims", () => {
    renderSidebar();

    const searchInput = screen.getByTestId("dimension-search");

    // Before filtering: both structural dims are present (Project via slider, Role via disabled row)
    expect(screen.getByRole("slider", { name: "Project thumb" })).toBeTruthy();

    // Type "project" — should filter out "Role"
    fireEvent.change(searchInput, { target: { value: "project" } });

    // "Project" slider still present
    expect(screen.getByRole("slider", { name: "Project thumb" })).toBeTruthy();

    // "Role" disabled row should be gone from the structural section
    // (filterSections removes it when query is "project")
    const disabledRows = screen.queryAllByTestId("disabled-dim-row");
    const roleRow = disabledRows.find((el) => el.textContent?.includes("Role"));
    expect(roleRow).toBeUndefined();
  });

  // Test 5: Reset all button calls the resetAll spy
  it("clicking Reset all calls the resetAll spy", () => {
    renderSidebar();
    const resetBtn = screen.getByTestId("reset-all");
    fireEvent.click(resetBtn);
    expect(mockResetAll).toHaveBeenCalledTimes(1);
  });
});

describe("renderFlatDim", () => {
  const base: CatalogDimension = {
    id: "x", label: "X", family: "access", kind: "ordinal", source: "src",
    confidence: "high", available: true, surfaces: ["slider"], extract: () => 0,
  };
  const noop = () => {};

  it("skips available color-only dims (returns null)", () => {
    const colorOnly: CatalogDimension = { ...base, surfaces: ["color"] };
    expect(renderFlatDim(colorOnly, {}, noop, noop)).toBeNull();
  });
  it("returns an element for an available slider dim", () => {
    expect(renderFlatDim(base, {}, noop, noop)).not.toBeNull();
  });
  it("returns a disabled element for an unavailable dim", () => {
    expect(renderFlatDim({ ...base, available: false, surfaces: [] }, {}, noop, noop)).not.toBeNull();
  });
});
