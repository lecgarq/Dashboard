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

import { DormantSignInChart } from "../components/DormantSignInChart";
import type { SignInRecencyRow } from "@/lib/server/signInRecencyView";

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW - n * DAY_MS).toISOString();

const rows: SignInRecencyRow[] = [
  { projectId: "p1", name: "Ana", company: "PICSA", lastSignIn: daysAgo(5) },
  { projectId: "p1", name: "Bo", company: "Estructure", lastSignIn: daysAgo(400) },
  { projectId: "p1", name: "Cy", company: "PICSA", lastSignIn: null },
  { projectId: "p1", name: "Dee", company: "PICSA", lastSignIn: null },
];

describe("DormantSignInChart", () => {
  it("shows an empty state when there are no rows", () => {
    const { queryByTestId, getByText } = render(<DormantSignInChart rows={[]} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no sign-in data/i)).toBeTruthy();
  });

  it("renders all 5 bands", () => {
    const { getByTestId } = render(<DormantSignInChart rows={rows} />);
    const names = getByTestId("echart").getAttribute("data-names");
    expect(names).toBe("<30d|30–90d|90–365d|>365d|Never signed in");
    expect(getByTestId("echart").getAttribute("data-bars")).toBe("5");
  });

  it("clicking a band drills to its users, showing Never for null lastSignIn", () => {
    const { getByTestId } = render(<DormantSignInChart rows={rows} />);
    fireEvent.click(within(getByTestId("echart")).getByRole("button", { name: "Never signed in" }));
    const drill = getByTestId("dormant-drilldown");
    expect(drill.textContent).toContain("Cy");
    expect(drill.textContent).toContain("Dee");
    expect(drill.textContent).toContain("Never");
  });

  it("toggles the drill closed when the same band is clicked again", () => {
    const { getByTestId, queryByTestId } = render(<DormantSignInChart rows={rows} />);
    const bandButton = () => within(getByTestId("echart")).getByRole("button", { name: "Never signed in" });
    fireEvent.click(bandButton());
    expect(getByTestId("dormant-drilldown")).toBeTruthy();
    fireEvent.click(bandButton());
    expect(queryByTestId("dormant-drilldown")).toBeNull();
  });

  it("renders the DC-coverage caption using the injected live numbers", () => {
    const { getByTestId } = render(<DormantSignInChart rows={rows} dcCoverage={{ covered: 550, total: 1153 }} />);
    const caption = getByTestId("dormant-scope-caption");
    expect(caption.textContent).toContain("550");
    expect(caption.textContent).toContain("1153");
    expect(caption.textContent).toContain("Data Connector");
  });

  it("omits the coverage caption when dcCoverage is absent", () => {
    const { queryByTestId } = render(<DormantSignInChart rows={rows} />);
    expect(queryByTestId("dormant-scope-caption")).toBeNull();
  });
});
