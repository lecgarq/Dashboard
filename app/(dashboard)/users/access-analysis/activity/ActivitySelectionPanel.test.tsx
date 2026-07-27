// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivitySelectionPanel } from "./ActivitySelectionPanel";

afterEach(cleanup);

describe("ActivitySelectionPanel", () => {
  it("collapses truncated dimensions and adds avatars to author rows", () => {
    const { container } = render(
      <ActivitySelectionPanel
        selectedCount={900}
        renderedCount={900}
        onClear={vi.fn()}
        authorPhotoByEmail={new Map()}
        breakdown={[
          {
            id: "verb",
            label: "Verb",
            distinct: 2,
            covered: 900,
            total: 900,
            top: [
              { label: "view-entity", count: 600 },
              { label: "upload-entity", count: 300 },
            ],
          },
          {
            id: "author",
            label: "Author",
            distinct: 73,
            covered: 900,
            total: 900,
            top: [{ label: "elizabeth.soto@hermosillo.com", count: 145 }],
          },
        ]}
      />,
    );

    const verb = screen.getByTestId("activity-selection-dim-verb") as HTMLDetailsElement;
    const author = screen.getByTestId("activity-selection-dim-author") as HTMLDetailsElement;
    expect(verb.open).toBe(true);
    expect(author.open).toBe(false);

    fireEvent.click(author.querySelector("summary")!);
    expect(author.open).toBe(true);
    expect(author.querySelector("ul")?.className).toContain("overflow-y-auto");
    expect(author.querySelector("li")?.className).toContain("shrink-0");
    expect(container.querySelector('[data-slot="avatar"]')).toBeTruthy();
    expect(screen.getByText("ES")).toBeTruthy();
  });
});
