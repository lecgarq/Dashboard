// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("echarts-for-react", () => ({ default: (props: { option: unknown }) => <div data-testid="echart" data-has-option={!!props.option} /> }));

import { EChart } from "../components/EChart";

describe("EChart", () => {
  it("renders an option", () => {
    const { getByTestId } = render(<EChart option={{ series: [] }} height={200} />);
    expect(getByTestId("echart").getAttribute("data-has-option")).toBe("true");
  });
});
