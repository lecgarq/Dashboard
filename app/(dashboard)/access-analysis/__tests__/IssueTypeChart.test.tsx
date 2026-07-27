// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any; onEvents?: Record<string, (params: unknown) => void> }) => {
    const series = props.option.series?.[0];
    const data: Array<{ value: number; id: string; itemStyle?: unknown }> = series?.data ?? [];
    const categories: string[] = (props.option.yAxis as any)?.data ?? [];
    return (
      <div data-testid="echart" data-bars={data.length}>
        {data.map((d, i) => (
          <button
            key={d.id}
            data-testid={`bar-${categories[i]}`}
            onClick={() => props.onEvents?.click?.({ data: d, name: categories[i] })}
          >
            {categories[i]}
          </button>
        ))}
      </div>
    );
  },
}));

import { IssueTypeChart } from "../components/IssueTypeChart";
import type { IssueFunnelTypeRow } from "@/lib/server/issueFunnelView";
import type { IssueCoverageProjectRow } from "@/lib/server/coordinationByProjectView";

const typeRow = (over: Partial<IssueFunnelTypeRow> = {}): IssueFunnelTypeRow => ({
  projectId: "p1",
  projectName: "Project One",
  issueTypeId: "type-a",
  typeName: "Quality",
  count: 5,
  ...over,
});

const coverageRow = (over: Partial<IssueCoverageProjectRow> = {}): IssueCoverageProjectRow => ({
  projectId: "p1",
  projectName: "Project One",
  status: "ok",
  issueCount: 5,
  ...over,
});

const manyTypeRows: IssueFunnelTypeRow[] = Array.from({ length: 12 }, (_, i) =>
  typeRow({ projectId: `p${i}`, issueTypeId: `type-${i}`, typeName: `Type ${i}`, count: 12 - i }),
);

describe("IssueTypeChart", () => {
  it("renders a bar per bucket including the folded 'Other' row", () => {
    const { getByTestId } = render(
      <IssueTypeChart rows={manyTypeRows} coverageProjects={[coverageRow()]} />,
    );
    // 10 named types + 1 "Other (2 types)" bucket
    expect(getByTestId("echart").getAttribute("data-bars")).toBe("11");
  });

  it("clicking a named-type bar opens the project drill, and closes on a second click", () => {
    const rows: IssueFunnelTypeRow[] = [
      typeRow({ projectId: "p1", projectName: "Zeta", issueTypeId: "type-a", typeName: "Quality", count: 5 }),
      typeRow({ projectId: "p2", projectName: "Alpha", issueTypeId: "type-a", typeName: "Quality", count: 20 }),
    ];
    const { getByTestId, queryByTestId } = render(
      <IssueTypeChart rows={rows} coverageProjects={[coverageRow()]} />,
    );
    fireEvent.click(getByTestId("bar-Quality"));
    const drill = getByTestId("issue-type-drilldown");
    expect(drill.textContent).toContain("Alpha");
    expect(drill.textContent).toContain("Zeta");
    expect(drill.textContent).toContain("20 issues");

    fireEvent.click(getByTestId("bar-Quality"));
    expect(queryByTestId("issue-type-drilldown")).toBeNull();
  });

  it("clicking the 'Other' bar is a guaranteed no-op", () => {
    const { getByTestId, queryByTestId } = render(
      <IssueTypeChart rows={manyTypeRows} coverageProjects={[coverageRow()]} />,
    );
    fireEvent.click(getByTestId("bar-Other (2 types)"));
    expect(queryByTestId("issue-type-drilldown")).toBeNull();
  });

  it("expands 'Other' in place via the separate expand link, then collapses back", () => {
    const { getByTestId, getByText } = render(
      <IssueTypeChart rows={manyTypeRows} coverageProjects={[coverageRow()]} />,
    );
    fireEvent.click(getByText("Showing top 10 of 12 types — show all"));
    expect(getByTestId("echart").getAttribute("data-bars")).toBe("12"); // no folded "Other" left

    fireEvent.click(getByText("Showing all 12 types — collapse to top 10"));
    expect(getByTestId("echart").getAttribute("data-bars")).toBe("11");
  });

  it("renders 'Unknown type' and 'No type set' as their own distinct bars", () => {
    const rows: IssueFunnelTypeRow[] = [
      typeRow({ projectId: "p1", issueTypeId: "guid-unresolved", typeName: null, count: 4 }),
      typeRow({ projectId: "p2", issueTypeId: null, typeName: null, count: 6 }),
      typeRow({ projectId: "p3", issueTypeId: "type-a", typeName: "Quality", count: 2 }),
    ];
    const { getByTestId } = render(<IssueTypeChart rows={rows} coverageProjects={[coverageRow()]} />);
    expect(getByTestId("bar-Unknown type")).toBeTruthy();
    expect(getByTestId("bar-No type set")).toBeTruthy();
  });

  it("shows the never-backfilled notice instead of bars when every GUID is unresolved", () => {
    const rows: IssueFunnelTypeRow[] = [
      typeRow({ projectId: "p1", issueTypeId: "type-a", typeName: null, count: 5 }),
      typeRow({ projectId: "p2", issueTypeId: "type-b", typeName: null, count: 3 }),
    ];
    const { getByTestId, queryByTestId } = render(
      <IssueTypeChart rows={rows} coverageProjects={[coverageRow()]} />,
    );
    expect(getByTestId("issue-type-not-backfilled")).toBeTruthy();
    expect(queryByTestId("echart")).toBeNull();
  });

  it("renders the coverage-aware empty state when there are no rows", () => {
    const { getByTestId, queryByTestId } = render(
      <IssueTypeChart rows={[]} coverageProjects={[coverageRow()]} />,
    );
    expect(getByTestId("issue-type-empty")).toBeTruthy();
    expect(queryByTestId("echart")).toBeNull();
  });

  it("live-computes the 'N of M type GUIDs resolved to names' caption plus the coverage line", () => {
    const rows: IssueFunnelTypeRow[] = [
      typeRow({ projectId: "p1", issueTypeId: "type-a", typeName: "Quality", count: 3 }),
      typeRow({ projectId: "p2", issueTypeId: "type-b", typeName: null, count: 2 }),
    ];
    const { getByTestId } = render(
      <IssueTypeChart rows={rows} coverageProjects={[coverageRow(), coverageRow({ projectId: "p2", status: "forbidden" })]} />,
    );
    const caption = getByTestId("issue-type-coverage-caption");
    expect(caption.textContent).toContain("1 of 2 type GUIDs resolved to names");
    expect(caption.textContent).toContain("Issue data covers 1 of 2 fetched projects");
  });

  it("does not reference the cross-filter bus -- local drill only", () => {
    const source = readFileSync(join(__dirname, "../components/IssueTypeChart.tsx"), "utf-8");
    // Build the token strings by concatenation so this test file itself never
    // contains the literal tokens (matches the ProvisionedModulesChart.test.tsx
    // / ProjectActivityDonut.test.tsx convention).
    const onSliceClick = "on" + "SliceClick";
    const activeSlice = "active" + "Slice";
    const sliceFilters = "slice" + "Filters";
    expect(source).not.toContain(onSliceClick);
    expect(source).not.toContain(activeSlice);
    expect(source).not.toContain(sliceFilters);
  });
});
