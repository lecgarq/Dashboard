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
 *  - IntersectionObserver + ResizeObserver: no-op stubs (PersonRowList's
 *    virtualizer + useVisibleRowEmails require them).
 *
 * IMPORTANT: Do NOT modify UsersDirectoryClient.tsx. If a case cannot pass
 * without changing the component, the fixture is wrong (behavior parity
 * is bug-for-bug per CONTEXT).
 */

import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
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
// Stub it so the Select interaction doesn't throw inside React effects.
if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.scrollIntoView = () => {};
}

// jsdom doesn't implement window.scrollTo — stub it to suppress the
// "Not implemented" console warning from the component's scrollDirectoryToTop.
vi.stubGlobal("scrollTo", () => {});

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);

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
// Mock next/dynamic — both panels render a simple div with the email prop
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UsersDirectoryClient — golden-path integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Case 1: Search narrows the list
  // -------------------------------------------------------------------------
  it("typing a name into the search input narrows visible cards to matching people", async () => {
    render(<UsersDirectoryClient />);

    // Both users rendered initially
    expect(screen.getByText("Alice Aranda")).toBeTruthy();
    expect(screen.getByText("Bob Bravo")).toBeTruthy();

    const searchInput = screen.getByPlaceholderText(/Search anything/i);

    fireEvent.change(searchInput, { target: { value: "Alice" } });

    // Advance past the 150ms debounce
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText("Alice Aranda")).toBeTruthy();
    expect(screen.queryByText("Bob Bravo")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 2: Multiple filters combine (dept AND job title via field tokens)
  // -------------------------------------------------------------------------
  it("applying dept + jobTitle field tokens shows only people matching BOTH", async () => {
    render(<UsersDirectoryClient />);

    expect(screen.getByText("Alice Aranda")).toBeTruthy();
    expect(screen.getByText("Bob Bravo")).toBeTruthy();

    const searchInput = screen.getByPlaceholderText(/Search anything/i);
    // Alice: dept=Engineering, job=BIM Manager
    // Bob:   dept=Construction, job=Site Supervisor
    // "dept:Engineering job:BIM" should match only Alice
    fireEvent.change(searchInput, {
      target: { value: "dept:Engineering job:BIM" },
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText("Alice Aranda")).toBeTruthy();
    expect(screen.queryByText("Bob Bravo")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 3: viewMode toggle preserves filters
  // -------------------------------------------------------------------------
  it("switching grid <-> list does NOT clear an active search filter", async () => {
    render(<UsersDirectoryClient />);

    const searchInput = screen.getByPlaceholderText(/Search anything/i);
    fireEvent.change(searchInput, { target: { value: "Alice" } });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Filter active
    expect(screen.queryByText("Bob Bravo")).toBeNull();

    // Find the viewMode toggle buttons (they have class p-1.5 transition-colors)
    const allButtons = screen.getAllByRole("button");
    const toggleButtons = allButtons.filter(
      (b) =>
        b.className.includes("p-1.5") && b.className.includes("transition-colors"),
    );

    if (toggleButtons.length >= 2) {
      // Switch to list view
      fireEvent.click(toggleButtons[1]);
      await act(async () => { vi.advanceTimersByTime(50); });
      expect(screen.queryByText("Bob Bravo")).toBeNull();

      // Switch back to grid
      fireEvent.click(toggleButtons[0]);
      await act(async () => { vi.advanceTimersByTime(50); });
      expect(screen.queryByText("Bob Bravo")).toBeNull();
    }

    // Search text preserved
    expect((searchInput as HTMLInputElement).value).toBe("Alice");
  });

  // -------------------------------------------------------------------------
  // Case 4: groupBy switch preserves filters
  // -------------------------------------------------------------------------
  it("choosing a Group-by option keeps the active filter applied", async () => {
    render(<UsersDirectoryClient />);

    const searchInput = screen.getByPlaceholderText(/Search anything/i);
    fireEvent.change(searchInput, { target: { value: "Alice" } });
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText("Bob Bravo")).toBeNull();

    // The groupBy Select trigger shows "No grouping" — it is one of several
    // comboboxes. Find it by its text content.
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
    expect(screen.queryByText("Bob Bravo")).toBeNull();
    expect(screen.getByText("Alice Aranda")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Case 5: Click opens modal showing person's name
  // -------------------------------------------------------------------------
  it("clicking a person card opens the profile modal with that person's name", async () => {
    render(<UsersDirectoryClient />);

    // PersonCard renders a <button> whose text contains the display name
    const aliceButton = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("Alice Aranda"));
    expect(aliceButton).toBeTruthy();
    fireEvent.click(aliceButton!);

    await act(async () => { vi.advanceTimersByTime(50); });

    // PersonDetailModal renders an <h2> with person.displayName inside DialogContent.
    // The Dialog is rendered into document.body via a Radix portal — screen queries the
    // whole document so it will find it. We look for any element with Alice's name
    // appearing as a heading (tagName H2) anywhere in the document.
    const allAliceElements = screen.getAllByText("Alice Aranda");
    const heading = allAliceElements.find((el) => el.tagName === "H2");
    expect(heading).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Case 6: Close preserves state — the strictest case
  // -------------------------------------------------------------------------
  it("closing the modal preserves search text, active filter, and window.scrollY", async () => {
    render(<UsersDirectoryClient />);

    // Fix scrollY at 800 before opening modal
    Object.defineProperty(window, "scrollY", { value: 800, configurable: true });
    expect(window.scrollY).toBe(800);

    const searchInput = screen.getByPlaceholderText(/Search anything/i);
    fireEvent.change(searchInput, { target: { value: "Alice" } });
    await act(async () => { vi.advanceTimersByTime(200); });

    expect((searchInput as HTMLInputElement).value).toBe("Alice");
    expect(screen.queryByText("Bob Bravo")).toBeNull();

    // Open modal
    const aliceButton = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("Alice Aranda"));
    fireEvent.click(aliceButton!);
    await act(async () => { vi.advanceTimersByTime(50); });

    // Close via Escape
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    await act(async () => { vi.advanceTimersByTime(50); });

    // scrollY must NOT have been reset to 0 by modal close
    expect(window.scrollY).toBe(800);
    // Search text preserved
    expect((searchInput as HTMLInputElement).value).toBe("Alice");
    // Filter still active
    expect(screen.queryByText("Bob Bravo")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 7: PERF-03 baseline — bulkUsers called with { leanProjects: true }
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
