// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UsersDirectoryPage from "./page";

vi.mock("./UsersDirectoryClient", () => ({
  UsersDirectoryClient: () => <div data-testid="users-directory">Directory</div>,
}));

vi.mock("@/lib/server/acc-route-hydration", () => ({
  createAccRouteHelpers: vi.fn(async () => ({ dehydrate: () => ({}) })),
  prefetchUsersRouteAccData: vi.fn(async () => undefined),
}));

vi.mock("@tanstack/react-query", () => ({
  HydrationBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./access-analysis/AccessAnalysisPage", () => ({
  AccessAnalysisPage: () => <div data-testid="access-analysis">Analysis</div>,
}));

describe("/users route", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_NEW_ACCESS_ANALYSIS;
  });

  it("always renders the users directory, even when the new analysis flag is enabled", async () => {
    process.env.NEXT_PUBLIC_NEW_ACCESS_ANALYSIS = "1";

    render(await UsersDirectoryPage());

    expect(screen.getByTestId("users-directory")).toBeTruthy();
    expect(screen.queryByTestId("access-analysis")).toBeNull();
  });
});
