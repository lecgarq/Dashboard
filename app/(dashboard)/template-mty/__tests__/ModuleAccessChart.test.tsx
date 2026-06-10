// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModuleAccessChart } from "../components/ModuleAccessChart";

describe("ModuleAccessChart", () => {
  it("shows the add-data empty state when there is no module data", () => {
    render(<ModuleAccessChart summary={{ slices: [], total: 0, memberCount: 19, hasData: false }} />);
    expect(screen.getByText(/no module access captured yet/i)).toBeTruthy();
  });
});
