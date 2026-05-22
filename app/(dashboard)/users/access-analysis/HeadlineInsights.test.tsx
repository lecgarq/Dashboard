// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeadlineInsights, type HeadlineInsightItem } from "./HeadlineInsights";

const items: HeadlineInsightItem[] = [
  { id: "stale", label: "Stale members", text: "12 members are stale.", severity: "risk" },
  { id: "active", label: "Active", text: "40 members signed in within 30 days.", severity: "good" },
];

describe("HeadlineInsights", () => {
  it("renders each insight's text", () => {
    render(<HeadlineInsights items={items} />);
    expect(screen.getByText("12 members are stale.")).toBeTruthy();
    expect(screen.getByText("40 members signed in within 30 days.")).toBeTruthy();
  });

  it("invokes onSelect with the item id when clicked", () => {
    const onSelect = vi.fn();
    render(<HeadlineInsights items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("12 members are stale."));
    expect(onSelect).toHaveBeenCalledWith("stale");
  });

  it("renders nothing when there are no items", () => {
    const { container } = render(<HeadlineInsights items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
