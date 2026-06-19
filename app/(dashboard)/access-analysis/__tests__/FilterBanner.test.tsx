// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBanner } from "../components/FilterBanner";

describe("FilterBanner", () => {
  it("renders nothing when no filters are active", () => {
    const { container } = render(
      <FilterBanner filters={{}} shown={1152} total={1152} onRemove={() => {}} onClear={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the N-of-M project scope", () => {
    render(
      <FilterBanner
        filters={{ role: "Architect" }}
        shown={340}
        total={1152}
        onRemove={() => {}}
        onClear={() => {}}
        labels={{ role: "Role" }}
      />,
    );
    expect(screen.getByTestId("filter-scope").textContent).toBe("Showing 340 of 1,152 projects");
  });

  it("renders one chip per dimension and removes via ×", () => {
    const onRemove = vi.fn();
    render(
      <FilterBanner
        filters={{ role: "Architect", company: "Acme" }}
        shown={120}
        total={1152}
        onRemove={onRemove}
        onClear={() => {}}
        labels={{ role: "Role", company: "Company" }}
      />,
    );
    expect(screen.getAllByRole("button", { name: /Remove .* filter/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove Role filter" }));
    expect(onRemove).toHaveBeenCalledWith("role");
  });

  it("clears all filters via Clear filters", () => {
    const onClear = vi.fn();
    render(
      <FilterBanner
        filters={{ role: "Architect" }}
        shown={340}
        total={1152}
        onRemove={() => {}}
        onClear={onClear}
        labels={{ role: "Role" }}
      />,
    );
    fireEvent.click(screen.getByTestId("filter-clear"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
