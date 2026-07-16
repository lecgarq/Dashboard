// @vitest-environment jsdom

import { render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { OrgPerson } from "./directoryUtils";

// vi.hoisted ensures these spies are available inside the hoisted vi.mock factory.
const { fetchSpy, bulkUserQuerySpy, profileQuerySpy } = vi.hoisted(() => ({
  fetchSpy: vi.fn(async () => ({ found: false, syncedAt: "" })),
  /**
   * Simulates users.getAccProfile.useQuery (the self-healing member-cache
   * profile source). Default: no data — tests that exercise the freshness
   * preference override with mockReturnValueOnce.
   */
  profileQuerySpy: vi.fn((): { data: unknown; isLoading: boolean } => ({ data: undefined, isLoading: false })),
  /**
   * Simulates accDcGraph.bulkUser.useQuery.
   *
   * Respects the `enabled` option (second argument) — returns `{ data: undefined,
   * isLoading: false }` when enabled is false (matches real tRPC behavior).
   * When enabled, returns full data only for ada@hermosillo.com; null otherwise.
   * Tests that need a custom return value can use bulkUserQuerySpy.mockReturnValueOnce.
   */
  bulkUserQuerySpy: vi.fn(
    (input: { email: string }, options?: { enabled?: boolean }) => {
      if (options?.enabled === false) {
        return { data: undefined, isLoading: false };
      }
      if (input?.email?.toLowerCase() === "ada@hermosillo.com") {
        return {
          data: {
            email: "ada@hermosillo.com",
            name: "Ada Lovelace",
            found: true,
            syncedAt: "2026-06-16T00:00:00.000Z",
            photoUrl: null,
            costCenter: "ENG-100",
            projectCount: 1,
            activeCount: 1,
            adminCount: 1,
            hasNoProjects: false,
            isAccountAdmin: false,
            addedOn: null,
            projects: [
              {
                id: "p1",
                name: "Tower A",
                status: "active",
                isAdmin: true,
                roles: ["Project Admin"],
                modules: ["build"],
              },
            ],
            allRoles: ["Project Admin"],
            allModules: ["build"],
          },
          isLoading: false,
        };
      }
      return { data: null, isLoading: false };
    },
  ),
}));

const activityData = { totalCount: 5, last30dCount: 0, topActions: [], recentEvents: [] };

vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    useUtils: () => ({ users: { getAccProfile: { fetch: fetchSpy } } }),
    users: {
      getAccUserActivity: { useQuery: () => ({ data: activityData, isLoading: false }) },
      getAccUserFolderAccess: { useQuery: () => ({ data: undefined, isLoading: false }) },
      getAccProfile: { useQuery: profileQuerySpy },
    },
    accDcGraph: {
      bulkUser: { useQuery: bulkUserQuerySpy },
    },
  },
}));

import { UserProfilePanel } from "./UserProfilePanel";

const stub: BulkAccUser = {
  email: "ghost@example.com",
  name: "Ghost",
  found: false,
  projectCount: 0,
  activeCount: 0,
  adminCount: 0,
  hasNoProjects: true,
  syncedAt: "",
  allRoles: [],
  allModules: [],
  projects: [],
  isAccountAdmin: false,
  addedOn: null,
};

const found: BulkAccUser = {
  ...stub,
  email: "ada@hermosillo.com",
  name: "Ada Lovelace",
  found: true,
  syncedAt: "2026-06-16T00:00:00.000Z",
  photoUrl: null,
  costCenter: "ENG-100",
  projectCount: 1,
  activeCount: 1,
  adminCount: 1,
  hasNoProjects: false,
  projects: [
    { id: "p1", name: "Tower A", status: "active", isAdmin: true, roles: ["Project Admin"], modules: ["build"] },
  ] as BulkAccUser["projects"],
};

const orgPerson: OrgPerson = {
  resourceName: "people/ada.lovelace",
  displayName: "Ada Lovelace",
  email: "ada@hermosillo.com",
  photoUrl: null,
  department: "Engineering",
  jobTitle: "Lead Engineer",
  phoneNumber: "+52-664-000-0000",
  costCenter: "ENG-100",
};

describe("UserProfilePanel", () => {
  afterEach(() => fetchSpy.mockClear());

  it("shows a not-synced state for a found:false user and fires no live fetch", () => {
    render(<UserProfilePanel user={stub} email={stub.email} variant="rail" onClose={() => {}} />);
    expect(screen.getByTestId("user-detail-panel")).toBeTruthy();
    expect(screen.getByText(/not.*synced/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a not-synced state when user is null", () => {
    render(<UserProfilePanel user={null} email="missing@example.com" variant="rail" />);
    expect(screen.getByText(/not.*synced/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders an avatar (initials fallback) in the rail header", () => {
    render(<UserProfilePanel user={stub} email={stub.email} variant="rail" />);
    expect(screen.getByText("GH")).toBeTruthy(); // Ghost -> GH
  });

  it("renders one rail header, then the supplied matches prelude before the ACC body", () => {
    render(
      <UserProfilePanel
        user={stub}
        email={stub.email}
        variant="rail"
        onClose={() => {}}
        railPrelude={<section data-testid="matches-prelude">Closest matches</section>}
      />,
    );
    expect(screen.getAllByTestId("user-detail-header")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
    expect(screen.queryByText("Open profile")).toBeNull();
    const prelude = screen.getByTestId("matches-prelude");
    const profile = screen.getByTestId("acc-profile-body");
    expect(prelude.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the cost center for a synced directory member", () => {
    render(<UserProfilePanel user={found} email={found.email} variant="rail" />);
    expect(screen.getByText(/cost center/i)).toBeTruthy();
    expect(screen.getByText("ENG-100")).toBeTruthy();
  });

  it("labels the activity summary as all-time, not last-30-days", () => {
    render(<UserProfilePanel user={found} email={found.email} variant="rail" />);
    expect(screen.getByText(/5 events all-time/i)).toBeTruthy();
    expect(screen.queryByText(/last 30 days/i)).toBeNull();
  });

  it("opens the Admin detail on click and toggles closed", () => {
    render(<UserProfilePanel user={found} email={found.email} variant="rail" />);
    expect(screen.queryByTestId("stat-detail-admin")).toBeNull();
    fireEvent.click(screen.getByTestId("statcard-admin"));
    expect(screen.getByTestId("stat-detail-admin")).toBeTruthy();
    // Scope to the detail: with push-down, "Tower A" also appears in the projects list below.
    expect(within(screen.getByTestId("stat-detail-admin")).getByText("Tower A")).toBeTruthy();
    fireEvent.click(screen.getByTestId("statcard-admin"));
    expect(screen.queryByTestId("stat-detail-admin")).toBeNull();
  });

  it("disables a zero-count stat card", () => {
    const noRoles = {
      ...found,
      projects: [
        { id: "p1", name: "Tower A", status: "active", isAdmin: true, roles: [], modules: ["build"] },
      ] as BulkAccUser["projects"],
    };
    render(<UserProfilePanel user={noRoles} email={noRoles.email} variant="rail" />);
    expect(screen.getByTestId("statcard-roles").hasAttribute("disabled")).toBe(true);
  });

  it("renders person chrome (name, job title, email) in dialog variant when person is supplied", () => {
    render(
      <UserProfilePanel
        user={found}
        email={found.email}
        variant="dialog"
        person={orgPerson}
      />
    );
    // Person header chrome should appear
    expect(screen.getByTestId("person-chrome-header")).toBeTruthy();
    expect(screen.getAllByText("Ada Lovelace").length).toBeGreaterThan(0);
    // jobTitle appears in the subtitle + info row
    expect(screen.getAllByText("Lead Engineer").length).toBeGreaterThan(0);
    // Email contact row
    expect(screen.getAllByText("ada@hermosillo.com").length).toBeGreaterThan(0);
  });

  it("does NOT render person chrome when person is omitted (dialog variant)", () => {
    render(
      <UserProfilePanel
        user={found}
        email={found.email}
        variant="dialog"
      />
    );
    expect(screen.queryByTestId("person-chrome-header")).toBeNull();
    // "Ada Lovelace" as a display-name heading should not appear (it's still in the ACC body title potentially, but no chrome heading)
    expect(screen.queryByTestId("person-chrome-header")).toBeNull();
  });

  it("does NOT render person chrome in rail variant even when person is supplied", () => {
    render(
      <UserProfilePanel
        user={found}
        email={found.email}
        variant="rail"
        person={orgPerson}
      />
    );
    // Rail has its own header from ProfileAvatar/name — person chrome block must not appear
    expect(screen.queryByTestId("person-chrome-header")).toBeNull();
  });

  it("[G4] shows per-project roles and modules in dialog variant WITHOUT clicking Refresh (sourced from bulkUser proc)", () => {
    // The lean in-memory `found` has roles: ["Project Admin"] and modules: ["build"] already
    // (the test fixture happens to have them), BUT the bulkUserQuerySpy returns fullBulkUser
    // which is the enriched source. The key assertion is that roles + modules render AND the
    // Autodesk live-fetch spy (getAccProfile.fetch) is NOT called automatically.
    render(
      <UserProfilePanel
        user={found}
        email={found.email}
        variant="dialog"
      />
    );
    // accDcGraph.bulkUser must have been queried on mount
    expect(bulkUserQuerySpy).toHaveBeenCalled();
    // Live Autodesk fetch must NOT fire automatically
    expect(fetchSpy).not.toHaveBeenCalled();
    // Per-project role "Project Admin" must be visible
    expect(screen.getAllByText("Project Admin").length).toBeGreaterThan(0);
    // The Roles stat card value must be > 0
    expect(screen.getByTestId("statcard-roles")).toBeTruthy();
    expect(screen.getByTestId("statcard-roles").hasAttribute("disabled")).toBe(false);
  });

  it("[G4] shows a loading indicator on the ACC detail section while bulkUser is in-flight", () => {
    // Override spy to simulate in-flight state
    bulkUserQuerySpy.mockReturnValueOnce({ data: undefined, isLoading: true });
    render(
      <UserProfilePanel
        user={found}
        email={found.email}
        variant="dialog"
      />
    );
    expect(screen.getByTestId("acc-detail-loading")).toBeTruthy();
  });

  it("[freshness] prefers a NEWER member-cache profile over the stale DC snapshot without Refresh", () => {
    // DC snapshot (bulkUserQuerySpy) is synced 2026-06-16 with role "Project Admin".
    // The member-cache profile is 3 weeks newer with a different role — it must win.
    profileQuerySpy.mockReturnValueOnce({
      data: {
        found: true,
        status: "active",
        name: "Ada Lovelace",
        syncedAt: "2026-07-07T00:00:00.000Z",
        projects: [
          { id: "p1", name: "Tower A", status: "active", isAdmin: false, roles: ["BIM Manager"], modules: ["docs"] },
        ],
      },
      isLoading: false,
    });
    render(<UserProfilePanel user={found} email={found.email} variant="dialog" />);
    expect(profileQuerySpy).toHaveBeenCalled();
    expect(screen.getAllByText("BIM Manager").length).toBeGreaterThan(0);
    expect(screen.queryByText("Project Admin")).toBeNull();
    // Still no automatic FORCE-live fetch — the imperative path stays Refresh-only.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("[freshness] keeps the DC snapshot when the member-cache profile is OLDER", () => {
    profileQuerySpy.mockReturnValueOnce({
      data: {
        found: true,
        status: "active",
        name: "Ada Lovelace",
        syncedAt: "2026-01-01T00:00:00.000Z",
        projects: [
          { id: "p1", name: "Tower A", status: "active", isAdmin: false, roles: ["Old Role"], modules: ["docs"] },
        ],
      },
      isLoading: false,
    });
    render(<UserProfilePanel user={found} email={found.email} variant="dialog" />);
    // DC snapshot (2026-06-16) is newer than the 2026-01-01 profile — snapshot wins.
    expect(screen.getAllByText("Project Admin").length).toBeGreaterThan(0);
    expect(screen.queryByText("Old Role")).toBeNull();
  });
});
