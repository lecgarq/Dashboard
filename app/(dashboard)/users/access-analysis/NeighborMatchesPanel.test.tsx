// @vitest-environment jsdom
/**
 * NeighborMatchesPanel.test.tsx — Phase 30 panel: twin affordance + why chips
 * (SIM-01/SIM-02 UI). Pure presentational contract: normalized payload in,
 * honest chips out; old-shape-equivalent input renders the plain list.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NeighborMatchesPanel } from "./NeighborMatchesPanel";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function snap(nodeId: string, over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId,
    nameLower: nodeId,
    emailLower: `${nodeId}@x.com`,
    userName: `User ${nodeId}`,
    project: `Proj ${nodeId}`,
    role: "Architect",
    permTier: "edit",
    isExternal: false,
    activityBucket: "High",
    signinBucket: "<7d",
    activityCountRaw: 10,
    lastSignInRel: "3d ago",
    permissionCoverage: "known",
    firmName: "ACME",
    accountStatus: "active",
    activityTotal: 100,
    ...over,
  } as NodeFeatureSnapshot;
}

function setup(over: Partial<Parameters<typeof NeighborMatchesPanel>[0]> = {}) {
  const features = [snap("c"), snap("m1"), snap("t1"), snap("t2"), snap("m2")];
  const indexByNodeId = new Map(features.map((f, i) => [f.nodeId, i]));
  const onSelectMatch = vi.fn();
  const props = {
    center: features[0],
    matches: [
      { nodeId: "m1", score: 0.91, why: ["company:ACME", "act:High"] },
      { nodeId: "m2", score: 0.85, why: [] },
    ],
    twins: { count: 5, ids: ["t1", "t2"] },
    indexByNodeId,
    features,
    coverageByDim: new Map([["company", "14,201/22,279"]]),
    onSelectMatch,
    ...over,
  };
  return { ...render(<NeighborMatchesPanel {...props} />), onSelectMatch };
}

describe("NeighborMatchesPanel", () => {
  it("renders the twin chip with the exact count and expands to capped members + overflow", () => {
    const { onSelectMatch } = setup();
    const chip = screen.getByTestId("twin-chip");
    expect(chip.textContent).toContain("5 identical twins");
    expect(screen.queryByTestId("twin-list")).toBeNull();

    fireEvent.click(chip);
    const list = screen.getByTestId("twin-list");
    expect(list.textContent).toContain("User t1 · Proj t1");
    expect(list.textContent).toContain("User t2 · Proj t2");
    expect(list.textContent).toContain("+3 more"); // count 5 - 2 capped ids

    // twin rows re-isolate like matches
    fireEvent.click(screen.getByText("User t1 · Proj t1"));
    expect(onSelectMatch).toHaveBeenCalledWith(2);
  });

  it("renders why chips with resolved labels and coverage suffix", () => {
    setup();
    const panel = screen.getByTestId("neighbor-matches");
    expect(panel.textContent).toContain("Same company: ACME");
    expect(panel.textContent).toContain("14,201/22,279"); // coverage suffix
    expect(panel.textContent).toContain("Similar activity: High");
  });

  it("suppresses permission-derived chips when the center coverage is unknown", () => {
    setup({
      center: snap("c", { permissionCoverage: "unknown" }),
      matches: [{ nodeId: "m1", score: 0.9, why: ["perm:edit", "company:ACME"] }],
    });
    const panel = screen.getByTestId("neighbor-matches");
    expect(panel.textContent).not.toContain("Same permission tier");
    expect(panel.textContent).toContain("Same company: ACME");
  });

  it("renders the plain match list for old-shape-equivalent input (no twins, no why)", () => {
    setup({
      matches: [
        { nodeId: "m1", score: 1, why: [] },
        { nodeId: "m2", score: 0.9, why: [] },
      ],
      twins: { count: 0, ids: [] },
    });
    expect(screen.queryByTestId("twin-chip")).toBeNull();
    expect(screen.getByText("User m1 · Proj m1")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("still re-isolates on match click and renders null when fully empty", () => {
    const { onSelectMatch } = setup();
    fireEvent.click(screen.getByText("User m1 · Proj m1"));
    expect(onSelectMatch).toHaveBeenCalledWith(1);

    const empty = setup({ matches: [], twins: { count: 0, ids: [] } });
    expect(empty.getByTestId("neighbor-matches-empty").textContent).toContain(
      "No distinct matches",
    );
  });

  it("renders honest loading and inline error states without an Open profile action", () => {
    const loading = setup({ status: "loading" });
    expect(loading.getByTestId("neighbor-matches-loading")).toBeTruthy();
    expect(loading.queryByText("Open profile")).toBeNull();
    loading.unmount();

    setup({ status: "error", errorMessage: "Similarity data unavailable." });
    expect(screen.getByTestId("neighbor-matches-error").textContent).toContain(
      "Similarity data unavailable.",
    );
  });
});
