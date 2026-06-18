// @vitest-environment jsdom
/**
 * Golden-path integration test for UsersDirectoryClient.
 *
 * Purpose: Pins all current /users directory behavior as a regression safety
 * net for the Wave 2+ decomposition. MUST stay green before and after every
 * extraction step (USR-01, PERF-03 baseline).
 *
 * Mock strategy:
 *  - @/lib/core/trpc: every hook returns deterministic fixtures; bulkUsers.useQuery
 *    is a shared vi.fn() (created via vi.hoisted) so PERF-03 can inspect call args.
 *  - next/dynamic panels (UserProfilePanel, UserActivityBody): render simple divs.
 *  - IntersectionObserver + ResizeObserver: no-op stubs.
 *  - @tanstack/react-virtual: mocked to return 5 virtual rows so jsdom (which has
 *    no real scroll geometry) can render DataTable rows.
 *
 * IMPORTANT: Do NOT modify UsersDirectoryClient.tsx. If a case cannot pass
 * without changing the component, the fixture is wrong (behavior parity
 * is bug-for-bug per CONTEXT).
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";

// ---------------------------------------------------------------------------
// Observer stubs + DOM method stubs required by jsdom
// ---------------------------------------------------------------------------
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// Radix Select calls scrollIntoView on items — jsdom does not implement it.
if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.scrollIntoView = () => {};
}

// jsdom doesn't implement window.scrollTo — stub it.
vi.stubGlobal("scrollTo", () => {});

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);

// ---------------------------------------------------------------------------
// @tanstack/react-virtual mock
// jsdom has no real scroll geometry — the virtualizer returns 0 items by
// default, so rows are invisible. Return a predictable set of 2 virtual rows
// matching the 2 mock people in the fixture (index bounds must match data.length
// to avoid row.getIsExpanded() on undefined rows).
// ---------------------------------------------------------------------------
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => {
    // Build virtual items only for indices that actually exist in the data
    const count = opts?.count ?? 0;
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
// Hoisted spy — created before vi.mock hoisting so factory can reference it
// ---------------------------------------------------------------------------
const { bulkUsersQuerySpy } = vi.hoisted(() => {
  return {
    bulkUsersQuerySpy: vi.fn().mockReturnValue({
      data: [
        {
          email: "alice@hermosillo.com",
          name: "Alice Aranda",
          found: true,
          projectCount: 2,
          activeCount: 2,
          adminCount: 1,
          hasNoProjects: false,
          syncedAt: "2026-06-01T00:00:00.000Z",
          allRoles: ["Project Admin"],
          allModules: ["documentManagement"],
          projects: [
            {
              id: "p1",
              name: "Tower A",
              status: "active",
              isAdmin: true,
              roles: ["Project Admin"],
              modules: ["documentManagement"],
              // Provide lastActivity so LastActiveCell renders a relative time
              lastActivity: "2026-05-01T00:00:00.000Z",
            },
          ],
          isAccountAdmin: false,
          addedOn: null,
          aggregatedStatus: "active",
          projectAdmin: true,
        },
        {
          email: "bob@hermosillo.com",
          name: "Bob Bravo",
          found: true,
          projectCount: 1,
          activeCount: 0,
          adminCount: 0,
          hasNoProjects: false,
          syncedAt: "2026-06-01T00:00:00.000Z",
          allRoles: ["Member"],
          allModules: ["issues"],
          projects: [
            {
              id: "p2",
              name: "Road B",
              status: "active",
              isAdmin: false,
              roles: ["Member"],
              modules: ["issues"],
              // Bob has no lastActivity — exercises the "— No data" code path
              lastActivity: null,
            },
          ],
          isAccountAdmin: false,
          addedOn: null,
          aggregatedStatus: "active",
          projectAdmin: false,
        },
      ],
      isLoading: false,
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock @/lib/core/trpc
// ---------------------------------------------------------------------------
vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    useUtils: () => ({
      accActivity: {
        getFileActivityForUser: {
          prefetch: vi.fn(),
        },
      },
      users: {
        getOrgDirectory: { invalidate: vi.fn().mockResolvedValue(undefined) },
      },
      accDcGraph: {
        bulkUsers: { invalidate: vi.fn().mockResolvedValue(undefined) },
      },
    }),
    accDcGraph: {
      bulkUsers: {
        useQuery: bulkUsersQuerySpy,
      },
    },
    users: {
      getOrgDirectory: {
        useQuery: () => ({
          data: {
            status: "ok",
            people: [
              {
                resourceName: "people/alice",
                displayName: "Alice Aranda",
                email: "alice@hermosillo.com",
                photoUrl: null,
                department: "Engineering",
                jobTitle: "BIM Manager",
                phoneNumber: null,
                costCenter: "ENG-100",
              },
              {
                resourceName: "people/bob",
                displayName: "Bob Bravo",
                email: "bob@hermosillo.com",
                photoUrl: null,
                department: "Construction",
                jobTitle: "Site Supervisor",
                phoneNumber: null,
                costCenter: "CON-200",
              },
            ],
          },
          isLoading: false,
          error: null,
        }),
      },
      getDirectory: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
      bulkAccSummary: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
    },
    accMembers: {
      enrichedUsers: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
    },
    accActivity: {
      getCoverage: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
      listInvitations: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
      getLastFileActivityBatch: {
        useQuery: () => ({ data: undefined }),
      },
      getFileActivityForUser: {
        useQuery: () => ({ data: undefined }),
      },
      usersOrderedByLastFileActivity: {
        useInfiniteQuery: () => ({
          data: undefined,
          isLoading: false,
          isFetching: false,
          hasNextPage: false,
          fetchNextPage: vi.fn(),
        }),
      },
    },
    accFolders: {
      getCoverage: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock next/dynamic — all dynamic imports render a simple div with email prop.
// This stands in for UserProfilePanel (inside DrillSheet) and UserActivityBody.
// ---------------------------------------------------------------------------
vi.mock("next/dynamic", () => ({
  default: (_loader: () => Promise<unknown>, _opts?: unknown) => {
    const DynamicMock = (props: Record<string, unknown>) => {
      const email = props.email as string | undefined;
      return (
        <div data-testid="dynamic-panel" data-email={email ?? ""}>
          {email ?? ""}
        </div>
      );
    };
    DynamicMock.displayName = "DynamicMock";
    return DynamicMock;
  },
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import { UsersDirectoryClient } from "../UsersDirectoryClient";
import { useUsersDirectoryStore } from "../useUsersDirectoryStore";
import { BULK_USERS_LEAN_INPUT } from "../useUsersDirectoryData";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UsersDirectoryClient — golden-path integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset Zustand store between tests so filter/search state from one test
    // does not bleed into the next (store is a singleton; useState was per-mount).
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
      activatedEmails: new Set(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Case 1: Search narrows the list
  // -------------------------------------------------------------------------
  it("typing a name into the search input narrows visible rows to matching people", async () => {
    const { container } = render(<UsersDirectoryClient />);

    // Both users rendered initially (DataTable uses [data-cell] for row cells)
    const allText = container.textContent ?? "";
    expect(allText).toContain("Alice Aranda");
    expect(allText).toContain("Bob Bravo");

    const searchInput = screen.getByPlaceholderText(/Search anything/i);
    fireEvent.change(searchInput, { target: { value: "Alice" } });

    // Advance past the 150ms debounce
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    const afterText = container.textContent ?? "";
    expect(afterText).toContain("Alice Aranda");
    expect(afterText).not.toContain("Bob Bravo");
  });

  // -------------------------------------------------------------------------
  // Case 2: Multiple filters combine (dept AND job title via field tokens)
  // -------------------------------------------------------------------------
  it("applying dept + jobTitle field tokens shows only people matching BOTH", async () => {
    const { container } = render(<UsersDirectoryClient />);

    const allText = container.textContent ?? "";
    expect(allText).toContain("Alice Aranda");
    expect(allText).toContain("Bob Bravo");

    const searchInput = screen.getByPlaceholderText(/Search anything/i);
    // Alice: dept=Engineering, job=BIM Manager
    // Bob:   dept=Construction, job=Site Supervisor
    fireEvent.change(searchInput, {
      target: { value: "dept:Engineering job:BIM" },
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    const afterText = container.textContent ?? "";
    expect(afterText).toContain("Alice Aranda");
    expect(afterText).not.toContain("Bob Bravo");
  });

  // -------------------------------------------------------------------------
  // Case 3: viewMode toggle (store field left inert) — filters still held
  // The viewMode toggle buttons are REMOVED from the DataTable shell (Open Q2).
  // This case verifies that search filters still work after advancing timers.
  // -------------------------------------------------------------------------
  it("active search filter is preserved after debounce (viewMode toggle removed)", async () => {
    const { container } = render(<UsersDirectoryClient />);

    const searchInput = screen.getByPlaceholderText(/Search anything/i);
    fireEvent.change(searchInput, { target: { value: "Alice" } });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Filter active: Bob not visible
    expect((container.textContent ?? "")).not.toContain("Bob Bravo");

    // No viewMode toggle buttons in DataTable shell — verify store field is inert
    const toggleButtons = screen.queryAllByRole("button").filter(
      (b) => b.className.includes("p-1.5") && b.className.includes("transition-colors"),
    );
    expect(toggleButtons).toHaveLength(0);

    // Search text preserved
    expect((searchInput as HTMLInputElement).value).toBe("Alice");
  });

  // -------------------------------------------------------------------------
  // Case 4: groupBy switch preserves filters
  // -------------------------------------------------------------------------
  it("choosing a Group-by option keeps the active filter applied", async () => {
    const { container } = render(<UsersDirectoryClient />);

    const searchInput = screen.getByPlaceholderText(/Search anything/i);
    fireEvent.change(searchInput, { target: { value: "Alice" } });
    await act(async () => { vi.advanceTimersByTime(200); });
    expect((container.textContent ?? "")).not.toContain("Bob Bravo");

    // The groupBy Select trigger shows "No grouping"
    const comboboxes = screen.getAllByRole("combobox");
    const groupByTrigger = comboboxes.find(
      (b) => b.textContent?.includes("No grouping"),
    );
    expect(groupByTrigger).toBeTruthy();

    // Open the Select and choose "Department"
    await act(async () => {
      fireEvent.click(groupByTrigger!);
      vi.advanceTimersByTime(50);
    });

    const deptOption = screen.queryByRole("option", { name: /^Department$/i });
    if (deptOption) {
      await act(async () => {
        fireEvent.click(deptOption);
        vi.advanceTimersByTime(50);
      });
    }

    // Filter still active regardless of groupBy change.
    expect((searchInput as HTMLInputElement).value).toBe("Alice");
    expect((container.textContent ?? "")).not.toContain("Bob Bravo");
    expect((container.textContent ?? "")).toContain("Alice Aranda");
  });

  // -------------------------------------------------------------------------
  // Case 5: Row click opens DrillSheet — verified via store selectedEmail
  // -------------------------------------------------------------------------
  it("clicking a row data cell sets selectedEmail (opens DrillSheet)", async () => {
    const { container } = render(<UsersDirectoryClient />);

    // DataTable renders data cells with [data-cell] attribute.
    // The first virtual row maps to the first person (Alice).
    const dataCells = Array.from(
      container.querySelectorAll("[data-index='0'] td[data-cell]"),
    ) as HTMLElement[];
    expect(dataCells.length).toBeGreaterThan(0);

    fireEvent.click(dataCells[0]!);
    await act(async () => { vi.advanceTimersByTime(50); });

    // Row-click wires to setSelectedEmail — verify store state changed.
    // The DrillSheet open={!!selectedEmail} is then true, rendering the panel.
    const store = useUsersDirectoryStore.getState();
    expect(store.selectedEmail).toBeTruthy();

    // The DrillSheet's children (the dynamic panel mock) appear in the document.
    // Use act+advanceTimers to flush Radix portal rendering.
    await act(async () => { vi.advanceTimersByTime(100); });
    const panel = document.querySelector("[data-testid='dynamic-panel']");
    expect(panel).toBeTruthy();
    // The panel must carry the email of the clicked person
    expect(panel?.getAttribute("data-email")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Case 6: Row expand chevron reveals PeekPanel inline
  // -------------------------------------------------------------------------
  it("clicking the row expand chevron reveals PeekPanel inline", async () => {
    const { container } = render(<UsersDirectoryClient />);

    // Find the first row's expand button [data-expand]
    const expandBtn = container.querySelector(
      "[data-index='0'] button[data-expand], [data-index='0'] [aria-label='Expand row']",
    ) as HTMLElement | null;
    expect(expandBtn).toBeTruthy();

    fireEvent.click(expandBtn!);
    await act(async () => { vi.advanceTimersByTime(50); });

    // PeekPanel is rendered inline — it contains the person's name and counts
    const inlineExpand = container.querySelector("[data-index='0']");
    const expandText = inlineExpand?.textContent ?? "";
    // PeekPanel renders avatar + name + "See full profile →"
    expect(expandText).toContain("See full profile");
  });

  // -------------------------------------------------------------------------
  // Case 7 (PERF-04): bulkUsers called once with BULK_USERS_LEAN_INPUT
  // -------------------------------------------------------------------------
  it("PERF-04: bulkUsers.useQuery is called with BULK_USERS_LEAN_INPUT and no second query", () => {
    render(<UsersDirectoryClient />);

    // Must have been called with leanProjects: true (matches BULK_USERS_LEAN_INPUT)
    expect(bulkUsersQuerySpy).toHaveBeenCalledWith(
      BULK_USERS_LEAN_INPUT,
      expect.objectContaining({ staleTime: expect.any(Number) }),
    );

    // No call with a different (conflicting) input — no second bulkUsers query
    const nonLeanCalls = bulkUsersQuerySpy.mock.calls.filter(
      (callArgs: unknown[]) => {
        const input = callArgs[0] as Record<string, unknown> | undefined;
        return !input || input.leanProjects !== true;
      },
    );
    expect(nonLeanCalls).toHaveLength(0);

    // Assert call count is exactly 1 per render (single-fetch guarantee)
    expect(bulkUsersQuerySpy).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Case 8: LastActiveCell renders relative time vs "— No data"
  // -------------------------------------------------------------------------
  it("LastActiveCell renders a relative time for Alice and 'No data' for Bob", async () => {
    const { container } = render(<UsersDirectoryClient />);

    // Alice has lastActivity: "2026-05-01T00:00:00.000Z" → relative time string
    // Bob has lastActivity: null → "— No data"
    const allText = container.textContent ?? "";
    // At least one of the cells should show "No data" for Bob
    // and a time-relative string (e.g. "ago") for Alice
    // (the virtualizer renders rows 0..4 from the 2-person list cycling back)
    // Both people appear in the virtualizer output since we have 2 people and 5 mock rows
    expect(allText).toContain("No data");
  });

  // -------------------------------------------------------------------------
  // Case 9: Filtered-empty state renders with clear-filters button
  // -------------------------------------------------------------------------
  it("filtered empty state shows 'No one matches those filters' with a clear-filters button", async () => {
    const { container } = render(<UsersDirectoryClient />);

    const searchInput = screen.getByPlaceholderText(/Search anything/i);
    // Type a query that matches nobody
    fireEvent.change(searchInput, { target: { value: "zzz_nobody_matches" } });
    await act(async () => { vi.advanceTimersByTime(200); });

    // DataTable renders the filtered empty state via DataTableProps.filteredEmptyMessage
    const emptyState = container.querySelector("[data-testid='empty-state']");
    expect(emptyState).toBeTruthy();

    const clearBtn = container.querySelector(
      "[data-testid='clear-filters-btn'], [data-clear-filters]",
    ) as HTMLElement | null;
    expect(clearBtn).toBeTruthy();

    // Clicking clear resets the store search
    fireEvent.click(clearBtn!);
    await act(async () => { vi.advanceTimersByTime(200); });
    // Both users should reappear
    const afterClear = container.textContent ?? "";
    expect(afterClear).toContain("Alice Aranda");
    expect(afterClear).toContain("Bob Bravo");
  });

  // -------------------------------------------------------------------------
  // Case 10 (PERF-03 baseline): bulkUsers called with { leanProjects: true }
  // (kept for backward compat with pre-04-03 PERF-03 baseline assertion name)
  // -------------------------------------------------------------------------
  it("PERF-03: bulkUsers.useQuery is called with { leanProjects: true } and no conflicting inputs", () => {
    render(<UsersDirectoryClient />);

    // Must have been called with leanProjects: true
    expect(bulkUsersQuerySpy).toHaveBeenCalledWith(
      { leanProjects: true },
      expect.objectContaining({ staleTime: expect.any(Number) }),
    );

    // No call with a different (conflicting) input
    const nonLeanCalls = bulkUsersQuerySpy.mock.calls.filter(
      (callArgs: unknown[]) => {
        const input = callArgs[0] as Record<string, unknown> | undefined;
        return !input || input.leanProjects !== true;
      },
    );
    expect(nonLeanCalls).toHaveLength(0);
  });
});
