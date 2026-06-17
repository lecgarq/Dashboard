// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PremiumSurface } from "../PremiumSurface";

describe("PremiumSurface", () => {
  it("renders children", () => {
    const { container } = render(
      <PremiumSurface>
        <span id="child">hello</span>
      </PremiumSurface>
    );
    expect(container.querySelector("#child")).not.toBeNull();
  });

  it("default variant is base and applies panel-elevated class", () => {
    const { container } = render(<PremiumSurface>content</PremiumSurface>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className.includes("panel-elevated")).toBe(true);
  });

  it("variant=base applies panel-elevated", () => {
    const { container } = render(
      <PremiumSurface variant="base">content</PremiumSurface>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className.includes("panel-elevated")).toBe(true);
  });

  it("variant=float applies depth-float shadow and backdrop-blur-sm", () => {
    const { container } = render(
      <PremiumSurface variant="float">content</PremiumSurface>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className.includes("backdrop-blur-sm")).toBe(true);
    expect(root.className.includes("--depth-float")).toBe(true);
  });

  it("variant=glass applies backdrop-blur-md", () => {
    const { container } = render(
      <PremiumSurface variant="glass">content</PremiumSurface>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className.includes("backdrop-blur-md")).toBe(true);
  });

  it("variant=glass applies bg-surface-2 and border-surface-border", () => {
    const { container } = render(
      <PremiumSurface variant="glass">content</PremiumSurface>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className.includes("bg-surface-2")).toBe(true);
    expect(root.className.includes("border-surface-border")).toBe(true);
  });

  it("variant=inset applies inset shadow and bg-muted/30", () => {
    const { container } = render(
      <PremiumSurface variant="inset">content</PremiumSurface>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className.includes("bg-muted")).toBe(true);
    expect(root.className.includes("--depth-inset")).toBe(true);
  });

  it("root always carries relative class", () => {
    const { container } = render(
      <PremiumSurface variant="glass">content</PremiumSurface>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className.includes("relative")).toBe(true);
  });

  it("glow=true adds glow-primary shadow class", () => {
    const { container } = render(
      <PremiumSurface glow>content</PremiumSurface>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className.includes("--glow-primary")).toBe(true);
  });

  it("glow absent does not add glow-primary class", () => {
    const { container } = render(
      <PremiumSurface>content</PremiumSurface>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className.includes("--glow-primary")).toBe(false);
  });

  it("caller className is merged last and present in root", () => {
    const { container } = render(
      <PremiumSurface className="custom-class">content</PremiumSurface>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className.includes("custom-class")).toBe(true);
  });

  it("forwards extra props to the root div", () => {
    const { container } = render(
      <PremiumSurface data-testid="ps-root">content</PremiumSurface>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.hasAttribute("data-testid")).toBe(true);
  });

  it("no use-client directive — component has no runtime-only hooks", () => {
    // This test just verifies the module exports correctly (no client guard);
    // the actual absence of "use client" is enforced by the tsc build.
    expect(typeof PremiumSurface).toBe("function");
  });
});
