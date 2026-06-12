// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnimatedExpand, Reveal } from "../animated-list";

describe("animated-list", () => {
  it("AnimatedExpand renders children when open", () => {
    render(<AnimatedExpand open><p>visible body</p></AnimatedExpand>);
    expect(screen.getByText("visible body")).toBeTruthy();
  });

  it("AnimatedExpand renders nothing when closed", () => {
    render(<AnimatedExpand open={false}><p>hidden body</p></AnimatedExpand>);
    expect(screen.queryByText("hidden body")).toBeNull();
  });

  it("Reveal renders its children", () => {
    render(<Reveal><span>panel</span></Reveal>);
    expect(screen.getByText("panel")).toBeTruthy();
  });
});
