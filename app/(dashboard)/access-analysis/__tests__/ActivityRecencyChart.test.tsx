// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any; onEvents?: Record<string, (p: any) => void> }) => {
    const data = props.option.series?.[0]?.data ?? [];
    return (
      <div data-testid="echart" data-bars={data.length} data-names={data.map((d: any) => d.name).join("|")}>
        {data.map((d: any) => (
          <button key={d.name} onClick={() => props.onEvents?.click?.({ name: d.name })}>
            {d.name}
          </button>
        ))}
      </div>
    );
  },
}));

import { ActivityRecencyChart } from "../components/ActivityRecencyChart";
import type { ActivityRecencyRow } from "@/lib/server/activityRecencyView";

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW - n * DAY_MS).toISOString();

const rows: ActivityRecencyRow[] = [
  { projectId: "p1", email: "ana@hermosillo.com", name: "Ana", company: "PICSA", roles: ["BIM Manager"], lastActivityAt: daysAgo(5) },
  { projectId: "p1", email: "bo@hermosillo.com", name: "Bo", company: "Estructure", roles: ["Project Admin"], lastActivityAt: daysAgo(400) },
  { projectId: "p1", email: "cy@hermosillo.com", name: "Cy", company: "PICSA", roles: [], lastActivityAt: null },
  { projectId: "p1", email: "dee@hermosillo.com", name: "Dee", company: "PICSA", roles: [], lastActivityAt: null },
];

describe("ActivityRecencyChart", () => {
  it("shows an empty state when there are no rows", () => {
    const { queryByTestId, getByText } = render(<ActivityRecencyChart rows={[]} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no memberships in this view/i)).toBeTruthy();
  });

  it("renders all 5 band labels", () => {
    const { getByTestId } = render(<ActivityRecencyChart rows={rows} />);
    const names = getByTestId("echart").getAttribute("data-names");
    expect(names).toBe("<30d|30–90d|90–365d|>365d|Never active");
    expect(getByTestId("echart").getAttribute("data-bars")).toBe("5");
  });

  it("Never active bucket has the correct count from fixture rows incl. null-lastActivityAt rows", () => {
    const { getByTestId } = render(<ActivityRecencyChart rows={rows} />);
    fireEvent.click(within(getByTestId("echart")).getByRole("button", { name: "Never active" }));
    const drill = getByTestId("activity-recency-drilldown");
    expect(drill.textContent).toContain("Cy");
    expect(drill.textContent).toContain("Dee");
    expect(drill.textContent).toContain("2 people");
  });

  it("stale-year callout counts distinct PEOPLE across >365d + Never active", () => {
    // Bo (400d), Cy (never), Dee (never) = 3 stale of 4 people; 2 never.
    const { getByTestId } = render(<ActivityRecencyChart rows={rows} />);
    const callout = getByTestId("activity-recency-stale-callout").textContent ?? "";
    expect(callout).toContain("3");
    expect(callout).toContain("of 4 people have no recorded activity in the last year");
    expect(callout).toContain("2 of them never recorded at all");
  });

  it("stale-year callout does NOT count a person who is recently active on another membership", () => {
    const mixed: ActivityRecencyRow[] = [
      ...rows,
      // Bo is stale on p1 (400d) but active on p2 — not stale as a PERSON.
      { projectId: "p2", email: "bo@hermosillo.com", name: "Bo", company: "Estructure", roles: ["Project Admin"], lastActivityAt: daysAgo(3) },
    ];
    const { getByTestId } = render(<ActivityRecencyChart rows={mixed} />);
    const callout = getByTestId("activity-recency-stale-callout").textContent ?? "";
    expect(callout).toContain("2");
    expect(callout).toContain("of 4 people");
  });

  it("clicking a band drills to its users with role and date", () => {
    const { getByTestId } = render(<ActivityRecencyChart rows={rows} />);
    fireEvent.click(within(getByTestId("echart")).getByRole("button", { name: "<30d" }));
    const drill = getByTestId("activity-recency-drilldown");
    expect(drill.textContent).toContain("Ana");
    expect(drill.textContent).toContain("BIM Manager");
  });

  it("toggles the drill closed when the same band is clicked again", () => {
    const { getByTestId, queryByTestId } = render(<ActivityRecencyChart rows={rows} />);
    const bandButton = () => within(getByTestId("echart")).getByRole("button", { name: "Never active" });
    fireEvent.click(bandButton());
    expect(getByTestId("activity-recency-drilldown")).toBeTruthy();
    fireEvent.click(bandButton());
    expect(queryByTestId("activity-recency-drilldown")).toBeNull();
  });

  it("renders the coverage caption using the injected live numbers", () => {
    const { getByTestId } = render(<ActivityRecencyChart rows={rows} coverage={{ covered: 956, total: 1153 }} />);
    const caption = getByTestId("activity-recency-coverage-caption");
    expect(caption.textContent).toContain("956");
    expect(caption.textContent).toContain("1153");
  });

  it("omits the coverage caption when coverage is absent", () => {
    const { queryByTestId } = render(<ActivityRecencyChart rows={rows} />);
    expect(queryByTestId("activity-recency-coverage-caption")).toBeNull();
  });

  it("always renders the semantics caption, appending dataFloor when provided", () => {
    const { getByTestId, rerender } = render(<ActivityRecencyChart rows={rows} />);
    expect(getByTestId("activity-recency-semantics-caption").textContent).toContain("Never active");
    rerender(<ActivityRecencyChart rows={rows} dataFloor="2024-12-11" />);
    expect(getByTestId("activity-recency-semantics-caption").textContent).toContain("2024-12-11");
  });
});
