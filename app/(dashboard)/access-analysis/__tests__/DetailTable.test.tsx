// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DetailTable } from "../components/DetailTable";

const rows = [
  { name: "Ana", email: "a@hermosillo.com", project: "Tower A", role: "Admin", access: "Admin", type: "Internal", company: "Hermosillo", status: "active", addedOn: "2024-01-01" },
  { name: "Bob", email: "b@acme.com", project: "Tower A", role: "Member", access: "Member", type: "External", company: "Acme", status: "pending", addedOn: "2024-02-01" },
];

describe("DetailTable", () => {
  it("renders rows and an export link carrying the filter querystring", () => {
    const { getByText, getByRole } = render(
      <DetailTable rows={rows} total={2} page={0} size={50} onPage={() => {}} exportHref="/api/access-analysis/members?filters=%7B%7D&format=csv" loading={false} />,
    );
    expect(getByText("Ana")).toBeTruthy();
    expect(getByText("Bob")).toBeTruthy();
    expect((getByRole("link", { name: /export/i }) as HTMLAnchorElement).getAttribute("href")).toContain("format=csv");
  });
});
