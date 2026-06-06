// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toolbar } from "./Toolbar";
import { FilterProvider } from "./FilterContext";

function renderToolbar(props: Partial<React.ComponentProps<typeof Toolbar>> = {}) {
  const onModeChange = vi.fn();
  const onColorReset = vi.fn();
  render(
    <FilterProvider>
      <Toolbar
        features={[]}
        mode="2d"
        onModeChange={onModeChange}
        lassoActive={false}
        onLassoToggle={() => {}}
        colorMode="role"
        onColorModeChange={vi.fn()}
        groupedByLabel="Role"
        colorIsAuto
        onColorReset={onColorReset}
        {...props}
      />
    </FilterProvider>,
  );
  return { onModeChange, onColorReset };
}

describe("Toolbar 2D-map controls", () => {
  it("shows the grouped-by indicator", () => {
    renderToolbar();
    expect(screen.getByTestId("toolbar-grouped-by").textContent).toContain("Role");
  });
  it("fires onModeChange('3d') when the 3D toggle is clicked", () => {
    const { onModeChange } = renderToolbar();
    fireEvent.click(screen.getByTestId("toolbar-mode-3d"));
    expect(onModeChange).toHaveBeenCalledWith("3d");
  });
  it("shows an 'auto' badge and no Reset when color is auto", () => {
    renderToolbar({ colorIsAuto: true });
    expect(screen.queryByTestId("toolbar-color-reset")).toBeNull();
  });
  it("shows Reset (and fires it) when color is overridden", () => {
    const { onColorReset } = renderToolbar({ colorIsAuto: false });
    const reset = screen.getByTestId("toolbar-color-reset");
    fireEvent.click(reset);
    expect(onColorReset).toHaveBeenCalled();
  });
});
