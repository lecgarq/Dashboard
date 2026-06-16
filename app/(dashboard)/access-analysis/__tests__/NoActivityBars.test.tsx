// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { NoActivityBars } from "../components/NoActivityBars";

const entities = [
  { label: "PICSA", userCount: 3, people: [
    { email: "a@x.com", name: "Ana", count: 2 },
    { email: "b@x.com", name: "Bo", count: 1 },
  ] },
  { label: "Estructure", userCount: 1, people: [{ email: "c@x.com", name: "Cy", count: 1 }] },
];

describe("NoActivityBars", () => {
  it("renders nothing when there are no dormant entities", () => {
    const { container } = render(<NoActivityBars noun="companies" entities={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("lists the dormant entities with a header count", () => {
    const { getByTestId } = render(<NoActivityBars noun="companies" entities={entities} />);
    const box = getByTestId("no-activity-companies");
    expect(box.textContent).toContain("No activity");
    expect(box.textContent).toContain("2 companies");
    expect(box.textContent).toContain("PICSA");
    expect(box.textContent).toContain("Estructure");
  });

  it("drills into the people behind a dormant entity and fires onUserClick", () => {
    const onUserClick = vi.fn();
    const { getByTestId } = render(
      <NoActivityBars noun="companies" entities={entities} onUserClick={onUserClick} />,
    );
    fireEvent.click(within(getByTestId("no-activity-companies")).getByRole("button", { name: /PICSA/ }));
    const drill = getByTestId("no-activity-companies-drilldown");
    expect(drill.textContent).toContain("Ana");
    expect(drill.textContent).toContain("Bo");
    fireEvent.click(within(drill).getByRole("button", { name: /Ana/ }));
    expect(onUserClick).toHaveBeenCalledWith("a@x.com");
  });

  it("collapses past the top 8 behind a '+ N more' expander", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      label: `C${String(i).padStart(2, "0")}`,
      userCount: 11 - i,
      people: [{ email: `e${i}@x.com`, name: `N${i}`, count: 1 }],
    }));
    const { getByTestId, getByText } = render(<NoActivityBars noun="companies" entities={many} />);
    // Top 8 shown, 3 hidden.
    expect(getByTestId("no-activity-companies").textContent).not.toContain("C10");
    fireEvent.click(getByText(/\+ 3 more/));
    expect(getByTestId("no-activity-companies").textContent).toContain("C10");
  });

  it("uses singular noun for a single dormant entity", () => {
    const one = [{ label: "Solo", userCount: 1, people: [{ email: "s@x.com", name: "Sol", count: 1 }] }];
    const { getByTestId } = render(<NoActivityBars noun="roles" entities={one} />);
    expect(getByTestId("no-activity-roles").textContent).toContain("1 role");
  });
});
