// @vitest-environment jsdom
/**
 * Toolbar.test.tsx — Phase 4-02 Task 2 coverage:
 *   - Renders all 6 dimension popover triggers
 *   - Typing in search input updates FilterContext.searchQuery
 *   - Clicking a chip inside a popover toggles activeFilters for that dim
 *   - the lasso toggle button is enabled (lasso works in 3D)
 *   - the 2D/3D mode toggle is absent (graph is 3D-only)
 *   - "Clear all" link visible only after a chip toggle; clearing restores isDefault
 */

import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { FilterProvider, useFilters } from "../FilterContext";
import { Toolbar } from "../Toolbar";
import { DIMENSIONS } from "../SliderContext";
import type { NodeFeatureSnapshot } from "../interactionTypes";

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
      firmName: "",
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
      firmName: "",
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
  it("renders all 6 dimension popover triggers", () => {
    render(<Harness />);
    for (const d of DIMENSIONS) {
      expect(screen.getByTestId(`dim-popover-${d.id}`)).toBeTruthy();
    }
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

  it("clicking a chip inside a popover toggles activeFilters for that dim", () => {
    let api: ReturnType<typeof useFilters> | null = null;
    render(<Harness exposeFilters={(a) => (api = a)} />);
    // Open the role popover, then click the "admin" chip.
    const roleTrigger = screen.getByTestId("dim-popover-role");
    act(() => {
      fireEvent.click(roleTrigger);
    });
    const chip = screen.getByTestId("chip-role-admin");
    act(() => {
      fireEvent.click(chip);
    });
    expect(api!.activeFilters.role?.has("admin")).toBe(true);

    // Click again — toggles off.
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
