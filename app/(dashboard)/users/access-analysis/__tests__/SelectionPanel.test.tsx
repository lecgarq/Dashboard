// @vitest-environment jsdom
/**
 * SelectionPanel.test.tsx — Phase 4-02 Task 3 coverage:
 *   - Renders header with the visible selection count
 *   - Awaits the mocked selectionQueries and renders both donut legends
 *   - Clicking a role legend chip sets FilterContext.drillDown
 *   - Clicking the SAME chip again clears drillDown
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import type { DonutSlice } from "../DonutPanel";

// Mock selectionQueries BEFORE importing SelectionPanel.
const mockRoleSlices: DonutSlice[] = [
  { label: "admin", value: 5, color: "#3b82f6" },
  { label: "viewer", value: 2, color: "#10b981" },
];
const mockTierSlices: DonutSlice[] = [
  { label: "edit", value: 4, color: "#f59e0b" },
  { label: "view", value: 3, color: "#ef4444" },
];

vi.mock("../selectionQueries", () => ({
  aggregateSelectionByRole: vi.fn(async () => mockRoleSlices),
  aggregateSelectionByTier: vi.fn(async () => mockTierSlices),
  PALETTE: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"],
  colorForIndex: (i: number) => "#3b82f6",
}));

import { SelectionPanel } from "../SelectionPanel";
import { FilterProvider, useFilters } from "../FilterContext";
import type { NodeFeatureSnapshot } from "../interactionTypes";

function mkFeatures(n: number): NodeFeatureSnapshot[] {
  return Array.from({ length: n }, (_, i) => ({
    nodeId: `u${i}::p1`,
    nameLower: `n${i}`,
    emailLower: `n${i}@x.com`,
    project: "P1",
    role: i % 2 === 0 ? "admin" : "viewer",
    permTier: null,
    isExternal: false,
    activityBucket: "Low" as const,
    signinBucket: "<30d" as const,
    activityCountRaw: 1,
    lastSignInRel: "today",
    permissionCoverage: "unknown" as const,
    firmName: "",
    accountStatus: "",
  }));
}

// Stable across renders — otherwise SelectionPanel's effect (dep: features)
// re-runs on every Inner re-render and flips loading=true, hiding the chips.
const STABLE_FEATURES = mkFeatures(3);
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

async function flush(): Promise<void> {
  // Wait for the SelectionPanel's effect-driven Promise.all to resolve.
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

describe("SelectionPanel — Phase 4-02 Task 3", () => {
  it("renders header with selection count", async () => {
    render(<Harness />);
    await flush();
    expect(screen.getByTestId("selection-count").textContent).toBe("3");
  });

  it("renders both donut legends after selectionQueries resolve", async () => {
    render(<Harness />);
    await flush();
    expect(screen.getByTestId("drill-legend-role")).toBeTruthy();
    expect(screen.getByTestId("drill-legend-tier")).toBeTruthy();
    expect(screen.getByTestId("drill-role-admin")).toBeTruthy();
    expect(screen.getByTestId("drill-tier-edit")).toBeTruthy();
  });

  it("clicking a role legend chip sets FilterContext.drillDown", async () => {
    let api: ReturnType<typeof useFilters> | null = null;
    render(<Harness expose={(a) => (api = a)} />);
    await flush();

    act(() => {
      fireEvent.click(screen.getByTestId("drill-role-admin"));
    });
    expect(api!.drillDown).toEqual({ role: "admin" });
  });

  it("clicking the SAME chip again clears drillDown", async () => {
    let api: ReturnType<typeof useFilters> | null = null;
    render(<Harness expose={(a) => (api = a)} />);
    await flush();

    act(() => {
      fireEvent.click(screen.getByTestId("drill-role-admin"));
    });
    expect(api!.drillDown).toEqual({ role: "admin" });

    act(() => {
      fireEvent.click(screen.getByTestId("drill-role-admin"));
    });
    expect(api!.drillDown).toBeNull();
  });
});
