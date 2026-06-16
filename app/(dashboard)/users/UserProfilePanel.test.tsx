// @vitest-environment jsdom

import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BulkAccUser } from "@/lib/acc/acc-types";

const fetchSpy = vi.fn(async () => ({ found: false, syncedAt: "" }));
const activityData = { totalCount: 5, last30dCount: 0, topActions: [], recentEvents: [] };
vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    useUtils: () => ({ users: { getAccProfile: { fetch: fetchSpy } } }),
    users: {
      getAccUserActivity: { useQuery: () => ({ data: activityData, isLoading: false }) },
      getAccUserFolderAccess: { useQuery: () => ({ data: undefined, isLoading: false }) },
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
    expect(screen.getByText("Tower A")).toBeTruthy();
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
});
