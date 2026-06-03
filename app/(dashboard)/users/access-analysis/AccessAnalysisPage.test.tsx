// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AccessAnalysisPage } from "./AccessAnalysisPage";

vi.mock("next/dynamic", () => ({
  default: () => function DeferredAnalyticsMock() {
    return <div data-testid="analytics-surface">Analytics surface</div>;
  },
}));

vi.mock("./AccessAnalysisContext", () => ({
  AccessAnalysisProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="access-analysis-provider">{children}</div>
  ),
}));

vi.mock("../UsersDirectoryClient", () => ({
  UsersDirectoryClient: () => <div data-testid="users-directory">Directory</div>,
}));

describe("AccessAnalysisPage", () => {
  it("renders analytics without embedding the full users directory", () => {
    render(<AccessAnalysisPage />);

    expect(screen.getByRole("heading", { name: "Access Analysis" })).toBeTruthy();
    expect(screen.getByTestId("analytics-surface")).toBeTruthy();
    expect(screen.queryByTestId("users-directory")).toBeNull();
  });
});
