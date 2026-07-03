// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within, waitFor } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const series = props.option.series?.[0]?.data ?? [];
    return (
      <div
        data-testid="echart"
        data-slices={series.length}
        data-names={(props.option.yAxis as any)?.data?.join("|")}
      />
    );
  },
}));

import { FolderActivityByCompanyChart } from "../components/FolderActivityByCompanyChart";
import { UNKNOWN_COMPANY } from "../companyCounts";
import type { FolderActivityActorRow, CompanyFolderSlice } from "@/lib/server/folderActivityByCompanyView";
import type { MembershipCompanyInput } from "../companyActivityCounts";

function row(over: Partial<FolderActivityActorRow>): FolderActivityActorRow {
  return { projectId: "p1", userEmail: "a@acme.com", userName: "Alice", count: 1, ...over };
}
function membership(over: Partial<MembershipCompanyInput>): MembershipCompanyInput {
  return { projectId: "p1", email: "a@acme.com", company: "Acme", ...over };
}

const rows: FolderActivityActorRow[] = [
  row({ userEmail: "a@acme.com", userName: "Alice", count: 40 }),
  row({ userEmail: "b@beta.com", userName: "Bob", count: 20 }),
  row({ userEmail: "c@ghost.com", userName: "Carol", count: 5 }), // no membership row -> Unknown company
];
const memberships: MembershipCompanyInput[] = [
  membership({ email: "a@acme.com", company: "Acme" }),
  membership({ email: "b@beta.com", company: "Beta" }),
];

describe("FolderActivityByCompanyChart", () => {
  it("renders an empty state when there are no rows", () => {
    const { queryByTestId, getByText } = render(
      <FolderActivityByCompanyChart rows={[]} memberships={[]} selectedProjectIds={[]} loadFolderBreakdown={vi.fn()} />,
    );
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no folder-scoped activity/i)).toBeTruthy();
  });

  it("renders top companies including an explicit Unknown company bucket", () => {
    const { getByTestId } = render(
      <FolderActivityByCompanyChart rows={rows} memberships={memberships} selectedProjectIds={["p1"]} loadFolderBreakdown={vi.fn()} />,
    );
    const legend = getByTestId("folder-activity-by-company-legend");
    expect(legend.textContent).toContain("Acme");
    expect(legend.textContent).toContain("Beta");
    expect(legend.textContent).toContain(UNKNOWN_COMPANY);
  });

  it("clicking a company calls loadFolderBreakdown exactly once with that company's member emails, then reuses the cache on re-open", async () => {
    const loadFolderBreakdown = vi.fn(async (_emails: string[], _projectIds: string[]): Promise<CompanyFolderSlice[]> => [
      { folderName: "Project Files", count: 30 },
      { folderName: "Shared", count: 10 },
    ]);
    const { getByTestId } = render(
      <FolderActivityByCompanyChart
        rows={rows}
        memberships={memberships}
        selectedProjectIds={["p1"]}
        loadFolderBreakdown={loadFolderBreakdown}
      />,
    );
    const legend = getByTestId("folder-activity-by-company-legend");
    const acmeButton = within(legend).getByRole("button", { name: /Acme/ });

    fireEvent.click(acmeButton);
    await waitFor(() => expect(loadFolderBreakdown).toHaveBeenCalledTimes(1));
    expect(loadFolderBreakdown).toHaveBeenCalledWith(["a@acme.com"], ["p1"]);
    await waitFor(() => expect(getByTestId("folder-activity-drill-folders").textContent).toContain("Project Files"));

    // Close the drill, then reopen it — cached result, no second network call.
    fireEvent.click(acmeButton);
    fireEvent.click(acmeButton);
    await waitFor(() => expect(getByTestId("folder-activity-drill-folders").textContent).toContain("Project Files"));
    expect(loadFolderBreakdown).toHaveBeenCalledTimes(1);
  });

  it("renders the returned folder breakdown in the drill list", async () => {
    const loadFolderBreakdown = vi.fn(async (): Promise<CompanyFolderSlice[]> => [{ folderName: "Project Files", count: 30 }]);
    const { getByTestId } = render(
      <FolderActivityByCompanyChart
        rows={rows}
        memberships={memberships}
        selectedProjectIds={["p1"]}
        loadFolderBreakdown={loadFolderBreakdown}
      />,
    );
    const legend = getByTestId("folder-activity-by-company-legend");
    fireEvent.click(within(legend).getByRole("button", { name: /Acme/ }));
    await waitFor(() => {
      const list = getByTestId("folder-activity-drill-folders");
      expect(list.textContent).toContain("Project Files");
      expect(list.textContent).toContain("30");
    });
  });

  it("collapses companies beyond top-10 into a non-clickable 'Other' bar that never fetches", () => {
    const manyRows: FolderActivityActorRow[] = Array.from({ length: 12 }, (_, i) =>
      row({ userEmail: `user${i}@company${i}.com`, userName: `User ${i}`, count: 100 - i }),
    );
    const manyMemberships: MembershipCompanyInput[] = Array.from({ length: 12 }, (_, i) =>
      membership({ email: `user${i}@company${i}.com`, company: `Company ${i}` }),
    );
    const loadFolderBreakdown = vi.fn();
    const { getByTestId } = render(
      <FolderActivityByCompanyChart
        rows={manyRows}
        memberships={manyMemberships}
        selectedProjectIds={["p1"]}
        loadFolderBreakdown={loadFolderBreakdown}
      />,
    );
    const legend = getByTestId("folder-activity-by-company-legend");
    const otherButton = within(legend).getByRole("button", { name: /Other \(2 companies\)/ });
    expect((otherButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(otherButton);
    expect(loadFolderBreakdown).not.toHaveBeenCalled();
  });

  it("shows the live coverage caption and the Unknown-company note, never hardcoded", () => {
    const { getByTestId } = render(
      <FolderActivityByCompanyChart
        rows={rows}
        memberships={memberships}
        selectedProjectIds={["p1"]}
        loadFolderBreakdown={vi.fn()}
        coverage={{ covered: 692, total: 1153 }}
      />,
    );
    expect(getByTestId("folder-activity-coverage-caption").textContent).toContain("692");
    expect(getByTestId("folder-activity-coverage-caption").textContent).toContain("1153");
    expect(getByTestId("folder-activity-unknown-caption").textContent).toMatch(/unknown company/i);
  });
});
