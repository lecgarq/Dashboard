// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BulkAccUser } from "@/lib/acc/acc-types";

// getAccProfile must NOT be fetched on open. Spy on the utils fetch.
const fetchSpy = vi.fn(async () => ({ found: false, syncedAt: "" }));
vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    useUtils: () => ({ users: { getAccProfile: { fetch: fetchSpy } } }),
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

describe("UserProfilePanel", () => {
  afterEach(() => fetchSpy.mockClear());

  it("shows a not-synced state for a found:false user and fires no live fetch", () => {
    render(
      <UserProfilePanel user={stub} email={stub.email} variant="rail" onClose={() => {}} />,
    );
    expect(screen.getByTestId("user-detail-panel")).toBeTruthy();
    expect(screen.getByText(/not.*synced/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a not-synced state when user is null", () => {
    render(<UserProfilePanel user={null} email="missing@example.com" variant="rail" />);
    expect(screen.getByText(/not.*synced/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
