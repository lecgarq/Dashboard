// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterProvider } from "../FilterContext";
import { RiskAccessPanel } from "../RiskAccessPanel";
import type { NodeFeatureSnapshot } from "../interactionTypes";

function node(p: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "a", emailLower: "a@x.com", project: "P", role: "R",
    permTier: null, isExternal: false, activityBucket: "None", signinBucket: "<7d",
    activityCountRaw: 0, lastSignInRel: "", permissionCoverage: "unknown",
    firmName: "", accountStatus: "active", ...p,
  } as NodeFeatureSnapshot;
}

const features = [
  node({ riskFlags: { externalHighPerm: true, staleButActive: false, externalProjectAdmin: false, broadFolderAccess: false, highActivityHighPerm: false }, moduleSignature: ["build"] }),
];

function mount() {
  return render(<FilterProvider><RiskAccessPanel features={features} /></FilterProvider>);
}

describe("RiskAccessPanel", () => {
  it("renders a row + live count badge per risk flag", () => {
    mount();
    expect(screen.getByTestId("risk-facet-externalHighPerm")).toBeTruthy();
    expect(screen.getByTestId("risk-count-externalHighPerm").textContent).toBe("1");
    expect(screen.getByTestId("risk-count-staleButActive").textContent).toBe("0");
  });

  it("toggles a risk facet on click (aria-pressed flips)", () => {
    mount();
    const btn = screen.getByTestId("risk-facet-externalHighPerm");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("lists modules present in the data", () => {
    mount();
    expect(screen.getByTestId("module-facet-build")).toBeTruthy();
  });
});
