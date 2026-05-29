// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DisabledRow } from "./CatalogTreeSection";

describe("DisabledRow", () => {
  it("shows the label and a 'no data' badge", () => {
    render(<DisabledRow label="Folder Size" />);
    expect(screen.queryByText("Folder Size")).toBeTruthy();
    expect(screen.queryByText("no data")).toBeTruthy();
  });
  it("exposes the reason as a tooltip title when provided", () => {
    render(<DisabledRow label="Folder Size" reason="Not collected yet" />);
    expect(screen.getByTestId("disabled-dim-row").getAttribute("title")).toBe("Not collected yet");
  });
});
