// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoleSimilarityGraph } from "../components/RoleSimilarityGraph";

// Stub ResizeObserver — not available in jsdom
beforeEach(() => {
  if (typeof global.ResizeObserver === "undefined") {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const TWO_NODES = {
  nodes: [
    { roleId: "role-a", roleName: "Project Admin", folderCount: 10, maxRank: 5 },
    { roleId: "role-b", roleName: "Member", folderCount: 5, maxRank: 2 },
  ],
  edges: [{ source: "role-a", target: "role-b", weight: 0.7 }],
};

describe("RoleSimilarityGraph", () => {
  it("renders the empty state when there are no roles", () => {
    render(<RoleSimilarityGraph graph={{ nodes: [], edges: [] }} />);
    expect(screen.getByText(/no roles to compare/i)).toBeTruthy();
  });

  it("fires onNodeClick with the roleId after a press with sub-threshold movement", () => {
    const spy = vi.fn();
    render(<RoleSimilarityGraph graph={TWO_NODES} onNodeClick={spy} />);

    // Each node <g> has data-role-node="{roleId}"
    const nodeEl = document.querySelector("[data-role-node='role-a']");
    expect(nodeEl).toBeTruthy();

    // Simulate a click: pointerdown → pointerup with zero movement
    fireEvent.pointerDown(nodeEl!, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(nodeEl!, { clientX: 100, clientY: 100, pointerId: 1 });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("role-a");
  });

  it("does NOT fire onNodeClick when movement exceeds the drag threshold", () => {
    const spy = vi.fn();
    render(<RoleSimilarityGraph graph={TWO_NODES} onNodeClick={spy} />);

    const nodeEl = document.querySelector("[data-role-node='role-b']");
    expect(nodeEl).toBeTruthy();

    // Simulate a drag: pointerdown → pointermove (large movement) → pointerup
    fireEvent.pointerDown(nodeEl!, { clientX: 100, clientY: 100, pointerId: 1 });
    // Move well beyond CLICK_THRESHOLD_PX (6px)
    fireEvent.pointerMove(nodeEl!, { clientX: 120, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(nodeEl!, { clientX: 120, clientY: 130, pointerId: 1 });

    expect(spy).not.toHaveBeenCalled();
  });
});
