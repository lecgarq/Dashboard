// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NodeTooltip } from "./NodeTooltip";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function feature(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u1::p1",
    nameLower: "ada lovelace",
    emailLower: "ada@example.com",
    project: "Tower A",
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
    activityRecencyBucket: "0-7d",
    permissionTypeSummary: {
      folderBreadth: 42,
      coverage: "known",
      mixedProfile: false,
      fullController: false,
    },
    ...over,
  };
}

describe("NodeTooltip", () => {
  it("shows tier, activity recency, and known folder breadth", () => {
    render(
      <NodeTooltip
        anchorScreenXY={[20, 30]}
        canvasOriginXY={[100, 200]}
        feature={feature()}
      />,
    );
    const tooltip = screen.getByTestId("node-tooltip");
    expect(tooltip.textContent).toContain("Permission tieredit");
    expect(tooltip.textContent).toContain("Activity recency0-7d");
    expect(tooltip.textContent).toContain("Folder breadth42 folders");
    expect(tooltip.getAttribute("style")).toContain("left: 132px");
  });

  it("labels partial breadth and hides unknown permission facts", () => {
    const { rerender } = render(
      <NodeTooltip
        anchorScreenXY={[20, 30]}
        feature={feature({
          permissionCoverage: "partial",
          permissionTypeSummary: {
            folderBreadth: 7,
            coverage: "partial",
            mixedProfile: true,
            fullController: false,
          },
        })}
      />,
    );
    expect(screen.getByTestId("node-tooltip").textContent).toContain("7 folders (partial)");

    rerender(
      <NodeTooltip
        anchorScreenXY={[20, 30]}
        feature={feature({ permissionCoverage: "unknown", permTier: "control" })}
      />,
    );
    const text = screen.getByTestId("node-tooltip").textContent ?? "";
    expect(text.match(/Unavailable/g)).toHaveLength(2);
    expect(text).not.toContain("control");
    expect(text).not.toContain("42 folders");
  });
});
