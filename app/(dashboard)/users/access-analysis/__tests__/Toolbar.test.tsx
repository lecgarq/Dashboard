// @vitest-environment jsdom
/**
 * Toolbar.test.tsx — Phase 4-02 Task 2, reworked in Phase 25 (DIM-04) coverage:
 *   - No always-visible chip wall: a "+ Filter" menu lists the themed aperture
 *     with inline coverage; chips render only for ADDED dimensions
 *   - Adding a dim then multi-selecting banded values toggles activeFilters
 *   - Removing a chip clears that dimension's filter key
 *   - Typing in search input updates FilterContext.searchQuery
 *   - the lasso toggle button is enabled (lasso works in 3D)
 *   - the 2D/3D mode toggle is absent (graph is 3D-only)
 *   - "Clear all" link visible only after a chip toggle; clearing restores isDefault
 */

import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { FilterProvider, useFilters } from "../FilterContext";
import { Toolbar } from "../Toolbar";
import { buildStructuralDimensions } from "../dimensionCatalog.structural";
import type { NodeFeatureSnapshot } from "../interactionTypes";

const CATALOG = buildStructuralDimensions();

function mkFeatures(): NodeFeatureSnapshot[] {
  return [
    {
      nodeId: "u1::p1",
      nameLower: "alice",
      emailLower: "alice@lecg.com",
      project: "P1",
      role: "admin",
      permTier: "edit",
      isExternal: false,
      activityBucket: "High",
      signinBucket: "<7d",
      activityCountRaw: 200,
      lastSignInRel: "today",
      permissionCoverage: "known" as const,
      firmName: "Hermosillo",
      accountStatus: "active",
    },
    {
      nodeId: "u2::p1",
      nameLower: "bob",
      emailLower: "bob@ext.com",
      project: "P1",
      role: "viewer",
      permTier: null,
      isExternal: true,
      activityBucket: "Low",
      signinBucket: "<30d",
      activityCountRaw: 3,
      lastSignInRel: "10d ago",
      permissionCoverage: "unknown" as const,
      firmName: "ACME",
      accountStatus: "",
    },
  ];
}

function Harness({
  initialMode = "2d",
  features = mkFeatures(),
  exposeFilters,
}: {
  initialMode?: "2d" | "3d";
  features?: NodeFeatureSnapshot[];
  exposeFilters?: (api: ReturnType<typeof useFilters>) => void;
}): React.JSX.Element {
  function Inner(): React.JSX.Element {
    const filters = useFilters();
    if (exposeFilters) exposeFilters(filters);
    return (
      <Toolbar
        features={features}
        catalog={CATALOG}
        mode={initialMode}
        onModeChange={() => {}}
        lassoActive={false}
        onLassoToggle={() => {}}
      />
    );
  }
  return (
    <FilterProvider>
      <Inner />
    </FilterProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("Toolbar — Phase 4-02 Task 2", () => {
  it("shows a '+ Filter' aperture menu with inline coverage instead of a chip wall (DIM-04/DIM-05)", () => {
    render(<Harness />);
    // No always-visible chips: nothing added yet.
    expect(document.querySelector("[data-testid^='dim-popover-']")).toBeNull();
    const menu = screen.getByTestId("toolbar-add-filter") as HTMLSelectElement;
    expect(menu).toBeTruthy();
    // Themed optgroups over the unified aperture, coverage stated inline.
    const companyOption = [...menu.querySelectorAll("option")].find((o) => o.value === "company");
    expect(companyOption).toBeTruthy();
    expect(companyOption!.textContent).toMatch(/Company · \d/);
    expect(companyOption!.closest("optgroup")?.label).toBe("Identity");
  });

  it("states the similarity position and active coverage without warning styling", () => {
    render(
      <FilterProvider>
        <Toolbar
          features={mkFeatures()}
          catalog={CATALOG}
          mode="2d"
          onModeChange={() => {}}
          lassoActive={false}
          onLassoToggle={() => {}}
          groupedByLabel="Role"
          groupedByDimId="role"
        />
      </FilterProvider>,
    );
    expect(screen.getByTestId("toolbar-grouped-by").textContent).toContain("Position: Similarity · Group into: Role");
    expect(screen.getByTestId("toolbar-grouped-by-coverage").textContent).toBe("Role data · 2/2");
    expect(screen.queryByText(/⚠/)).toBeNull();
  });

  it("adding a dimension renders its chip; multi-selecting banded values toggles activeFilters", () => {
    let api: ReturnType<typeof useFilters> | null = null;
    render(<Harness exposeFilters={(a) => (api = a)} />);
    act(() => {
      fireEvent.change(screen.getByTestId("toolbar-add-filter"), { target: { value: "company" } });
    });
    const chip = screen.getByTestId("dim-popover-company");
    act(() => {
      fireEvent.click(chip);
    });
    // Values are the aperture's banded/categorical labels derived from features.
    act(() => {
      fireEvent.click(screen.getByTestId("chip-company-Hermosillo"));
    });
    expect(api!.activeFilters.company?.has("Hermosillo")).toBe(true);
    act(() => {
      fireEvent.click(screen.getByTestId("chip-company-ACME"));
    });
    expect(api!.activeFilters.company?.has("ACME")).toBe(true);
    expect(api!.activeFilters.company?.size).toBe(2);
  });

  it("removing a chip clears that dimension's filter entirely", () => {
    let api: ReturnType<typeof useFilters> | null = null;
    render(<Harness exposeFilters={(a) => (api = a)} />);
    act(() => {
      fireEvent.change(screen.getByTestId("toolbar-add-filter"), { target: { value: "company" } });
    });
    act(() => {
      fireEvent.click(screen.getByTestId("dim-popover-company"));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("chip-company-Hermosillo"));
    });
    expect(api!.activeFilters.company?.has("Hermosillo")).toBe(true);

    act(() => {
      fireEvent.click(screen.getByTestId("dim-popover-remove-company"));
    });
    expect("company" in api!.activeFilters).toBe(false);
    expect(screen.queryByTestId("dim-popover-company")).toBeNull();
    expect(api!.isDefault).toBe(true);
  });

  it("typing in search input updates FilterContext.searchQuery", () => {
    let api: ReturnType<typeof useFilters> | null = null;
    render(<Harness exposeFilters={(a) => (api = a)} />);
    const input = screen.getByTestId("toolbar-search") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "lu" } });
    });
    expect(api!.searchQuery).toBe("lu");
  });

  it("clicking a value chip twice toggles it back off (values-to-keep multi-select)", () => {
    let api: ReturnType<typeof useFilters> | null = null;
    render(<Harness exposeFilters={(a) => (api = a)} />);
    act(() => {
      fireEvent.change(screen.getByTestId("toolbar-add-filter"), { target: { value: "role" } });
    });
    act(() => {
      fireEvent.click(screen.getByTestId("dim-popover-role"));
    });
    const chip = screen.getByTestId("chip-role-admin");
    act(() => {
      fireEvent.click(chip);
    });
    expect(api!.activeFilters.role?.has("admin")).toBe(true);

    // Click again — toggles off (the chip itself stays added).
    act(() => {
      fireEvent.click(chip);
    });
    expect(api!.activeFilters.role?.has("admin")).toBe(false);
  });

  it("mode==='3d' renders the lasso button as enabled (lasso works in 3D via screen-space projection)", () => {
    render(<Harness initialMode="3d" />);
    const lassoBtn = screen.getByTestId("toolbar-lasso") as HTMLButtonElement;
    expect(lassoBtn.disabled).toBe(false);
  });

  it("toolbar-mode-toggle is absent (3D-only: toggle removed)", () => {
    render(<Harness />);
    expect(screen.queryByTestId("toolbar-mode-toggle")).toBeNull();
  });

  it("'Clear all' visible only after filters become non-default; clicking restores isDefault", () => {
    let api: ReturnType<typeof useFilters> | null = null;
    render(<Harness exposeFilters={(a) => (api = a)} />);
    // Initial: clear-all not in DOM
    expect(screen.queryByTestId("toolbar-clear-all")).toBeNull();

    // Toggle a chip via context to flip non-default.
    act(() => {
      api!.toggleChip("role", "admin");
    });
    expect(api!.isDefault).toBe(false);
    const link = screen.getByTestId("toolbar-clear-all");
    expect(link).toBeTruthy();

    act(() => {
      fireEvent.click(link);
    });
    expect(api!.isDefault).toBe(true);
    expect(screen.queryByTestId("toolbar-clear-all")).toBeNull();
  });

  it("renders the Risk & Access disclosure and mounts the panel", () => {
    render(<Harness />);
    const trigger = screen.getByTestId("toolbar-risk-access");
    expect(trigger).toBeTruthy();
    act(() => {
      fireEvent.click(trigger);
    });
    // The panel (and its always-rendered risk rows) is mounted inside the disclosure.
    expect(screen.getByTestId("risk-access-panel")).toBeTruthy();
    expect(screen.getByTestId("risk-facet-externalHighPerm")).toBeTruthy();
  });
});
