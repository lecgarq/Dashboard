// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CountTiles } from "../components/CountTiles";

const counts = { users: 3367, projects: 428, access: 16942, roles: 155, companies: 319 };

describe("CountTiles", () => {
  it("renders all five labelled counts with locale formatting", () => {
    const { getByText } = render(<CountTiles counts={counts} projectTotal={1152} />);
    expect(getByText("16,942")).toBeTruthy();
    expect(getByText(/Access/)).toBeTruthy();
    expect(getByText(/of 1,152/)).toBeTruthy();
  });
});
