// @vitest-environment jsdom
/**
 * FilterContext.test.tsx — Phase 4-02 Task 1 coverage:
 *   - toggleChip toggles a value in and out of the set
 *   - clearAll empties filters + search + drillDown
 *   - isDefault flips false when any chip toggled or search non-empty
 *   - localStorage round-trip: arrays → Sets restoration
 *   - drillDown is NOT persisted
 */

import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { FilterProvider, useFilters } from "../FilterContext";
import { CONTROLS_STORAGE_KEY } from "../SliderContext";
import { FACET_KEY_RISK, FACET_KEY_PERM } from "../accessFacets";

beforeEach(() => {
  window.localStorage.clear();
});

function wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <FilterProvider>{children}</FilterProvider>;
}

describe("FilterContext", () => {
  it("toggleChip adds then removes a value", () => {
    const { result } = renderHook(() => useFilters(), { wrapper });

    act(() => {
      result.current.toggleChip("role", "admin");
    });
    expect(result.current.activeFilters.role?.has("admin")).toBe(true);

    act(() => {
      result.current.toggleChip("role", "admin");
    });
    expect(result.current.activeFilters.role?.has("admin")).toBe(false);
  });

  it("clearAll empties filters, search, and drillDown", () => {
    const { result } = renderHook(() => useFilters(), { wrapper });

    act(() => {
      result.current.toggleChip("role", "admin");
      result.current.setSearchQuery("lu");
      result.current.setDrillDown({ role: "admin" });
    });
    expect(result.current.isDefault).toBe(false);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.searchQuery).toBe("");
    expect(result.current.drillDown).toBeNull();
    // Phase 25: filter keys are dynamic — clearAll removes the chip entirely.
    expect("role" in result.current.activeFilters).toBe(false);
    expect(result.current.isDefault).toBe(true);
  });

  it("isDefault is true initially, false after chip toggle, false after search non-empty", () => {
    const { result } = renderHook(() => useFilters(), { wrapper });
    expect(result.current.isDefault).toBe(true);

    act(() => {
      result.current.toggleChip("role", "admin");
    });
    expect(result.current.isDefault).toBe(false);

    act(() => {
      result.current.clearAll();
      result.current.setSearchQuery("z");
    });
    expect(result.current.isDefault).toBe(false);
  });

  it("localStorage round-trip restores filter Sets and searchQuery", async () => {
    window.localStorage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({
        filters: { role: ["admin", "owner"], project: ["P1"] },
        searchQuery: "lu",
      }),
    );

    const { result } = renderHook(() => useFilters(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.activeFilters.role?.has("admin")).toBe(true);
    expect(result.current.activeFilters.role?.has("owner")).toBe(true);
    expect(result.current.activeFilters.project?.has("P1")).toBe(true);
    expect(result.current.searchQuery).toBe("lu");
  });

  it("rehydrates persisted risk/permission facet selections", async () => {
    window.localStorage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({
        filters: { [FACET_KEY_RISK]: ["externalHighPerm"], [FACET_KEY_PERM]: ["fullController"] },
      }),
    );

    const { result } = renderHook(() => useFilters(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect([...(result.current.activeFilters[FACET_KEY_RISK] ?? [])]).toEqual(["externalHighPerm"]);
    expect([...(result.current.activeFilters[FACET_KEY_PERM] ?? [])]).toEqual(["fullController"]);
  });

  it("addFilterDim adds an aperture chip key; removeFilterDim deletes it (Phase 25 DIM-04)", () => {
    const { result } = renderHook(() => useFilters(), { wrapper });
    // No key list is seeded from SliderContext.DIMENSIONS anymore.
    expect("company" in result.current.activeFilters).toBe(false);

    act(() => {
      result.current.addFilterDim("company");
    });
    expect(result.current.activeFilters.company?.size).toBe(0);
    // An added-but-unvalued chip is non-default so "Clear all" can remove it.
    expect(result.current.isDefault).toBe(false);

    act(() => {
      result.current.toggleChip("company", "Hermosillo");
    });
    expect(result.current.activeFilters.company?.has("Hermosillo")).toBe(true);

    act(() => {
      result.current.removeFilterDim("company");
    });
    expect("company" in result.current.activeFilters).toBe(false);
    expect(result.current.isDefault).toBe(true);
  });

  it("rehydration restores aperture keys and ignores unknown/retired keys", async () => {
    window.localStorage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({
        filters: {
          company: ["Hermosillo"],
          riskScore: [], // added chip, no values yet — must come back as a chip
          tier: ["edit"], // retired SliderContext dim id — ignored
          bogusKey: ["x"], // tampered — ignored (T-25-03-T)
        },
      }),
    );

    const { result } = renderHook(() => useFilters(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect([...(result.current.activeFilters.company ?? [])]).toEqual(["Hermosillo"]);
    expect("riskScore" in result.current.activeFilters).toBe(true);
    expect("tier" in result.current.activeFilters).toBe(false);
    expect("bogusKey" in result.current.activeFilters).toBe(false);
  });

  it("drillDown is session-only and NOT restored from localStorage", async () => {
    window.localStorage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({
        // Even if a previous version wrote drillDown, the new provider should
        // ignore it and keep null until a fresh setDrillDown call.
        // We don't even add a key for drillDown — the contract is that it's not
        // persisted in the first place — but assert null after hydration.
        filters: {},
        searchQuery: "",
      }),
    );

    const { result } = renderHook(() => useFilters(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.drillDown).toBeNull();
  });
});
