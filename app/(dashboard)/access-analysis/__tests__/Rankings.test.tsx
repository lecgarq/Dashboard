// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
vi.mock("../components/EChart", () => ({ EChart: () => <div data-testid="echart" /> }));
import { Rankings } from "../components/Rankings";

describe("Rankings", () => {
  it("renders three ranking panels", () => {
    const { getAllByTestId, getByText } = render(
      <Rankings
        rankings={{ topProjects: [{ label: "Tower A", value: 2, key: "p1" }], membersPerRole: [], topCompanies: [] }}
        onPickProject={vi.fn()} onPickRole={vi.fn()} onPickCompany={vi.fn()}
      />,
    );
    expect(getAllByTestId("echart")).toHaveLength(3);
    expect(getByText(/Top projects/i)).toBeTruthy();
  });
});
