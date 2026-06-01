// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MultiSelectCombobox } from "../components/MultiSelectCombobox";

describe("MultiSelectCombobox", () => {
  it("filters options by the search box and toggles selection", () => {
    const onToggle = vi.fn();
    const { getByPlaceholderText, getByText, queryByText } = render(
      <MultiSelectCombobox
        label="Project" placeholder="Search projects"
        options={[{ value: "p1", label: "Tower A" }, { value: "p2", label: "Bridge" }]}
        selected={[]} onToggle={onToggle}
      />,
    );
    fireEvent.click(getByText("Project")); // open
    fireEvent.change(getByPlaceholderText("Search projects"), { target: { value: "brid" } });
    expect(queryByText("Tower A")).toBeNull();
    fireEvent.click(getByText("Bridge"));
    expect(onToggle).toHaveBeenCalledWith("p2");
  });
});
