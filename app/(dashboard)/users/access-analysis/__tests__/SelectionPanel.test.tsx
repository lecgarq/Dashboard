// @vitest-environment jsdom
/**
 * SelectionPanel.test.tsx — in-memory selection analytics (no DuckDB).
 *
 * The lasso panel now aggregates straight off the feature snapshot
 * (selectionAggregates), so there is NO async data source to mock. These tests
 * assert:
 *   - Header renders the visible selection count.
 *   - KPI strip reflects in-memory counts (users / external / admins / projects).
 *   - Role + Project donut legends render from the selected features.
 *   - Clicking a role chip sets FilterContext.drillDown; same chip clears it.
 *   - Clicking a project chip drills on the `project` dimension.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { SelectionPanel } from "../SelectionPanel";
import { FilterProvider, useFilters } from "../FilterContext";
import type { NodeFeatureSnapshot } from "../interactionTypes";

function feature(over: Partial<NodeFeatureSnapshot>): NodeFeatureSnapshot {
  return {
    nodeId: "u::p",
    nameLower: "",
    emailLower: "",
    project: "P1",
    role: "admin",
    permTier: null,
    isExternal: false,
    activityBucket: "Low",
    signinBucket: "<30d",
    activityCountRaw: 1,
    lastSignInRel: "today",
    permissionCoverage: "unknown",
    firmName: "",
    accountStatus: "",
    ...over,
  };
}

// Roles: admin×2, viewer×1. Projects: P1×2, P2×1.
// External: 1 (idx 1). Admins: 1 (idx 0). Distinct projects: 2.
const STABLE_FEATURES: NodeFeatureSnapshot[] = [
  feature({ role: "admin", project: "P1", isExternal: false, isAdmin: true }),
  feature({ role: "viewer", project: "P1", isExternal: true, isAdmin: false }),
  feature({ role: "admin", project: "P2", isExternal: false, isAdmin: false }),
];
const STABLE_SELECTION = new Set([0, 1, 2]);

function Harness({
  expose,
}: {
  expose?: (api: ReturnType<typeof useFilters>) => void;
}): React.JSX.Element {
  function Inner(): React.JSX.Element {
    const api = useFilters();
    if (expose) expose(api);
    return (
      <SelectionPanel
        visibleSelectedIndices={STABLE_SELECTION}
        features={STABLE_FEATURES}
        onClear={() => {}}
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

describe("SelectionPanel — in-memory analytics", () => {
  it("renders header with selection count", () => {
    render(<Harness />);
    expect(screen.getByTestId("selection-count").textContent).toBe("3");
  });

  it("renders KPI strip from in-memory counts", () => {
    render(<Harness />);
    expect(screen.getByTestId("kpi-users").textContent).toBe("3");
    expect(screen.getByTestId("kpi-external").textContent).toBe("1");
    expect(screen.getByTestId("kpi-admins").textContent).toBe("1");
    expect(screen.getByTestId("kpi-projects").textContent).toBe("2");
  });

  it("renders role + project donut legends from the selected features", () => {
    render(<Harness />);
    expect(screen.getByTestId("drill-legend-role")).toBeTruthy();
    expect(screen.getByTestId("drill-legend-project")).toBeTruthy();
    expect(screen.getByTestId("drill-role-admin")).toBeTruthy();
    expect(screen.getByTestId("drill-role-viewer")).toBeTruthy();
    expect(screen.getByTestId("drill-project-P1")).toBeTruthy();
    expect(screen.getByTestId("drill-project-P2")).toBeTruthy();
  });

  it("clicking a role chip sets FilterContext.drillDown, same chip clears it", () => {
    let api: ReturnType<typeof useFilters> | null = null;
    render(<Harness expose={(a) => (api = a)} />);

    act(() => {
      fireEvent.click(screen.getByTestId("drill-role-admin"));
    });
    expect(api!.drillDown).toEqual({ role: "admin" });

    act(() => {
      fireEvent.click(screen.getByTestId("drill-role-admin"));
    });
    expect(api!.drillDown).toBeNull();
  });

  it("clicking a project chip drills on the project dimension", () => {
    let api: ReturnType<typeof useFilters> | null = null;
    render(<Harness expose={(a) => (api = a)} />);

    act(() => {
      fireEvent.click(screen.getByTestId("drill-project-P2"));
    });
    expect(api!.drillDown).toEqual({ project: "P2" });
  });
});
