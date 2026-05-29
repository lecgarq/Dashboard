// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CatalogCollapse } from "./CatalogCollapse";

describe("CatalogCollapse", () => {
  it("renders children when open", () => {
    render(<CatalogCollapse open={true}><div>child-content</div></CatalogCollapse>);
    expect(screen.queryByText("child-content")).toBeTruthy();
  });
  it("does not render children when closed", () => {
    render(<CatalogCollapse open={false}><div>child-content</div></CatalogCollapse>);
    expect(screen.queryByText("child-content")).toBeNull();
  });
});
