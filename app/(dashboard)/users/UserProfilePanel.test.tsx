// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
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
});
