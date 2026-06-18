// @vitest-environment jsdom
/**
 * Unit tests for useUsersDirectoryStore.
 *
 * Strategy: call actions via useUsersDirectoryStore.getState() and reset state
 * between tests using setState to initial values. No React rendering needed —
 * this is pure Zustand store behaviour.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useUsersDirectoryStore } from "./useUsersDirectoryStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useUsersDirectoryStore.setState({
    search: "",
    debouncedSearch: "",
    viewMode: "grid",
    groupBy: "none",
    filterDept: null,
    filterJobTitle: null,
    filterCostCenter: null,
    filterNoProjects: false,
    filterAccProject: null,
    filterAccRole: null,
    filterAccModule: null,
    filterAccModuleTier: null,
    statusFilter: [],
    projectAdminFilter: false,
    activitySort: { active: false, direction: "desc" },
    selectedEmail: null,
    activityEmail: null,
    activatedEmails: new Set<string>(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useUsersDirectoryStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------
  it("starts with all initial values matching monolith defaults", () => {
    const s = useUsersDirectoryStore.getState();
    expect(s.search).toBe("");
    expect(s.debouncedSearch).toBe("");
    expect(s.viewMode).toBe("grid");
    expect(s.groupBy).toBe("none");
    expect(s.filterDept).toBeNull();
    expect(s.filterJobTitle).toBeNull();
    expect(s.filterCostCenter).toBeNull();
    expect(s.filterNoProjects).toBe(false);
    expect(s.filterAccProject).toBeNull();
    expect(s.filterAccRole).toBeNull();
    expect(s.filterAccModule).toBeNull();
    expect(s.filterAccModuleTier).toBeNull();
    expect(s.statusFilter).toEqual([]);
    expect(s.projectAdminFilter).toBe(false);
    expect(s.activitySort).toEqual({ active: false, direction: "desc" });
    expect(s.selectedEmail).toBeNull();
    expect(s.activityEmail).toBeNull();
    expect(s.activatedEmails.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Individual setters
  // -------------------------------------------------------------------------
  it("setFilterDept sets and clears the filter", () => {
    const { setFilterDept } = useUsersDirectoryStore.getState();
    setFilterDept("Engineering");
    expect(useUsersDirectoryStore.getState().filterDept).toBe("Engineering");
    setFilterDept(null);
    expect(useUsersDirectoryStore.getState().filterDept).toBeNull();
  });

  it("setFilterJobTitle sets and clears the filter", () => {
    const { setFilterJobTitle } = useUsersDirectoryStore.getState();
    setFilterJobTitle("Manager");
    expect(useUsersDirectoryStore.getState().filterJobTitle).toBe("Manager");
    setFilterJobTitle(null);
    expect(useUsersDirectoryStore.getState().filterJobTitle).toBeNull();
  });

  it("setFilterCostCenter sets and clears the filter", () => {
    const { setFilterCostCenter } = useUsersDirectoryStore.getState();
    setFilterCostCenter("CC-01");
    expect(useUsersDirectoryStore.getState().filterCostCenter).toBe("CC-01");
    setFilterCostCenter(null);
    expect(useUsersDirectoryStore.getState().filterCostCenter).toBeNull();
  });

  it("setViewMode changes between grid and list", () => {
    const { setViewMode } = useUsersDirectoryStore.getState();
    setViewMode("list");
    expect(useUsersDirectoryStore.getState().viewMode).toBe("list");
    setViewMode("grid");
    expect(useUsersDirectoryStore.getState().viewMode).toBe("grid");
  });

  it("setGroupBy changes the grouping field", () => {
    const { setGroupBy } = useUsersDirectoryStore.getState();
    setGroupBy("department");
    expect(useUsersDirectoryStore.getState().groupBy).toBe("department");
    setGroupBy("none");
    expect(useUsersDirectoryStore.getState().groupBy).toBe("none");
  });

  it("setSelectedEmail stores a string and can be cleared", () => {
    const { setSelectedEmail } = useUsersDirectoryStore.getState();
    setSelectedEmail("alice@hermosillo.com");
    expect(useUsersDirectoryStore.getState().selectedEmail).toBe("alice@hermosillo.com");
    setSelectedEmail(null);
    expect(useUsersDirectoryStore.getState().selectedEmail).toBeNull();
  });

  it("setActivityEmail stores a string and can be cleared", () => {
    const { setActivityEmail } = useUsersDirectoryStore.getState();
    setActivityEmail("bob@hermosillo.com");
    expect(useUsersDirectoryStore.getState().activityEmail).toBe("bob@hermosillo.com");
    setActivityEmail(null);
    expect(useUsersDirectoryStore.getState().activityEmail).toBeNull();
  });

  // -------------------------------------------------------------------------
  // clearAllFilters — resets filters + search (mirrors monolith's clearAllFilters)
  // -------------------------------------------------------------------------
  it("clearAllFilters resets all 10 filters plus search and debouncedSearch", () => {
    // Set several filters and search state
    useUsersDirectoryStore.setState({
      filterDept: "Engineering",
      filterJobTitle: "Manager",
      filterCostCenter: "CC-01",
      filterNoProjects: true,
      filterAccProject: "Tower A",
      filterAccRole: "Project Admin",
      filterAccModule: "documentManagement",
      filterAccModuleTier: "view",
      statusFilter: ["active"],
      projectAdminFilter: true,
      search: "alice",
      debouncedSearch: "alice",
    });

    useUsersDirectoryStore.getState().clearAllFilters();

    const s = useUsersDirectoryStore.getState();
    expect(s.filterDept).toBeNull();
    expect(s.filterJobTitle).toBeNull();
    expect(s.filterCostCenter).toBeNull();
    expect(s.filterNoProjects).toBe(false);
    expect(s.filterAccProject).toBeNull();
    expect(s.filterAccRole).toBeNull();
    expect(s.filterAccModule).toBeNull();
    expect(s.filterAccModuleTier).toBeNull();
    expect(s.statusFilter).toEqual([]);
    expect(s.projectAdminFilter).toBe(false);
    expect(s.search).toBe("");
    expect(s.debouncedSearch).toBe("");
  });

  // -------------------------------------------------------------------------
  // cycleActivitySort — off -> desc -> asc -> off
  // -------------------------------------------------------------------------
  it("cycleActivitySort cycles off -> desc -> asc -> off", () => {
    const { cycleActivitySort } = useUsersDirectoryStore.getState();

    // Initial: off
    expect(useUsersDirectoryStore.getState().activitySort).toEqual({
      active: false,
      direction: "desc",
    });

    // First click: off -> desc
    cycleActivitySort();
    expect(useUsersDirectoryStore.getState().activitySort).toEqual({
      active: true,
      direction: "desc",
    });

    // Second click: desc -> asc
    cycleActivitySort();
    expect(useUsersDirectoryStore.getState().activitySort).toEqual({
      active: true,
      direction: "asc",
    });

    // Third click: asc -> off
    cycleActivitySort();
    expect(useUsersDirectoryStore.getState().activitySort).toEqual({
      active: false,
      direction: "desc",
    });
  });

  // -------------------------------------------------------------------------
  // activateEmail — idempotent add to activatedEmails
  // -------------------------------------------------------------------------
  it("activateEmail adds email to activatedEmails", () => {
    const { activateEmail } = useUsersDirectoryStore.getState();
    activateEmail("alice@hermosillo.com");
    expect(useUsersDirectoryStore.getState().activatedEmails.has("alice@hermosillo.com")).toBe(true);
  });

  it("activateEmail is idempotent — returns same Set reference when already present", () => {
    const { activateEmail } = useUsersDirectoryStore.getState();
    activateEmail("alice@hermosillo.com");
    const setAfterFirst = useUsersDirectoryStore.getState().activatedEmails;

    activateEmail("alice@hermosillo.com"); // no-op call
    const setAfterSecond = useUsersDirectoryStore.getState().activatedEmails;

    // Same reference — no new Set created, no spurious re-render
    expect(setAfterFirst).toBe(setAfterSecond);
    expect(setAfterSecond.size).toBe(1);
  });

  it("activateEmail allows multiple distinct emails", () => {
    const { activateEmail } = useUsersDirectoryStore.getState();
    activateEmail("alice@hermosillo.com");
    activateEmail("bob@hermosillo.com");
    const { activatedEmails } = useUsersDirectoryStore.getState();
    expect(activatedEmails.size).toBe(2);
    expect(activatedEmails.has("alice@hermosillo.com")).toBe(true);
    expect(activatedEmails.has("bob@hermosillo.com")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // applyModuleFilterFromSidePanel
  // -------------------------------------------------------------------------
  it("applyModuleFilterFromSidePanel sets filterAccModule and filterAccModuleTier", () => {
    const { applyModuleFilterFromSidePanel } = useUsersDirectoryStore.getState();
    applyModuleFilterFromSidePanel("documentManagement", "view");
    const s = useUsersDirectoryStore.getState();
    expect(s.filterAccModule).toBe("documentManagement");
    expect(s.filterAccModuleTier).toBe("view");
  });

  it("applyModuleFilterFromSidePanel sets filterAccModuleTier to null when tier is empty string", () => {
    const { applyModuleFilterFromSidePanel } = useUsersDirectoryStore.getState();
    applyModuleFilterFromSidePanel("documentManagement", "");
    const s = useUsersDirectoryStore.getState();
    expect(s.filterAccModule).toBe("documentManagement");
    expect(s.filterAccModuleTier).toBeNull();
  });

  // -------------------------------------------------------------------------
  // setStatusFilter — supports functional updater (matching useState pattern)
  // -------------------------------------------------------------------------
  it("setStatusFilter works with a direct value", () => {
    const { setStatusFilter } = useUsersDirectoryStore.getState();
    setStatusFilter(["active", "pending"]);
    expect(useUsersDirectoryStore.getState().statusFilter).toEqual(["active", "pending"]);
  });

  it("setStatusFilter works with a functional updater", () => {
    const { setStatusFilter } = useUsersDirectoryStore.getState();
    setStatusFilter(["active"]);
    setStatusFilter((prev) => [...prev, "pending"]);
    expect(useUsersDirectoryStore.getState().statusFilter).toEqual(["active", "pending"]);
  });

  // -------------------------------------------------------------------------
  // setProjectAdminFilter — supports functional updater
  // -------------------------------------------------------------------------
  it("setProjectAdminFilter toggles via functional updater", () => {
    const { setProjectAdminFilter } = useUsersDirectoryStore.getState();
    setProjectAdminFilter((prev) => !prev);
    expect(useUsersDirectoryStore.getState().projectAdminFilter).toBe(true);
    setProjectAdminFilter((prev) => !prev);
    expect(useUsersDirectoryStore.getState().projectAdminFilter).toBe(false);
  });
});
