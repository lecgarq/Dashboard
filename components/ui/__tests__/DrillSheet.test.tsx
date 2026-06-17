// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import React from "react";

// Stub ResizeObserver — radix-ui Dialog/Portal needs it in jsdom
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// Radix Dialog uses `window.matchMedia` in some environments
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

import { DrillSheet } from "../DrillSheet";

describe("DrillSheet", () => {
  it("renders nothing (content not in DOM) when open=false", () => {
    const { queryByText } = render(
      <DrillSheet open={false} onClose={() => {}}>
        <span>panel-content</span>
      </DrillSheet>
    );
    // When closed, children should not be in the document
    expect(queryByText("panel-content")).toBeNull();
  });

  it("renders children when open=true", () => {
    const { queryByText } = render(
      <DrillSheet open={true} onClose={() => {}}>
        <span>panel-content</span>
      </DrillSheet>
    );
    expect(queryByText("panel-content")).not.toBeNull();
  });

  it("content node carries the w-[480px] width class when open=true", () => {
    const { container } = render(
      <DrillSheet open={true} onClose={() => {}}>
        <span>content</span>
      </DrillSheet>
    );
    // Find the sheet-content element (rendered via Radix portal — may be in document.body)
    const contentEl =
      container.querySelector("[data-slot='sheet-content']") ??
      document.body.querySelector("[data-slot='sheet-content']");
    expect(contentEl).not.toBeNull();
    expect((contentEl as HTMLElement).className.includes("w-[480px]")).toBe(true);
  });

  it("content node carries a right-side slide class when open=true", () => {
    const { container } = render(
      <DrillSheet open={true} onClose={() => {}}>
        <span>content</span>
      </DrillSheet>
    );
    const contentEl =
      container.querySelector("[data-slot='sheet-content']") ??
      document.body.querySelector("[data-slot='sheet-content']");
    expect(contentEl).not.toBeNull();
    const cls = (contentEl as HTMLElement).className;
    // The right-side slide animation classes from sheet.tsx
    expect(
      cls.includes("slide-in-from-right") || cls.includes("slide-out-to-right")
    ).toBe(true);
  });

  it("renders title in a SheetHeader when title is provided", () => {
    const { queryByText } = render(
      <DrillSheet open={true} onClose={() => {}} title="My Panel Title">
        <span>content</span>
      </DrillSheet>
    );
    expect(queryByText("My Panel Title")).not.toBeNull();
  });

  it("does not render a title element when title is omitted", () => {
    const { container } = render(
      <DrillSheet open={true} onClose={() => {}}>
        <span>content</span>
      </DrillSheet>
    );
    const titleEl =
      container.querySelector("[data-slot='sheet-title']") ??
      document.body.querySelector("[data-slot='sheet-title']");
    expect(titleEl).toBeNull();
  });

  it("renders description when description is provided", () => {
    const { queryByText } = render(
      <DrillSheet
        open={true}
        onClose={() => {}}
        title="Title"
        description="Some description"
      >
        <span>content</span>
      </DrillSheet>
    );
    expect(queryByText("Some description")).not.toBeNull();
  });

  it("calls onClose when the built-in close button is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <DrillSheet open={true} onClose={onClose}>
        <span>content</span>
      </DrillSheet>
    );
    // Find the SheetPrimitive.Close button (XIcon button with sr-only "Close" text)
    const closeBtn =
      (container.querySelector("button[data-slot='sheet-close']") as HTMLElement | null) ??
      (container.querySelector("button") as HTMLElement | null) ??
      (document.body.querySelector("button[data-slot='sheet-close']") as HTMLElement | null) ??
      (document.body.querySelector("button") as HTMLElement | null);
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("glass surface — content area carries the glass variant classes", () => {
    const { container } = render(
      <DrillSheet open={true} onClose={() => {}}>
        <span>content</span>
      </DrillSheet>
    );
    // The PremiumSurface glass wrapping the body should carry backdrop-blur-md
    const glassEl =
      container.querySelector(".backdrop-blur-md") ??
      document.body.querySelector(".backdrop-blur-md");
    expect(glassEl).not.toBeNull();
  });

  it("does not export or render page-specific content (empty shell)", () => {
    // Just assert it mounts without crashing and children is the only content seam
    const { queryByText } = render(
      <DrillSheet open={true} onClose={() => {}}>
        <span>only-caller-content</span>
      </DrillSheet>
    );
    expect(queryByText("only-caller-content")).not.toBeNull();
  });
});
